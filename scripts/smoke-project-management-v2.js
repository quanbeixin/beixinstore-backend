#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path')
const dotenv = require('dotenv')

const backendRoot = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

const pool = require('../utils/db')
const Work = require('../models/Work')
const Workflow = require('../models/Workflow')

const REQUIRED_NOTIFICATION_SCENES = [
  'node_assign',
  'node_reject',
  'task_assign',
  'task_deadline',
  'task_complete',
  'node_complete',
]

function toBool(value) {
  return value === true || value === 1 || value === '1'
}

async function safeRun(name, fn) {
  const startedAt = Date.now()
  try {
    const data = await fn()
    return {
      name,
      ok: true,
      duration_ms: Date.now() - startedAt,
      data,
    }
  } catch (error) {
    return {
      name,
      ok: false,
      duration_ms: Date.now() - startedAt,
      error: error?.message || String(error),
    }
  }
}

async function main() {
  const checks = []

  checks.push(
    await safeRun('db_health', async () => {
      const [rows] = await pool.query('SELECT 1 AS ok')
      return { ok: Number(rows?.[0]?.ok || 0) === 1 }
    }),
  )

  checks.push(
    await safeRun('project_templates.list', async () => {
      const result = await Work.listProjectTemplates({ page: 1, pageSize: 10 })
      const rows = Array.isArray(result?.rows) ? result.rows : []
      return {
        total: Number(result?.total || 0),
        page_size: rows.length,
        sample_ids: rows.slice(0, 3).map((item) => Number(item.id)).filter((id) => Number.isInteger(id) && id > 0),
      }
    }),
  )

  checks.push(
    await safeRun('project_templates.find_by_id', async () => {
      const listResult = await Work.listProjectTemplates({ page: 1, pageSize: 1 })
      const first = Array.isArray(listResult?.rows) ? listResult.rows[0] : null
      if (!first?.id) {
        return { skipped: true, reason: 'project_templates 表暂无数据' }
      }
      const detail = await Work.findProjectTemplateById(first.id)
      return {
        id: Number(first.id),
        found: Boolean(detail),
        has_name: Boolean(String(detail?.name || '').trim()),
        node_count: Array.isArray(detail?.node_config)
          ? detail.node_config.length
          : detail?.node_config && typeof detail.node_config === 'object'
            ? Object.keys(detail.node_config).length
            : 0,
      }
    }),
  )

  checks.push(
    await safeRun('notification_configs.list', async () => {
      const rows = await Work.listNotificationConfigs()
      const scenes = (rows || []).map((item) => String(item?.scene || '').trim()).filter(Boolean)
      const sceneSet = new Set(scenes)
      const missingScenes = REQUIRED_NOTIFICATION_SCENES.filter((scene) => !sceneSet.has(scene))
      return {
        count: rows.length,
        scenes,
        required_scene_complete: missingScenes.length === 0,
        missing_scenes: missingScenes,
      }
    }),
  )

  checks.push(
    await safeRun('notification_configs.find_task_deadline', async () => {
      const row = await Work.findNotificationConfigByScene('task_deadline')
      return {
        found: Boolean(row),
        enabled: toBool(row?.enabled),
        advance_days: Number(row?.advance_days || 0),
      }
    }),
  )

  checks.push(
    await safeRun('permissions.project_management_v2', async () => {
      const [rows] = await pool.query(
        `SELECT p.permission_code, COUNT(DISTINCT rp.role_id) AS role_count
         FROM permissions p
         LEFT JOIN role_permissions rp ON rp.permission_id = p.id
         WHERE p.permission_code IN (
           'project.template.view',
           'project.template.manage',
           'notification.config.view',
           'notification.config.manage'
         )
         GROUP BY p.permission_code
         ORDER BY p.permission_code ASC`,
      )

      return {
        count: rows.length,
        rows: rows.map((item) => ({
          permission_code: item.permission_code,
          role_count: Number(item.role_count || 0),
        })),
      }
    }),
  )

  checks.push(
    await safeRun('demands.members.list', async () => {
      const [rows] = await pool.query(
        `SELECT id
         FROM work_demands
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
      )
      const demandId = String(rows?.[0]?.id || '').trim()
      if (!demandId) {
        return { skipped: true, reason: 'work_demands 表暂无数据' }
      }
      const members = await Work.listDemandMembers(demandId)
      return {
        demand_id: demandId,
        member_count: members.length,
      }
    }),
  )

  checks.push(
    await safeRun('archive_demands.list', async () => {
      const result = await Work.listArchivedDemands({ page: 1, pageSize: 3 })
      const rows = Array.isArray(result?.rows) ? result.rows : []
      const first = rows[0] || null
      return {
        total: Number(result?.total || 0),
        page_size: rows.length,
        first_row_keys: first ? Object.keys(first) : [],
      }
    }),
  )

  checks.push(
    await safeRun('archive_demands.restore_guard', async () => {
      const [rows] = await pool.query(
        `SELECT id
         FROM work_demands
         WHERE status <> 'CANCELLED'
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
      )
      const demandId = String(rows?.[0]?.id || '').trim()
      if (!demandId) {
        return { skipped: true, reason: '不存在可用于恢复守卫检查的非归档需求' }
      }

      try {
        await Work.restoreArchivedDemand(demandId)
        throw new Error('restore_guard_failed_unexpected_success')
      } catch (error) {
        if (error?.code !== 'DEMAND_NOT_ARCHIVED') {
          throw error
        }
        return {
          demand_id: demandId,
          guarded: true,
          code: error.code || null,
        }
      }
    }),
  )

  checks.push(
    await safeRun('workflow.reject.guard', async () => {
      try {
        await Workflow.rejectCurrentNode({
          demandId: 'REQ_SMOKE_GUARD',
          operatorUserId: 1,
          rejectReason: '',
        })
        throw new Error('workflow_reject_guard_failed_unexpected_success')
      } catch (error) {
        if (error?.code !== 'REJECT_REASON_REQUIRED') {
          throw error
        }
        return {
          guarded: true,
          code: error.code || null,
        }
      }
    }),
  )

  checks.push(
    await safeRun('workflow.collaborator.guard', async () => {
      try {
        await Workflow.addTaskCollaborator({
          demandId: 'REQ_SMOKE_GUARD',
          taskId: 1,
          collaboratorUserId: null,
          operatorUserId: 1,
        })
        throw new Error('workflow_collaborator_guard_failed_unexpected_success')
      } catch (error) {
        if (error?.code !== 'COLLABORATOR_USER_ID_INVALID') {
          throw error
        }
        return {
          guarded: true,
          code: error.code || null,
        }
      }
    }),
  )

  const failed = checks.filter((item) => !item.ok)
  const summary = {
    success: failed.length === 0,
    check_count: checks.length,
    failed_count: failed.length,
    failed_checks: failed.map((item) => item.name),
    checked_at: new Date().toISOString(),
  }

  console.log(JSON.stringify({ summary, checks }, null, 2))

  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          summary: {
            success: false,
            check_count: 0,
            failed_count: 1,
            failed_checks: ['smoke_runtime'],
            checked_at: new Date().toISOString(),
          },
          error: error?.message || String(error),
        },
        null,
        2,
      ),
    )
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await pool.end()
    } catch {
      // ignore pool close errors to keep final exit code from the checks
    }
  })
