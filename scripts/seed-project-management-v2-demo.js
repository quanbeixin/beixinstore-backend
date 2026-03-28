#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path')
const dotenv = require('dotenv')

const backendRoot = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

const pool = require('../utils/db')

const DEFAULT_TEMPLATE_NAME = '项目管理V2演示模板'
const DEFAULT_DOC_LINK = 'https://example.com/prd/project-management-v2-demo'
const VALID_HEALTH_VALUES = new Set(['green', 'yellow', 'red'])

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function toDemandId(value) {
  const raw = String(value || '').trim().toUpperCase()
  return raw || ''
}

function parseArgs(argv) {
  const result = {
    bind: false,
    demandId: '',
    templateName: DEFAULT_TEMPLATE_NAME,
    docLink: DEFAULT_DOC_LINK,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim()
    if (!arg) continue

    if (arg === '--bind') {
      result.bind = true
      continue
    }
    if (arg === '--demand') {
      result.demandId = toDemandId(argv[i + 1] || '')
      i += 1
      continue
    }
    if (arg === '--template-name') {
      const next = String(argv[i + 1] || '').trim()
      if (next) result.templateName = next.slice(0, 100)
      i += 1
      continue
    }
    if (arg === '--doc-link') {
      const next = String(argv[i + 1] || '').trim()
      if (next) result.docLink = next.slice(0, 500)
      i += 1
      continue
    }
  }

  return result
}

async function ensureDemoTemplate(templateName) {
  const [rows] = await pool.query(
    `SELECT
       id,
       name,
       node_config,
       status,
       DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM project_templates
     WHERE name = ?
     ORDER BY id DESC
     LIMIT 1`,
    [templateName],
  )

  if (rows[0]) {
    return {
      id: Number(rows[0].id),
      name: rows[0].name,
      created: false,
      status: Number(rows[0].status) === 1 ? 1 : 0,
      updated_at: rows[0].updated_at || null,
    }
  }

  const nodeConfig = [
    {
      node_key: 'PLAN',
      node_name: '需求评审',
      node_type: 'REVIEW',
      phase_key: 'plan',
      sort_order: 1,
    },
    {
      node_key: 'DEV',
      node_name: '开发实现',
      node_type: 'EXECUTE',
      phase_key: 'develop',
      sort_order: 2,
    },
    {
      node_key: 'TEST',
      node_name: '测试验收',
      node_type: 'QA',
      phase_key: 'test',
      sort_order: 3,
    },
    {
      node_key: 'RELEASE',
      node_name: '发布上线',
      node_type: 'RELEASE',
      phase_key: 'release',
      sort_order: 4,
    },
  ]

  const [insertResult] = await pool.query(
    `INSERT INTO project_templates (name, description, node_config, status)
     VALUES (?, ?, CAST(? AS JSON), 1)`,
    [
      templateName,
      '用于项目管理体系联调的演示模板（自动生成，可按需编辑）',
      JSON.stringify(nodeConfig),
    ],
  )

  return {
    id: Number(insertResult.insertId),
    name: templateName,
    created: true,
    status: 1,
    updated_at: null,
  }
}

async function findTargetDemand(explicitDemandId) {
  const targetDemandId = toDemandId(explicitDemandId)
  if (targetDemandId) {
    const [rows] = await pool.query(
      `SELECT id, owner_user_id, project_manager, health_status
       FROM work_demands
       WHERE id = ?
       LIMIT 1`,
      [targetDemandId],
    )
    return rows[0] || null
  }

  const [rows] = await pool.query(
    `SELECT id, owner_user_id, project_manager, health_status
     FROM work_demands
     WHERE status IN ('TODO', 'IN_PROGRESS')
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
  )
  if (rows[0]) return rows[0]

  const [fallbackRows] = await pool.query(
    `SELECT id, owner_user_id, project_manager, health_status
     FROM work_demands
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
  )
  return fallbackRows[0] || null
}

async function findAnyUserId() {
  const [rows] = await pool.query(
    `SELECT id
     FROM users
     ORDER BY id ASC
     LIMIT 1`,
  )
  return toPositiveInt(rows?.[0]?.id)
}

async function findSecondUserId(excludeUserId) {
  const excluded = toPositiveInt(excludeUserId)
  if (!excluded) return null

  const [rows] = await pool.query(
    `SELECT id
     FROM users
     WHERE id <> ?
     ORDER BY id ASC
     LIMIT 1`,
    [excluded],
  )
  return toPositiveInt(rows?.[0]?.id)
}

async function bindDemandWithTemplate({ templateId, demand, docLink }) {
  const demandId = toDemandId(demand?.id)
  if (!demandId) {
    return {
      skipped: true,
      reason: '未找到可绑定的需求',
    }
  }

  const ownerUserId = toPositiveInt(demand?.owner_user_id)
  const fallbackUserId = await findAnyUserId()
  const projectManagerId = ownerUserId || fallbackUserId
  if (!projectManagerId) {
    return {
      skipped: true,
      reason: 'users 表暂无可用用户，无法绑定项目负责人',
      demand_id: demandId,
      template_id: templateId,
    }
  }

  const healthRaw = String(demand?.health_status || '').trim().toLowerCase()
  const healthStatus = VALID_HEALTH_VALUES.has(healthRaw) ? healthRaw : 'green'
  const optionalMemberId = await findSecondUserId(projectManagerId)

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [updateResult] = await conn.query(
      `UPDATE work_demands
       SET
         management_mode = 'advanced',
         template_id = ?,
         project_manager = ?,
         health_status = ?,
         doc_link = CASE
           WHEN doc_link IS NULL OR TRIM(doc_link) = '' THEN ?
           ELSE doc_link
         END
       WHERE id = ?`,
      [templateId, projectManagerId, healthStatus, docLink, demandId],
    )

    await conn.query(
      `INSERT INTO project_members (demand_id, user_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [demandId, projectManagerId],
    )

    if (optionalMemberId) {
      await conn.query(
        `INSERT INTO project_members (demand_id, user_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        [demandId, optionalMemberId],
      )
    }

    const [[memberCountRow]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM project_members
       WHERE demand_id = ?`,
      [demandId],
    )

    await conn.commit()
    return {
      skipped: false,
      demand_id: demandId,
      template_id: templateId,
      project_manager: projectManagerId,
      member_count: Number(memberCountRow?.total || 0),
      affected_rows: Number(updateResult?.affectedRows || 0),
    }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const template = await ensureDemoTemplate(args.templateName)
  const result = {
    success: true,
    mode: args.bind ? 'bind' : 'seed_only',
    template,
    demand_binding: {
      skipped: true,
      reason: '未启用 --bind，已跳过需求绑定',
    },
  }

  if (args.bind) {
    const demand = await findTargetDemand(args.demandId)
    result.demand_binding = await bindDemandWithTemplate({
      templateId: template.id,
      demand,
      docLink: args.docLink,
    })
  }

  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          success: false,
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
      // ignore close errors
    }
  })
