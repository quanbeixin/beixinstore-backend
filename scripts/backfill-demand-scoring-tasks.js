#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path')
const dotenv = require('dotenv')

const backendRoot = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

const pool = require('../utils/db')
const DemandScoring = require('../models/DemandScoring')

const FORCE_REBUILD =
  process.argv.includes('--force-rebuild') || String(process.env.FORCE_REBUILD || '').trim() === 'true'
const PURGE_INELIGIBLE =
  process.argv.includes('--purge-ineligible') || String(process.env.PURGE_INELIGIBLE || '').trim() === 'true'

async function listEligibleDemands() {
  const [rows] = await pool.query(
    `SELECT
       d.id,
       d.name,
       DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS expected_release_date,
       DATE_FORMAT(d.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
       ROUND(
         COALESCE(
           d.overall_actual_hours,
           (
             SELECT
               COALESCE(
                 SUM(
                   CASE
                     WHEN UPPER(TRIM(COALESCE(wl.log_status, 'IN_PROGRESS'))) <> 'CANCELLED'
                       THEN COALESCE(wl.actual_hours, 0)
                     ELSE 0
                   END
                 ),
                 0
               )
             FROM work_logs wl
             WHERE wl.demand_id COLLATE utf8mb4_unicode_ci = d.id COLLATE utf8mb4_unicode_ci
           ),
           0
         ),
         1
       ) AS scoring_actual_hours
     FROM work_demands d
     WHERE d.status = 'DONE'
       AND DATE(COALESCE(d.completed_at, d.updated_at, d.created_at)) >= ?
     HAVING scoring_actual_hours > 0
     ORDER BY COALESCE(d.completed_at, d.updated_at, d.created_at) ASC, d.id ASC`,
    [DemandScoring.SCORING_COMPLETED_CUTOFF_DATE],
  )
  return rows
}

async function listTaskDemandIds() {
  const [rows] = await pool.query(
    `SELECT DISTINCT demand_id
     FROM demand_score_tasks
     ORDER BY demand_id ASC`,
  )
  return rows
    .map((row) => String(row?.demand_id || '').trim().toUpperCase())
    .filter(Boolean)
}

async function getTaskSummary(demandId) {
  const [rows] = await pool.query(
    `SELECT
       t.id,
       t.status,
       t.result_ready,
       COUNT(DISTINCT sub.id) AS subject_count,
       COUNT(DISTINCT slot.id) AS slot_count
     FROM demand_score_tasks t
     LEFT JOIN demand_score_subjects sub ON sub.task_id = t.id
     LEFT JOIN demand_score_slots slot ON slot.task_id = t.id
     WHERE t.demand_id = ?
     GROUP BY t.id
     LIMIT 1`,
    [String(demandId || '').trim().toUpperCase()],
  )
  return rows[0] || null
}

async function main() {
  const demands = await listEligibleDemands()
  const results = []
  const eligibleDemandIdSet = new Set(
    demands.map((demand) => String(demand?.id || '').trim().toUpperCase()).filter(Boolean),
  )

  for (const demand of demands) {
    try {
      const ensureResult = await DemandScoring.ensureTaskForDemand(demand.id, {
        operatorUserId: 1,
        forceRebuild: FORCE_REBUILD,
      })
      const summary = await getTaskSummary(demand.id)
      results.push({
        demand_id: demand.id,
        demand_name: demand.name,
        expected_release_date: demand.expected_release_date,
        completed_at: demand.completed_at,
        scoring_actual_hours: Number(demand?.scoring_actual_hours || 0),
        created: Boolean(ensureResult?.created),
        rebuilt: Boolean(ensureResult?.rebuilt),
        task_id: Number(summary?.id || ensureResult?.task_id || 0),
        task_status: summary?.status || '',
        result_ready: Number(summary?.result_ready || 0),
        subject_count: Number(summary?.subject_count || 0),
        slot_count: Number(summary?.slot_count || 0),
      })
    } catch (error) {
      results.push({
        demand_id: demand.id,
        demand_name: demand.name,
        expected_release_date: demand.expected_release_date,
        completed_at: demand.completed_at,
        scoring_actual_hours: Number(demand?.scoring_actual_hours || 0),
        error_code: error?.code || 'UNKNOWN',
        error_message: error?.message || String(error),
      })
    }
  }

  const purgedTasks = []
  if (PURGE_INELIGIBLE) {
    const existingTaskDemandIds = await listTaskDemandIds()
    for (const demandId of existingTaskDemandIds) {
      if (eligibleDemandIdSet.has(demandId)) continue
      try {
        const purgeResult = await DemandScoring.purgeTaskByDemand(demandId)
        purgedTasks.push({
          demand_id: demandId,
          ...purgeResult,
        })
      } catch (error) {
        purgedTasks.push({
          demand_id: demandId,
          deleted: false,
          error_code: error?.code || 'UNKNOWN',
          error_message: error?.message || String(error),
        })
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        force_rebuild: FORCE_REBUILD,
        purge_ineligible: PURGE_INELIGIBLE,
        demand_count: demands.length,
        results,
        purged_task_count: purgedTasks.filter((item) => item.deleted).length,
        purged_tasks: purgedTasks,
      },
      null,
      2,
    ),
  )
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error)
    process.exit(1)
  })
