#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path')
const dotenv = require('dotenv')

const backendRoot = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

const pool = require('../utils/db')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : 0
}

function hasArg(flag) {
  return process.argv.slice(2).includes(flag)
}

async function getSummary(conn) {
  const [[totalRow]] = await conn.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN COALESCE(log_status, 'IN_PROGRESS') = 'TODO' THEN 1 ELSE 0 END) AS todo_count,
       SUM(CASE WHEN COALESCE(log_status, 'IN_PROGRESS') = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress_count,
       SUM(CASE WHEN COALESCE(log_status, 'IN_PROGRESS') = 'DONE' THEN 1 ELSE 0 END) AS done_count,
       SUM(CASE WHEN COALESCE(log_status, 'IN_PROGRESS') = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_count
     FROM work_logs
     WHERE task_source = 'WORKFLOW_AUTO'`,
  )

  const [latestRows] = await conn.query(
    `SELECT
       id,
       user_id,
       demand_id,
       phase_key,
       description,
       relate_task_id,
       COALESCE(log_status, 'IN_PROGRESS') AS log_status,
       DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
     FROM work_logs
     WHERE task_source = 'WORKFLOW_AUTO'
     ORDER BY id DESC
     LIMIT 10`,
  )

  return {
    total: toPositiveInt(totalRow?.total),
    todo_count: toPositiveInt(totalRow?.todo_count),
    in_progress_count: toPositiveInt(totalRow?.in_progress_count),
    done_count: toPositiveInt(totalRow?.done_count),
    cancelled_count: toPositiveInt(totalRow?.cancelled_count),
    latest_rows: latestRows || [],
  }
}

async function main() {
  const apply = hasArg('--apply')
  const conn = await pool.getConnection()

  try {
    const before = await getSummary(conn)
    console.log('[workflow_auto_worklogs][before]')
    console.log(JSON.stringify(before, null, 2))

    if (!apply) {
      console.log('Dry-run finished. Use "--apply" to delete these rows.')
      return
    }

    await conn.beginTransaction()
    const [deleteResult] = await conn.query(
      `DELETE FROM work_logs
       WHERE task_source = 'WORKFLOW_AUTO'`,
    )
    const deletedRows = Number(deleteResult?.affectedRows || 0)
    await conn.commit()

    const after = await getSummary(conn)
    console.log('[workflow_auto_worklogs][after]')
    console.log(JSON.stringify(after, null, 2))
    console.log(
      JSON.stringify(
        {
          ok: true,
          deleted_rows: deletedRows,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    try {
      await conn.rollback()
    } catch (_) {
      // ignore rollback error
    }
    console.error('[workflow_auto_worklogs][error]', error?.stack || error?.message || String(error))
    process.exitCode = 1
  } finally {
    conn.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error('[workflow_auto_worklogs][fatal]', error?.stack || error?.message || String(error))
  process.exit(1)
})
