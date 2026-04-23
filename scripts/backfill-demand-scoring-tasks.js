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

async function listEligibleDemands() {
  const [rows] = await pool.query(
    `SELECT
       id,
       name,
       DATE_FORMAT(expected_release_date, '%Y-%m-%d') AS expected_release_date,
       DATE_FORMAT(completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at
     FROM work_demands
     WHERE status = 'DONE'
       AND DATE(COALESCE(completed_at, updated_at, created_at)) >= ?
     ORDER BY COALESCE(completed_at, updated_at, created_at) ASC, id ASC`,
    [DemandScoring.SCORING_COMPLETED_CUTOFF_DATE],
  )
  return rows
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
        error_code: error?.code || 'UNKNOWN',
        error_message: error?.message || String(error),
      })
    }
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        force_rebuild: FORCE_REBUILD,
        demand_count: demands.length,
        results,
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
