#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path')
const dotenv = require('dotenv')

const backendRoot = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

const pool = require('../utils/db')
const Workflow = require('../models/Workflow')

const APPLY = process.argv.includes('--apply') || String(process.env.APPLY || '').trim() === 'true'
const TARGET_STATUS_CODES = ['IN_DEVELOPMENT', 'TESTING']

function toPositiveInt(value) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

async function listTargetDemands() {
  const [rows] = await pool.query(
    `SELECT
       mp.id AS package_id,
       mp.package_name,
       mp.status_code,
       d.id AS demand_id,
       d.owner_user_id,
       i.id AS instance_id,
       i.current_node_key
     FROM matrix_packages mp
     INNER JOIN work_demands d
       ON d.id = mp.linked_demand_id
     INNER JOIN project_templates pt
       ON pt.id = d.template_id
      AND pt.name = '矩阵包生产流程'
     INNER JOIN wf_process_instances i
       ON i.biz_type = 'DEMAND'
      AND i.biz_id = d.id
      AND i.status = 'IN_PROGRESS'
     WHERE mp.deleted_at IS NULL
       AND mp.status_code IN (?, ?)
       AND d.status <> 'CANCELLED'
     ORDER BY mp.id ASC, i.id DESC`,
    TARGET_STATUS_CODES,
  )

  const seen = new Set()
  return (rows || []).filter((row) => {
    const demandId = String(row?.demand_id || '').trim().toUpperCase()
    if (!demandId || seen.has(demandId)) return false
    seen.add(demandId)
    return true
  })
}

async function main() {
  const targets = await listTargetDemands()
  console.log(`[INFO] matrix package production workflow targets: ${targets.length}`)
  if (!APPLY) {
    console.table(
      targets.map((item) => ({
        package_id: item.package_id,
        package_name: item.package_name,
        status_code: item.status_code,
        demand_id: item.demand_id,
        current_node_key: item.current_node_key,
      })),
    )
    console.log('[DRY-RUN] pass --apply to rebuild workflows')
    return
  }

  let successCount = 0
  let failedCount = 0
  for (const target of targets) {
    try {
      const result = await Workflow.replaceDemandWorkflowWithLatestTemplate({
        demandId: target.demand_id,
        operatorUserId: toPositiveInt(target.owner_user_id) || null,
      })
      successCount += 1
      console.log('[OK]', {
        demand_id: target.demand_id,
        package_id: target.package_id,
        package_name: target.package_name,
        migrated_done_node_count: result?.migration_summary?.migrated_done_node_count || 0,
        current_node_key: result?.workflow?.current_node?.node_key || null,
      })
    } catch (error) {
      failedCount += 1
      console.warn('[FAIL]', {
        demand_id: target.demand_id,
        package_id: target.package_id,
        package_name: target.package_name,
        message: error?.message || String(error || ''),
      })
    }
  }

  console.log(`[DONE] rebuilt=${successCount}, failed=${failedCount}`)
}

main()
  .catch((error) => {
    console.error('[ERROR]', error?.message || error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
