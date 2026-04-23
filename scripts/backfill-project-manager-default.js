#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path')
const dotenv = require('dotenv')

const backendRoot = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

const pool = require('../utils/db')
const DemandScoring = require('../models/DemandScoring')

const DEFAULT_PROJECT_MANAGER_USER_ID = 1
const PROJECT_MANAGER_ROLE_KEY = 'PROJECT_MANAGER'

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function parseJsonValue(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeRoleList(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? parseJsonValue(value, [])
      : []

  return Array.from(
    new Set(
      (Array.isArray(source) ? source : [])
        .map((item) =>
          String(item || '')
            .trim()
            .replace(/\s+/g, '_')
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  )
}

function normalizeRoleUserMap(value) {
  const source = parseJsonValue(value, {})
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}

  const result = {}
  Object.entries(source).forEach(([roleKey, userIdsRaw]) => {
    const normalizedRole = String(roleKey || '')
      .trim()
      .replace(/\s+/g, '_')
      .toUpperCase()
    if (!normalizedRole) return

    const normalizedUserIds = Array.from(
      new Set(
        (Array.isArray(userIdsRaw) ? userIdsRaw : [userIdsRaw])
          .map((item) => toPositiveInt(item))
          .filter(Boolean),
      ),
    )
    if (normalizedUserIds.length > 0) {
      result[normalizedRole] = normalizedUserIds
    }
  })
  return result
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => JSON.parse(stableStringify(item))))
  }
  if (value && typeof value === 'object') {
    const next = {}
    Object.keys(value)
      .sort()
      .forEach((key) => {
        next[key] = JSON.parse(stableStringify(value[key]))
      })
    return JSON.stringify(next)
  }
  return JSON.stringify(value)
}

async function ensureDefaultProjectManagerUserExists() {
  const [rows] = await pool.query(
    `SELECT id, COALESCE(NULLIF(real_name, ''), username) AS name
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [DEFAULT_PROJECT_MANAGER_USER_ID],
  )
  return rows[0] || null
}

async function backfillDemandRows() {
  const [rows] = await pool.query(
    `SELECT
       id,
       owner_user_id,
       project_manager,
       participant_roles_json,
       participant_role_user_map_json,
       DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM work_demands
     ORDER BY id ASC`,
  )

  const conn = await pool.getConnection()
  let changedCount = 0
  try {
    await conn.beginTransaction()

    for (const row of rows) {
      const nextRoles = normalizeRoleList(row.participant_roles_json)
      if (!nextRoles.includes(PROJECT_MANAGER_ROLE_KEY)) {
        nextRoles.push(PROJECT_MANAGER_ROLE_KEY)
      }

      const nextRoleUserMap = normalizeRoleUserMap(row.participant_role_user_map_json)
      nextRoleUserMap[PROJECT_MANAGER_ROLE_KEY] = [DEFAULT_PROJECT_MANAGER_USER_ID]

      const currentRoles = normalizeRoleList(row.participant_roles_json)
      const currentRoleUserMap = normalizeRoleUserMap(row.participant_role_user_map_json)

      const shouldUpdate =
        Number(row.project_manager || 0) !== DEFAULT_PROJECT_MANAGER_USER_ID ||
        stableStringify(currentRoles) !== stableStringify(nextRoles) ||
        stableStringify(currentRoleUserMap) !== stableStringify(nextRoleUserMap)

      if (!shouldUpdate) continue

      await conn.query(
        `UPDATE work_demands
         SET project_manager = ?,
             participant_roles_json = CAST(? AS JSON),
             participant_role_user_map_json = CAST(? AS JSON),
             updated_at = ?
         WHERE id = ?`,
        [
          DEFAULT_PROJECT_MANAGER_USER_ID,
          JSON.stringify(nextRoles),
          JSON.stringify(nextRoleUserMap),
          row.updated_at,
          row.id,
        ],
      )
      changedCount += 1
    }

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }

  return {
    totalCount: rows.length,
    changedCount,
  }
}

async function rebuildDemandScoringTasks() {
  try {
    const [rows] = await pool.query(
      `SELECT demand_id
       FROM demand_score_tasks
       ORDER BY id ASC`,
    )

    let rebuiltCount = 0
    const skipped = []
    for (const row of rows) {
      const demandId = String(row.demand_id || '').trim()
      if (!demandId) continue
      try {
        await DemandScoring.ensureTaskForDemand(demandId, {
          operatorUserId: DEFAULT_PROJECT_MANAGER_USER_ID,
          forceRebuild: true,
        })
        rebuiltCount += 1
      } catch (error) {
        skipped.push({
          demand_id: demandId,
          code: error?.code || 'UNKNOWN',
          message: error?.message || String(error),
        })
      }
    }

    return {
      taskCount: rows.length,
      rebuiltCount,
      skipped,
    }
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return {
        taskCount: 0,
        rebuiltCount: 0,
        skipped: [],
        skippedReason: '评分表不存在，已跳过评分任务重建',
      }
    }
    throw error
  }
}

async function main() {
  const defaultProjectManagerUser = await ensureDefaultProjectManagerUserExists()
  if (!defaultProjectManagerUser) {
    throw new Error(`默认项目管理用户不存在: id=${DEFAULT_PROJECT_MANAGER_USER_ID}`)
  }

  const demandResult = await backfillDemandRows()
  const scoringResult = await rebuildDemandScoringTasks()

  console.log(
    JSON.stringify(
      {
        success: true,
        default_project_manager_user: defaultProjectManagerUser,
        demand_backfill: demandResult,
        scoring_rebuild: scoringResult,
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
