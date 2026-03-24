const pool = require('../utils/db')

const DEMAND_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']
const DEMAND_PRIORITIES = ['P0', 'P1', 'P2', 'P3']
const WORK_LOG_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE']
const WORK_LOG_TASK_SOURCES = ['SELF', 'OWNER_ASSIGN', 'WORKFLOW_AUTO']
const DEMAND_PHASE_DICT_KEY = 'demand_phase_type'
const ISSUE_TYPE_DICT_KEY = 'issue_type'
const BUSINESS_GROUP_DICT_KEY = 'business_group'
const OWNER_ESTIMATE_RULES = ['NONE', 'OPTIONAL', 'REQUIRED']
const TRUE_LIKE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on'])

const ITEM_TYPE_LOOKUP_SQL = `
  SELECT
    CAST(i.id AS SIGNED) AS id,
    i.item_code AS type_key,
    i.item_name AS name,
    i.enabled AS enabled,
    i.sort_order AS sort_order,
    CASE
      WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(i.extra_json, '$.require_demand')), '')) IN ('1', 'true', 'yes', 'y', 'on')
        THEN 1
      WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(i.extra_json, '$.requireDemand')), '')) IN ('1', 'true', 'yes', 'y', 'on')
        THEN 1
      ELSE 0
    END AS require_demand,
    CASE UPPER(COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(i.extra_json, '$.owner_estimate_rule')),
      JSON_UNQUOTE(JSON_EXTRACT(i.extra_json, '$.ownerEstimateRule')),
      'NONE'
    ))
      WHEN 'OPTIONAL' THEN 'OPTIONAL'
      WHEN 'REQUIRED' THEN 'REQUIRED'
      ELSE 'NONE'
    END AS owner_estimate_rule
  FROM config_dict_items i
  INNER JOIN config_dict_types t ON t.type_key = i.type_key
  WHERE i.type_key = '${ISSUE_TYPE_DICT_KEY}' AND t.enabled = 1
  UNION ALL
  SELECT
    w.id AS id,
    w.type_key AS type_key,
    w.name AS name,
    w.enabled AS enabled,
    w.sort_order AS sort_order,
    w.require_demand AS require_demand,
    'NONE' AS owner_estimate_rule
  FROM work_item_types w
  WHERE NOT EXISTS (
    SELECT 1
    FROM config_dict_items i2
    INNER JOIN config_dict_types t2 ON t2.type_key = i2.type_key
    WHERE i2.type_key = '${ISSUE_TYPE_DICT_KEY}' AND t2.enabled = 1
  )
`

const PHASE_OWNER_DEPARTMENT_ID_SQL = `CAST(NULLIF(COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(pdi.extra_json, '$.owner_department_id')),
  JSON_UNQUOTE(JSON_EXTRACT(pdi.extra_json, '$.ownerDepartmentId')),
  ''
), '') AS UNSIGNED)`

const PHASE_OWNER_ESTIMATE_REQUIRED_SQL = `CASE
  WHEN LOWER(COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(pdi.extra_json, '$.owner_estimate_required')),
    JSON_UNQUOTE(JSON_EXTRACT(pdi.extra_json, '$.ownerEstimateRequired')),
    ''
  )) IN ('1', 'true', 'yes', 'y', 'on')
    THEN 1
  ELSE 0
END`

const OWNER_ESTIMATE_REQUIRED_BY_LOG_SQL = `CASE
  WHEN l.demand_id IS NOT NULL AND COALESCE(NULLIF(l.phase_key, ''), '') <> '' THEN
    CASE
      WHEN ${PHASE_OWNER_DEPARTMENT_ID_SQL} IS NOT NULL AND ${PHASE_OWNER_DEPARTMENT_ID_SQL} > 0
        THEN ${PHASE_OWNER_ESTIMATE_REQUIRED_SQL}
      ELSE 1
    END
  WHEN COALESCE(t.owner_estimate_rule, 'NONE') = 'NONE' THEN 0
  ELSE 1
END`

const EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL = `CASE
  WHEN ${OWNER_ESTIMATE_REQUIRED_BY_LOG_SQL} = 1 THEN COALESCE(l.owner_estimate_hours, 0)
  ELSE COALESCE(l.actual_hours, 0)
END`

const DEFAULT_DAILY_CAPACITY_HOURS = Number.isFinite(Number(process.env.DAILY_CAPACITY_HOURS))
  ? Math.max(1, Number(process.env.DAILY_CAPACITY_HOURS))
  : 8

let ensureDailyTablesPromise = null
let isDailyTablesReady = false

function normalizeStatus(value) {
  const status = String(value || 'TODO').trim().toUpperCase()
  return DEMAND_STATUSES.includes(status) ? status : 'TODO'
}

function normalizePriority(value) {
  const priority = String(value || 'P2').trim().toUpperCase()
  return DEMAND_PRIORITIES.includes(priority) ? priority : 'P2'
}

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeDecimal(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Number(num.toFixed(1))
}

function normalizeTaskSource(value, fallback = 'SELF') {
  const source = String(value || fallback).trim().toUpperCase()
  return WORK_LOG_TASK_SOURCES.includes(source) ? source : fallback
}

function isMissingColumnError(err) {
  return err && err.code === 'ER_BAD_FIELD_ERROR'
}

function isMissingTableError(err) {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146)
}

function parseExtraJson(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  if (typeof raw !== 'string') return null

  try {
    return JSON.parse(raw)
  } catch (err) {
    return null
  }
}

function parseRequireDemand(extraJson, fallback = 0) {
  if (!extraJson || typeof extraJson !== 'object') return fallback

  const candidates = [
    extraJson.require_demand,
    extraJson.requireDemand,
    extraJson.need_demand,
    extraJson.needDemand,
  ]

  for (const item of candidates) {
    if (item === undefined || item === null) continue
    const normalized = String(item).trim().toLowerCase()
    if (TRUE_LIKE_VALUES.has(normalized)) return 1
    if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return 0
  }

  return fallback
}

function normalizeOwnerEstimateRule(value, fallback = 'NONE') {
  const rule = String(value || '').trim().toUpperCase()
  if (OWNER_ESTIMATE_RULES.includes(rule)) return rule
  return fallback
}

function parseOwnerEstimateRule(extraJson, fallback = 'NONE') {
  if (!extraJson || typeof extraJson !== 'object') return fallback
  const candidates = [extraJson.owner_estimate_rule, extraJson.ownerEstimateRule]
  for (const item of candidates) {
    if (item === undefined || item === null) continue
    return normalizeOwnerEstimateRule(item, fallback)
  }
  return fallback
}

function mapIssueTypeDictRow(row) {
  const extraJson = parseExtraJson(row.extra_json)
  return {
    id: Number(row.id),
    type_key: row.item_code,
    name: row.item_name,
    require_demand: parseRequireDemand(extraJson, 0),
    owner_estimate_rule: parseOwnerEstimateRule(extraJson, 'NONE'),
    enabled: Number(row.enabled) === 1 ? 1 : 0,
    sort_order: Number(row.sort_order) || 0,
  }
}

async function generateDemandId(conn) {
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING(id, 4) AS UNSIGNED)) AS max_no
     FROM work_demands
     WHERE id REGEXP '^REQ[0-9]+$'`,
  )

  const nextNo = Number(row?.max_no || 0) + 1
  return `REQ${String(nextNo).padStart(3, '0')}`
}

function normalizeUserIds(rows) {
  return rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0)
}

async function listActiveUserIds() {
  const [rows] = await pool.query(
    `SELECT u.id
     FROM users u
     WHERE COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
       AND COALESCE(u.include_in_metrics, 1) = 1
     ORDER BY u.id ASC`,
  )
  return normalizeUserIds(rows)
}

async function listManagedDepartmentRows(managerUserId) {
  const [rows] = await pool.query(
    `SELECT d.id, d.name
     FROM departments d
     WHERE d.manager_user_id = ?
       AND COALESCE(d.enabled, 1) = 1
     ORDER BY d.sort_order ASC, d.id ASC`,
    [managerUserId],
  )
  return rows || []
}

async function findUserDepartmentRow(userId) {
  const [rows] = await pool.query(
    `SELECT d.id, d.name
     FROM users u
     LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.id = ?
     LIMIT 1`,
    [userId],
  )

  const row = rows[0] || null
  const departmentId = toPositiveInt(row?.id)
  if (!departmentId) return null
  return {
    id: departmentId,
    name: row?.name || `部门#${departmentId}`,
  }
}

async function listEnabledDepartments() {
  const [rows] = await pool.query(
    `SELECT d.id, d.name
     FROM departments d
     WHERE COALESCE(d.enabled, 1) = 1
     ORDER BY d.sort_order ASC, d.id ASC`,
  )
  return (rows || []).map((row) => ({
    id: Number(row.id),
    name: row.name || `部门#${Number(row.id)}`,
  }))
}

function buildMorningTabKey(departmentId) {
  const id = toPositiveInt(departmentId)
  return id ? `dept-${id}` : ''
}

function parseMorningTabKey(tabKey) {
  const raw = String(tabKey || '').trim().toLowerCase()
  if (raw === 'all') return { type: 'ALL', departmentId: null }
  if (!raw.startsWith('dept-')) return { type: 'UNKNOWN', departmentId: null }

  const departmentId = toPositiveInt(raw.slice(5))
  if (!departmentId) return { type: 'UNKNOWN', departmentId: null }
  return { type: 'DEPARTMENT', departmentId }
}

async function ensureDailyTables() {
  if (isDailyTablesReady) return
  if (ensureDailyTablesPromise) {
    await ensureDailyTablesPromise
    return
  }

  ensureDailyTablesPromise = (async () => {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS work_log_daily_plans (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         log_id BIGINT UNSIGNED NOT NULL,
         user_id BIGINT UNSIGNED NOT NULL,
         plan_date DATE NOT NULL,
         planned_hours DECIMAL(6,1) NOT NULL DEFAULT 0.0,
         source VARCHAR(32) NOT NULL DEFAULT 'SYSTEM_SPLIT',
         note VARCHAR(500) NULL,
         created_by BIGINT UNSIGNED NULL,
         created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         UNIQUE KEY uk_work_log_daily_plan_log_date (log_id, plan_date),
         KEY idx_work_log_daily_plan_user_date (user_id, plan_date),
         KEY idx_work_log_daily_plan_date (plan_date)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )

    await pool.query(
      `CREATE TABLE IF NOT EXISTS work_log_daily_entries (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         log_id BIGINT UNSIGNED NOT NULL,
         user_id BIGINT UNSIGNED NOT NULL,
         entry_date DATE NOT NULL,
         actual_hours DECIMAL(6,1) NOT NULL DEFAULT 0.0,
         description VARCHAR(2000) NULL,
         created_by BIGINT UNSIGNED NULL,
         created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         KEY idx_work_log_daily_entry_user_date (user_id, entry_date),
         KEY idx_work_log_daily_entry_log_date (log_id, entry_date)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )

    isDailyTablesReady = true
  })()

  try {
    await ensureDailyTablesPromise
  } finally {
    ensureDailyTablesPromise = null
  }
}

function normalizeDateOnly(value) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  return text
}

function buildDateRange(startDate, endDate) {
  const start = normalizeDateOnly(startDate)
  const end = normalizeDateOnly(endDate)
  if (!start) return []

  const startObj = new Date(`${start}T00:00:00`)
  const endObj = end ? new Date(`${end}T00:00:00`) : new Date(`${start}T00:00:00`)
  if (Number.isNaN(startObj.getTime()) || Number.isNaN(endObj.getTime())) return [start]
  if (endObj < startObj) return [start]

  const result = []
  const cursor = new Date(startObj)
  let guard = 0
  while (cursor <= endObj && guard < 366) {
    result.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
    guard += 1
  }
  return result.length > 0 ? result : [start]
}

function splitHoursAcrossDates(totalHours, dateCount) {
  const total = Math.max(0, Number(normalizeDecimal(totalHours, 0) || 0))
  const count = Math.max(1, Number(dateCount || 1))
  const totalTicks = Math.round(total * 10)
  const baseTicks = Math.floor(totalTicks / count)
  const remainderTicks = Math.max(0, totalTicks - baseTicks * count)

  return Array.from({ length: count }).map((_, index) => {
    const ticks = baseTicks + (index < remainderTicks ? 1 : 0)
    return Number((ticks / 10).toFixed(1))
  })
}

function getTodayPlannedHoursSql(dateExpr = 'CURDATE()') {
  return `COALESCE(pt.today_planned_hours, CASE
    WHEN l.expected_start_date IS NOT NULL
      AND l.expected_start_date <= ${dateExpr}
      AND (l.expected_completion_date IS NULL OR l.expected_completion_date >= ${dateExpr})
    THEN CASE
      WHEN l.expected_completion_date IS NOT NULL
        AND l.expected_completion_date >= l.expected_start_date
      THEN ROUND(
        COALESCE(l.personal_estimate_hours, 0) /
        NULLIF(DATEDIFF(l.expected_completion_date, l.expected_start_date) + 1, 0),
        1
      )
      ELSE COALESCE(l.personal_estimate_hours, 0)
    END
    ELSE 0
  END)`
}

function getTodayActualHoursSql() {
  return `COALESCE(et.today_actual_hours, CASE
    WHEN l.log_date = CURDATE() THEN COALESCE(l.actual_hours, 0)
    ELSE 0
  END)`
}

async function resolveOwnerScope(ownerUserId, { isSuperAdmin = false } = {}) {
  if (isSuperAdmin) {
    const teamMemberIds = await listActiveUserIds()
    return {
      scope_type: 'ALL',
      department_id: null,
      department_name: null,
      scope_label: '全部部门',
      team_member_ids: teamMemberIds,
      managed_department_ids: [],
      managed_department_names: [],
    }
  }

  const managedDepartments = await listManagedDepartmentRows(ownerUserId)
  if (managedDepartments.length === 0) {
    return {
      scope_type: 'MANAGED_DEPARTMENTS',
      department_id: null,
      department_name: null,
      scope_label: '未负责部门',
      team_member_ids: [],
      managed_department_ids: [],
      managed_department_names: [],
    }
  }

  const managedDepartmentIds = managedDepartments
    .map((item) => Number(item.id))
    .filter((id) => Number.isInteger(id) && id > 0)
  const managedDepartmentNames = managedDepartments.map((item) => item.name).filter(Boolean)

  const [rows] = await pool.query(
    `SELECT u.id
     FROM users u
     WHERE u.department_id IN (?)
       AND COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
       AND COALESCE(u.include_in_metrics, 1) = 1
     ORDER BY u.id ASC`,
    [managedDepartmentIds],
  )

  const teamMemberIds = normalizeUserIds(rows)
  const isSingleDepartment = managedDepartmentIds.length === 1
  const departmentId = isSingleDepartment ? managedDepartmentIds[0] : null
  const departmentName = isSingleDepartment ? managedDepartmentNames[0] || null : null

  return {
    scope_type: 'MANAGED_DEPARTMENTS',
    department_id: departmentId,
    department_name: departmentName,
    scope_label: isSingleDepartment
      ? departmentName || `部门#${departmentId}`
      : `${managedDepartmentIds.length}个负责部门`,
    team_member_ids: teamMemberIds,
    managed_department_ids: managedDepartmentIds,
    managed_department_names: managedDepartmentNames,
  }
}

function isOwnerEstimateTargetRow(
  row,
  {
    isSuperAdmin = false,
    managedDepartmentIds = [],
    teamMemberIds = [],
  } = {},
) {
  const managedSet = new Set((managedDepartmentIds || []).map((id) => Number(id)))
  const teamSet = new Set((teamMemberIds || []).map((id) => Number(id)))

  const isDemandLinked = Boolean(row?.demand_id)
  const hasPhaseKey = Boolean(String(row?.phase_key || '').trim())
  const phaseOwnerDepartmentId = toPositiveInt(row?.phase_owner_department_id)
  const phaseOwnerEstimateRequired = Number(row?.phase_owner_estimate_required || 0) === 1
  const issueTypeOwnerEstimateRule = normalizeOwnerEstimateRule(row?.owner_estimate_rule, 'NONE')
  const rowUserId = toPositiveInt(row?.user_id)

  if (isDemandLinked && hasPhaseKey && phaseOwnerDepartmentId) {
    if (!phaseOwnerEstimateRequired) return false
    if (isSuperAdmin) return true
    return managedSet.has(phaseOwnerDepartmentId)
  }

  if (isDemandLinked && hasPhaseKey) {
    if (isSuperAdmin) return true
    if (!rowUserId) return false
    return teamSet.has(rowUserId)
  }

  if (issueTypeOwnerEstimateRule === 'NONE') return false
  if (isSuperAdmin) return true
  if (!rowUserId) return false
  return teamSet.has(rowUserId)
}

function toDecimal1(value) {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return 0
  return Number(num.toFixed(1))
}

function toPercent2(value) {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return 0
  return Number(num.toFixed(2))
}

function calcVarianceRate(actualHours, estimateHours) {
  const actual = Number(actualHours || 0)
  const estimate = Number(estimateHours || 0)
  if (!Number.isFinite(actual) || !Number.isFinite(estimate) || estimate <= 0) return null
  return toPercent2(((actual - estimate) / estimate) * 100)
}

function parseDateOnlyAtLocalMidnight(value) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const date = new Date(`${text}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function calcCrossDayProgress({
  logStatus,
  expectedStartDate,
  expectedCompletionDate,
  todayDate,
  personalEstimateHours,
  cumulativeActualHours,
} = {}) {
  const status = String(logStatus || '').trim().toUpperCase()
  if (status !== 'IN_PROGRESS') {
    return {
      progress_show: false,
      progress_percent: null,
      expected_progress_percent: null,
      progress_risk: false,
      progress_gap_percent: null,
    }
  }

  const start = parseDateOnlyAtLocalMidnight(expectedStartDate)
  const end = parseDateOnlyAtLocalMidnight(expectedCompletionDate)
  const today = parseDateOnlyAtLocalMidnight(todayDate)
  if (!start || !end || !today || end <= start) {
    return {
      progress_show: false,
      progress_percent: null,
      expected_progress_percent: null,
      progress_risk: false,
      progress_gap_percent: null,
    }
  }

  const msPerDay = 24 * 60 * 60 * 1000
  const totalDays = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1
  if (totalDays <= 1) {
    return {
      progress_show: false,
      progress_percent: null,
      expected_progress_percent: null,
      progress_risk: false,
      progress_gap_percent: null,
    }
  }

  let elapsedDays = Math.floor((today.getTime() - start.getTime()) / msPerDay) + 1
  if (!Number.isFinite(elapsedDays)) elapsedDays = 0
  elapsedDays = Math.max(0, Math.min(totalDays, elapsedDays))

  const expectedProgress = toPercent2((elapsedDays / totalDays) * 100)
  const estimateHours = Number(personalEstimateHours || 0)
  const actualHours = Number(cumulativeActualHours || 0)
  let actualProgress = 0
  if (Number.isFinite(estimateHours) && estimateHours > 0 && Number.isFinite(actualHours)) {
    actualProgress = toPercent2(Math.max(0, Math.min(100, (actualHours / estimateHours) * 100)))
  }

  const gap = toPercent2(expectedProgress - actualProgress)
  const risk = gap > 10

  return {
    progress_show: true,
    progress_percent: actualProgress,
    expected_progress_percent: expectedProgress,
    progress_risk: risk,
    progress_gap_percent: gap,
  }
}

function calcDateDiffDays(fromDate, toDate) {
  const from = parseDateOnlyAtLocalMidnight(fromDate)
  const to = parseDateOnlyAtLocalMidnight(toDate)
  if (!from || !to) return null
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((to.getTime() - from.getTime()) / msPerDay)
}

function buildDemandInsightWhere({
  startDate,
  endDate,
  departmentId = null,
  businessGroupCode = '',
  ownerUserId = null,
  memberUserId = null,
  keyword = '',
} = {}) {
  const conditions = [
    'l.demand_id IS NOT NULL',
    "COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'",
    'COALESCE(u.include_in_metrics, 1) = 1',
    'l.log_date >= ?',
    'l.log_date <= ?',
  ]
  const params = [startDate, endDate]

  if (departmentId) {
    conditions.push('u.department_id = ?')
    params.push(departmentId)
  }

  if (businessGroupCode) {
    conditions.push('d.business_group_code = ?')
    params.push(businessGroupCode)
  }

  if (ownerUserId) {
    conditions.push('d.owner_user_id = ?')
    params.push(ownerUserId)
  }

  if (memberUserId) {
    conditions.push('l.user_id = ?')
    params.push(memberUserId)
  }

  if (keyword) {
    conditions.push(
      `(l.demand_id LIKE ? OR COALESCE(d.name, '') LIKE ? OR COALESCE(pdi.item_name, l.phase_key, '') LIKE ? OR COALESCE(NULLIF(u.real_name, ''), u.username) LIKE ?)`,
    )
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }

  return {
    whereSql: conditions.join(' AND '),
    params,
  }
}

function buildMemberInsightWhere({
  startDate,
  endDate,
  departmentId = null,
  businessGroupCode = '',
  ownerUserId = null,
  memberUserId = null,
  keyword = '',
} = {}) {
  const conditions = [
    "COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'",
    'COALESCE(u.include_in_metrics, 1) = 1',
    'l.log_date >= ?',
    'l.log_date <= ?',
  ]
  const params = [startDate, endDate]

  if (departmentId) {
    conditions.push('u.department_id = ?')
    params.push(departmentId)
  }

  if (businessGroupCode) {
    conditions.push('d.business_group_code = ?')
    params.push(businessGroupCode)
  }

  if (ownerUserId) {
    conditions.push('d.owner_user_id = ?')
    params.push(ownerUserId)
  }

  if (memberUserId) {
    conditions.push('l.user_id = ?')
    params.push(memberUserId)
  }

  if (keyword) {
    conditions.push(
      `(COALESCE(NULLIF(u.real_name, ''), u.username) LIKE ? OR COALESCE(d.name, '') LIKE ? OR COALESCE(l.demand_id, '') LIKE ? OR COALESCE(l.description, '') LIKE ?)`,
    )
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }

  return {
    whereSql: conditions.join(' AND '),
    params,
  }
}

const Work = {
  DEMAND_STATUSES,
  DEMAND_PRIORITIES,
  WORK_LOG_STATUSES,
  WORK_LOG_TASK_SOURCES,

  async isDepartmentManager(userId) {
    const rows = await listManagedDepartmentRows(userId)
    return rows.length > 0
  },

  async canManageAssigneeByOwner(ownerUserId, assigneeUserId, { isSuperAdmin = false } = {}) {
    const targetUserId = toPositiveInt(assigneeUserId)
    if (!targetUserId) return false
    if (isSuperAdmin) return true

    const scope = await resolveOwnerScope(ownerUserId, { isSuperAdmin: false })
    const teamMemberIds = Array.isArray(scope.team_member_ids) ? scope.team_member_ids : []
    if (teamMemberIds.includes(targetUserId)) return true

    const managedDepartmentIds = Array.isArray(scope.managed_department_ids)
      ? scope.managed_department_ids
      : []
    if (managedDepartmentIds.length === 0) return false

    const targetDepartment = await findUserDepartmentRow(targetUserId)
    return managedDepartmentIds.includes(Number(targetDepartment?.id))
  },

  async listIssueTypeDictItems({ enabledOnly = true } = {}) {
    const whereEnabled = enabledOnly ? 'AND i.enabled = 1' : ''
    const [rows] = await pool.query(
      `SELECT
         i.id,
         i.item_code,
         i.item_name,
         i.enabled,
         i.sort_order,
         i.extra_json
       FROM config_dict_items i
       INNER JOIN config_dict_types t ON t.type_key = i.type_key
       WHERE i.type_key = ? AND t.enabled = 1 ${whereEnabled}
       ORDER BY i.sort_order ASC, i.id ASC`,
      [ISSUE_TYPE_DICT_KEY],
    )
    return rows.map(mapIssueTypeDictRow)
  },

  async findIssueTypeDictItemById(id) {
    const [rows] = await pool.query(
      `SELECT
         i.id,
         i.item_code,
         i.item_name,
         i.enabled,
         i.sort_order,
         i.extra_json
       FROM config_dict_items i
       INNER JOIN config_dict_types t ON t.type_key = i.type_key
       WHERE i.type_key = ? AND i.id = ? AND t.enabled = 1
       LIMIT 1`,
      [ISSUE_TYPE_DICT_KEY, id],
    )
    return rows[0] ? mapIssueTypeDictRow(rows[0]) : null
  },

  async hasIssueTypeDictItems() {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM config_dict_items i
       INNER JOIN config_dict_types t ON t.type_key = i.type_key
       WHERE i.type_key = ? AND t.enabled = 1`,
      [ISSUE_TYPE_DICT_KEY],
    )
    return Number(row?.total || 0) > 0
  },

  async findBusinessGroupByCode(code, { enabledOnly = true } = {}) {
    const whereEnabled = enabledOnly ? 'AND i.enabled = 1' : ''
    const [rows] = await pool.query(
      `SELECT
         i.id,
         i.item_code,
         i.item_name,
         i.enabled,
         i.sort_order
       FROM config_dict_items i
       INNER JOIN config_dict_types t ON t.type_key = i.type_key
       WHERE i.type_key = ?
         AND i.item_code = ?
         AND t.enabled = 1
         ${whereEnabled}
       LIMIT 1`,
      [BUSINESS_GROUP_DICT_KEY, code],
    )
    return rows[0] || null
  },

  async findDemandPhaseTypeByKey(phaseKey, { enabledOnly = true } = {}) {
    const whereEnabled = enabledOnly ? 'AND i.enabled = 1' : ''
    const [rows] = await pool.query(
      `SELECT
         i.id,
         i.item_code,
         i.item_name,
         i.enabled,
         i.sort_order
       FROM config_dict_items i
       INNER JOIN config_dict_types t ON t.type_key = i.type_key
       WHERE i.type_key = ?
         AND i.item_code = ?
         AND t.enabled = 1
         ${whereEnabled}
       LIMIT 1`,
      [DEMAND_PHASE_DICT_KEY, phaseKey],
    )
    return rows[0] || null
  },

  async listItemTypes({ enabledOnly = true } = {}) {
    const dictRows = await this.listIssueTypeDictItems({ enabledOnly })
    if (dictRows.length > 0) {
      return dictRows
    }

    const sql = enabledOnly
      ? `SELECT id, type_key, name, require_demand, enabled, sort_order, 'NONE' AS owner_estimate_rule
         FROM work_item_types
         WHERE enabled = 1
         ORDER BY sort_order ASC, id ASC`
      : `SELECT id, type_key, name, require_demand, enabled, sort_order, 'NONE' AS owner_estimate_rule
         FROM work_item_types
         ORDER BY enabled DESC, sort_order ASC, id ASC`

    const [rows] = await pool.query(sql)
    return rows
  },

  async listDemandPhaseTypes({ enabledOnly = true } = {}) {
    const whereEnabled = enabledOnly ? 'AND i.enabled = 1' : ''
    const [rows] = await pool.query(
      `SELECT
         i.item_code AS phase_key,
         i.item_name AS phase_name,
         i.sort_order,
         i.enabled
       FROM config_dict_items i
       INNER JOIN config_dict_types t ON t.type_key = i.type_key
       WHERE i.type_key = ? AND t.enabled = 1 ${whereEnabled}
       ORDER BY i.sort_order ASC, i.id ASC`,
      [DEMAND_PHASE_DICT_KEY],
    )
    return rows
  },

  async findItemTypeById(id) {
    const dictItem = await this.findIssueTypeDictItemById(id)
    if (dictItem) {
      return dictItem
    }

    const hasDictItems = await this.hasIssueTypeDictItems()
    if (hasDictItems) {
      return null
    }

    const [rows] = await pool.query(
      `SELECT id, type_key, name, require_demand, enabled, sort_order, 'NONE' AS owner_estimate_rule
       FROM work_item_types
       WHERE id = ?`,
      [id],
    )
    return rows[0] || null
  },

  async createItemType({ typeKey, name, requireDemand = 0, enabled = 1, sortOrder = 0 }) {
    const [result] = await pool.query(
      `INSERT INTO work_item_types (type_key, name, require_demand, enabled, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [typeKey, name, requireDemand, enabled, sortOrder],
    )
    return result.insertId
  },

  async listDemands({
    page = 1,
    pageSize = 10,
    keyword = '',
    status = '',
    priority = '',
    priorityOrder = '',
    businessGroupCode = '',
    ownerUserId = null,
    updatedStartDate = '',
    updatedEndDate = '',
    mineUserId = null,
  } = {}) {
    const offset = (page - 1) * pageSize
    const conditions = ['1 = 1']
    const params = []

    if (keyword) {
      conditions.push('(d.id LIKE ? OR d.name LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`)
    }

    if (status) {
      conditions.push('d.status = ?')
      params.push(normalizeStatus(status))
    }

    if (priority) {
      conditions.push('d.priority = ?')
      params.push(normalizePriority(priority))
    }

    if (businessGroupCode) {
      conditions.push('d.business_group_code = ?')
      params.push(businessGroupCode)
    }

    if (ownerUserId) {
      conditions.push('d.owner_user_id = ?')
      params.push(ownerUserId)
    }

    if (updatedStartDate) {
      conditions.push('d.updated_at >= ?')
      params.push(`${updatedStartDate} 00:00:00`)
    }

    if (updatedEndDate) {
      conditions.push('d.updated_at < DATE_ADD(?, INTERVAL 1 DAY)')
      params.push(updatedEndDate)
    }

    if (mineUserId) {
      conditions.push(
        `(d.owner_user_id = ? OR EXISTS (
          SELECT 1 FROM work_logs mwl WHERE mwl.demand_id = d.id AND mwl.user_id = ?
        ))`,
      )
      params.push(mineUserId, mineUserId)
    }

    const whereSql = conditions.join(' AND ')
    const normalizedPriorityOrder = String(priorityOrder || '').trim().toLowerCase() === 'desc' ? 'DESC' : 'ASC'
    const listSql = `
      SELECT
        d.id,
        d.name,
        d.owner_user_id,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS owner_name,
        d.business_group_code,
        bg.item_name AS business_group_name,
        DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS expected_release_date,
        d.status,
        d.priority,
        d.description,
        d.created_by,
        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
        DATE_FORMAT(d.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
        COALESCE(ta.total_personal_estimate_hours, 0) AS total_personal_estimate_hours,
        COALESCE(ta.total_actual_hours, 0) AS total_actual_hours,
        COALESCE(lr.remaining_hours, 0) AS latest_remaining_hours
      FROM work_demands d
      LEFT JOIN users u ON u.id = d.owner_user_id
      LEFT JOIN config_dict_items bg
        ON bg.type_key = '${BUSINESS_GROUP_DICT_KEY}'
       AND bg.item_code = d.business_group_code
      LEFT JOIN (
        SELECT
          demand_id,
          SUM(personal_estimate_hours) AS total_personal_estimate_hours,
          SUM(actual_hours) AS total_actual_hours
        FROM work_logs
        WHERE demand_id IS NOT NULL
        GROUP BY demand_id
      ) ta ON ta.demand_id = d.id
      LEFT JOIN (
        SELECT l1.demand_id, l1.remaining_hours
        FROM work_logs l1
        INNER JOIN (
          SELECT demand_id, MAX(id) AS max_id
          FROM work_logs
          WHERE demand_id IS NOT NULL
          GROUP BY demand_id
        ) l2 ON l1.id = l2.max_id
      ) lr ON lr.demand_id = d.id
      WHERE ${whereSql}
      ORDER BY
        CASE d.priority
          WHEN 'P0' THEN 0
          WHEN 'P1' THEN 1
          WHEN 'P2' THEN 2
          ELSE 3
        END ${normalizedPriorityOrder},
        d.updated_at DESC
      LIMIT ? OFFSET ?`

    const [rows] = await pool.query(listSql, [...params, pageSize, offset])
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM work_demands d
       WHERE ${whereSql}`,
      params,
    )

    return { rows, total }
  },

  async findDemandById(id) {
    const [rows] = await pool.query(
      `SELECT
         d.id,
         d.name,
         d.owner_user_id,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS owner_name,
         d.business_group_code,
         bg.item_name AS business_group_name,
         DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS expected_release_date,
         d.status,
         d.priority,
         d.description,
         d.created_by,
         DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
         DATE_FORMAT(d.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at
       FROM work_demands d
       LEFT JOIN users u ON u.id = d.owner_user_id
       LEFT JOIN config_dict_items bg
         ON bg.type_key = '${BUSINESS_GROUP_DICT_KEY}'
        AND bg.item_code = d.business_group_code
       WHERE d.id = ?`,
      [id],
    )
    return rows[0] || null
  },

  async createDemand({
    demandId = '',
    name,
    ownerUserId,
    businessGroupCode = null,
    expectedReleaseDate = null,
    status = 'TODO',
    priority = 'P2',
    description = '',
    createdBy = null,
  }) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const finalDemandId = demandId || (await generateDemandId(conn))
      await conn.query(
        `INSERT INTO work_demands (
          id, name, owner_user_id, business_group_code, expected_release_date, status, priority, description, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalDemandId,
          name,
          ownerUserId,
          businessGroupCode || null,
          expectedReleaseDate || null,
          normalizeStatus(status),
          normalizePriority(priority),
          description || null,
          createdBy,
        ],
      )

      await conn.commit()
      return finalDemandId
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async updateDemand(
    demandId,
    {
      name,
      ownerUserId,
      businessGroupCode = null,
      expectedReleaseDate = null,
      status,
      priority,
      description,
      completedAt,
    },
  ) {
    const [result] = await pool.query(
      `UPDATE work_demands
       SET
         name = ?,
         owner_user_id = ?,
         business_group_code = ?,
         expected_release_date = ?,
         status = ?,
         priority = ?,
         description = ?,
         completed_at = ?
       WHERE id = ?`,
      [
        name,
        ownerUserId,
        businessGroupCode || null,
        expectedReleaseDate || null,
        normalizeStatus(status),
        normalizePriority(priority),
        description || null,
        completedAt || null,
        demandId,
      ],
    )
    return result.affectedRows
  },

  async countLogsByDemandId(demandId) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM work_logs
       WHERE demand_id = ?`,
      [demandId],
    )
    return Number(row?.total || 0)
  },

  async deleteDemand(demandId) {
    const relatedLogCount = await this.countLogsByDemandId(demandId)

    if (relatedLogCount > 0) {
      const [result] = await pool.query(
        `UPDATE work_demands
         SET
           status = 'CANCELLED',
           completed_at = COALESCE(completed_at, NOW())
         WHERE id = ?`,
        [demandId],
      )
      return {
        mode: 'ARCHIVED',
        affected_rows: Number(result?.affectedRows || 0),
        related_log_count: relatedLogCount,
      }
    }

    const [result] = await pool.query('DELETE FROM work_demands WHERE id = ?', [demandId])
    return {
      mode: 'DELETED',
      affected_rows: Number(result?.affectedRows || 0),
      related_log_count: 0,
    }
  },

  async listArchivedDemands({
    page = 1,
    pageSize = 10,
    keyword = '',
    ownerUserId = null,
    archivedStartDate = '',
    archivedEndDate = '',
  } = {}) {
    const offset = (page - 1) * pageSize
    const conditions = ['d.status = ?']
    const params = ['CANCELLED']

    if (keyword) {
      conditions.push('(d.id LIKE ? OR d.name LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`)
    }

    if (ownerUserId) {
      conditions.push('d.owner_user_id = ?')
      params.push(ownerUserId)
    }

    if (archivedStartDate) {
      conditions.push('d.completed_at >= ?')
      params.push(`${archivedStartDate} 00:00:00`)
    }

    if (archivedEndDate) {
      conditions.push('d.completed_at < DATE_ADD(?, INTERVAL 1 DAY)')
      params.push(archivedEndDate)
    }

    const whereSql = conditions.join(' AND ')
    const baseSelectSql = `
      SELECT
        d.id,
        d.name,
        d.owner_user_id,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS owner_name,
        d.business_group_code,
        bg.item_name AS business_group_name,
        d.status,
        DATE_FORMAT(d.completed_at, '%Y-%m-%d %H:%i:%s') AS archived_at,
        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
        COALESCE(lc.related_log_count, 0) AS related_log_count`
    const fromSql = `
      FROM work_demands d
      LEFT JOIN users u ON u.id = d.owner_user_id
      LEFT JOIN config_dict_items bg
        ON bg.type_key = '${BUSINESS_GROUP_DICT_KEY}'
       AND bg.item_code = d.business_group_code
      LEFT JOIN (
        SELECT demand_id, COUNT(*) AS related_log_count
        FROM work_logs
        WHERE demand_id IS NOT NULL
        GROUP BY demand_id
      ) lc ON lc.demand_id = d.id`

    const listSqlWithWorkflow = `
      ${baseSelectSql},
        COALESCE(wi.related_workflow_instance_count, 0) AS related_workflow_instance_count
      ${fromSql}
      LEFT JOIN (
        SELECT biz_id, COUNT(*) AS related_workflow_instance_count
        FROM wf_process_instances
        WHERE biz_type = 'DEMAND'
        GROUP BY biz_id
      ) wi ON wi.biz_id = d.id
      WHERE ${whereSql}
      ORDER BY d.completed_at DESC, d.updated_at DESC, d.id DESC
      LIMIT ? OFFSET ?`

    const listSqlWithoutWorkflow = `
      ${baseSelectSql},
        0 AS related_workflow_instance_count
      ${fromSql}
      WHERE ${whereSql}
      ORDER BY d.completed_at DESC, d.updated_at DESC, d.id DESC
      LIMIT ? OFFSET ?`

    let rows = []
    try {
      ;[rows] = await pool.query(listSqlWithWorkflow, [...params, pageSize, offset])
    } catch (err) {
      if (!isMissingTableError(err)) throw err
      ;[rows] = await pool.query(listSqlWithoutWorkflow, [...params, pageSize, offset])
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM work_demands d
       WHERE ${whereSql}`,
      params,
    )

    return { rows, total }
  },

  async purgeArchivedDemand(demandId) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [demandRows] = await conn.query(
        `SELECT id, status
         FROM work_demands
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [demandId],
      )
      const demand = demandRows[0] || null

      if (!demand) {
        const err = new Error('demand_not_found')
        err.code = 'DEMAND_NOT_FOUND'
        throw err
      }

      if (String(demand.status || '').toUpperCase() !== 'CANCELLED') {
        const err = new Error('demand_not_archived')
        err.code = 'DEMAND_NOT_ARCHIVED'
        throw err
      }

      const stats = {
        demand_id: demandId,
        deleted_work_logs: 0,
        deleted_demand_phases: 0,
        deleted_workflow_instances: 0,
        deleted_workflow_nodes: 0,
        deleted_workflow_tasks: 0,
        deleted_workflow_actions: 0,
        deleted_demands: 0,
      }

      const [logResult] = await conn.query('DELETE FROM work_logs WHERE demand_id = ?', [demandId])
      stats.deleted_work_logs = Number(logResult?.affectedRows || 0)

      try {
        const [phaseResult] = await conn.query('DELETE FROM work_demand_phases WHERE demand_id = ?', [demandId])
        stats.deleted_demand_phases = Number(phaseResult?.affectedRows || 0)
      } catch (err) {
        if (!isMissingTableError(err)) throw err
      }

      let workflowInstanceIds = []
      try {
        const [instanceRows] = await conn.query(
          `SELECT id
           FROM wf_process_instances
           WHERE biz_type = 'DEMAND' AND biz_id = ?
           FOR UPDATE`,
          [demandId],
        )
        workflowInstanceIds = (instanceRows || [])
          .map((item) => Number(item.id))
          .filter((id) => Number.isInteger(id) && id > 0)
      } catch (err) {
        if (!isMissingTableError(err)) throw err
      }

      if (workflowInstanceIds.length > 0) {
        const placeholders = workflowInstanceIds.map(() => '?').join(', ')

        const [actionResult] = await conn.query(
          `DELETE FROM wf_process_actions WHERE instance_id IN (${placeholders})`,
          workflowInstanceIds,
        )
        stats.deleted_workflow_actions = Number(actionResult?.affectedRows || 0)

        const [taskResult] = await conn.query(
          `DELETE FROM wf_process_tasks WHERE instance_id IN (${placeholders})`,
          workflowInstanceIds,
        )
        stats.deleted_workflow_tasks = Number(taskResult?.affectedRows || 0)

        const [nodeResult] = await conn.query(
          `DELETE FROM wf_process_instance_nodes WHERE instance_id IN (${placeholders})`,
          workflowInstanceIds,
        )
        stats.deleted_workflow_nodes = Number(nodeResult?.affectedRows || 0)

        const [instanceResult] = await conn.query(
          `DELETE FROM wf_process_instances WHERE id IN (${placeholders})`,
          workflowInstanceIds,
        )
        stats.deleted_workflow_instances = Number(instanceResult?.affectedRows || 0)
      }

      const [demandDeleteResult] = await conn.query('DELETE FROM work_demands WHERE id = ?', [demandId])
      stats.deleted_demands = Number(demandDeleteResult?.affectedRows || 0)

      await conn.commit()
      return stats
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async listLogs({
    page = 1,
    pageSize = 20,
    keyword = '',
    userId = null,
    demandId = '',
    phaseKey = '',
    itemTypeId = null,
    startDate = '',
    endDate = '',
    teamScopeUserId = null,
  } = {}) {
    const offset = (page - 1) * pageSize
    const conditions = ['1 = 1']
    const params = []

    if (userId) {
      conditions.push('l.user_id = ?')
      params.push(userId)
    }

    if (teamScopeUserId) {
      conditions.push(
        `u.department_id = (
          SELECT department_id FROM users WHERE id = ?
        )`,
      )
      params.push(teamScopeUserId)
    }

    if (demandId) {
      conditions.push('l.demand_id = ?')
      params.push(demandId)
    }

    if (phaseKey) {
      conditions.push('l.phase_key = ?')
      params.push(phaseKey)
    }

    if (itemTypeId) {
      conditions.push('l.item_type_id = ?')
      params.push(itemTypeId)
    }

    if (startDate) {
      conditions.push('l.log_date >= ?')
      params.push(startDate)
    }

    if (endDate) {
      conditions.push('l.log_date <= ?')
      params.push(endDate)
    }

    if (keyword) {
      conditions.push('(l.description LIKE ? OR COALESCE(l.demand_id, \'\') LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`)
    }

    const whereSql = conditions.join(' AND ')
    const listSql = `
      SELECT
        l.id,
        l.user_id,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
        DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
        l.item_type_id,
        COALESCE(t.type_key, '-') AS item_type_key,
        COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
        COALESCE(t.require_demand, 0) AS require_demand,
        l.description,
        l.personal_estimate_hours,
        l.actual_hours,
        l.remaining_hours,
        COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
        COALESCE(l.task_source, 'SELF') AS task_source,
        l.demand_id,
        l.phase_key,
        l.assigned_by_user_id,
        COALESCE(NULLIF(au.real_name, ''), au.username) AS assigned_by_name,
        DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
        DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
        DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
        COALESCE(pdi.item_name, l.phase_key, '-') AS phase_name,
        d.name AS demand_name,
        DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN users au ON au.id = l.assigned_by_user_id
      LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN config_dict_items pdi
        ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
       AND pdi.item_code = l.phase_key
      WHERE ${whereSql}
      ORDER BY l.log_date DESC, l.id DESC
      LIMIT ? OFFSET ?`

    const [rows] = await pool.query(listSql, [...params, pageSize, offset])
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM work_logs l
       INNER JOIN users u ON u.id = l.user_id
       WHERE ${whereSql}`,
      params,
    )

    return { rows, total }
  },

  async findLogById(id) {
    const [rows] = await pool.query(
      `SELECT
         l.id,
         l.user_id,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         l.item_type_id,
         l.description,
         l.personal_estimate_hours,
         l.actual_hours,
         l.remaining_hours,
         COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
         COALESCE(l.task_source, 'SELF') AS task_source,
         l.demand_id,
         l.phase_key,
         l.assigned_by_user_id,
         COALESCE(NULLIF(au.real_name, ''), au.username) AS assigned_by_name,
         DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
         DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
         DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
         DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM work_logs l
       LEFT JOIN users au ON au.id = l.assigned_by_user_id
       WHERE l.id = ?`,
      [id],
    )
    return rows[0] || null
  },

  async createLog({
    userId,
    logDate,
    itemTypeId,
    description,
    personalEstimateHours,
    actualHours,
    remainingHours,
    logStatus = 'IN_PROGRESS',
    taskSource = 'SELF',
    demandId = null,
    phaseKey = null,
    assignedByUserId = null,
    expectedStartDate = null,
    expectedCompletionDate = null,
    logCompletedAt = null,
  }) {
    const [result] = await pool.query(
      `INSERT INTO work_logs (
         user_id, log_date, item_type_id, description, personal_estimate_hours, actual_hours, remaining_hours, log_status, task_source, demand_id, phase_key, assigned_by_user_id, expected_start_date, expected_completion_date, log_completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'DONE' THEN COALESCE(?, NOW()) ELSE NULL END)`,
      [
        userId,
        logDate,
        itemTypeId,
        description,
        normalizeDecimal(personalEstimateHours, 0),
        normalizeDecimal(actualHours, 0),
        normalizeDecimal(remainingHours, 0),
        WORK_LOG_STATUSES.includes(String(logStatus || '').toUpperCase())
          ? String(logStatus).toUpperCase()
          : 'IN_PROGRESS',
        normalizeTaskSource(taskSource, 'SELF'),
        demandId,
        phaseKey,
        toPositiveInt(assignedByUserId),
        expectedStartDate,
        expectedCompletionDate,
        WORK_LOG_STATUSES.includes(String(logStatus || '').toUpperCase())
          ? String(logStatus).toUpperCase()
          : 'IN_PROGRESS',
        logCompletedAt,
      ],
    )
    return result.insertId
  },

  async updateLog(
    id,
    {
      logDate,
      itemTypeId,
      description,
      personalEstimateHours,
      actualHours,
      remainingHours,
      logStatus = 'IN_PROGRESS',
      taskSource = 'SELF',
      demandId = null,
      phaseKey = null,
      assignedByUserId = null,
      expectedStartDate = null,
      expectedCompletionDate = null,
      logCompletedAt = null,
    },
  ) {
    const [result] = await pool.query(
      `UPDATE work_logs
       SET
         log_date = ?,
         item_type_id = ?,
         description = ?,
         personal_estimate_hours = ?,
         actual_hours = ?,
         remaining_hours = ?,
         log_status = ?,
         task_source = ?,
         demand_id = ?,
         phase_key = ?,
         assigned_by_user_id = ?,
         expected_start_date = ?,
         expected_completion_date = ?,
         log_completed_at = CASE
           WHEN ? = 'DONE' THEN COALESCE(?, log_completed_at, NOW())
           ELSE NULL
         END
       WHERE id = ?`,
      [
        logDate,
        itemTypeId,
        description,
        normalizeDecimal(personalEstimateHours, 0),
        normalizeDecimal(actualHours, 0),
        normalizeDecimal(remainingHours, 0),
        WORK_LOG_STATUSES.includes(String(logStatus || '').toUpperCase())
          ? String(logStatus).toUpperCase()
          : 'IN_PROGRESS',
        normalizeTaskSource(taskSource, 'SELF'),
        demandId,
        phaseKey,
        toPositiveInt(assignedByUserId),
        expectedStartDate,
        expectedCompletionDate,
        WORK_LOG_STATUSES.includes(String(logStatus || '').toUpperCase())
          ? String(logStatus).toUpperCase()
          : 'IN_PROGRESS',
        logCompletedAt,
        id,
      ],
    )
    return result.affectedRows
  },

  async seedDailyPlansForLog(
    logId,
    {
      userId,
      expectedStartDate,
      expectedCompletionDate = null,
      totalPlannedHours = 0,
      source = 'SYSTEM_SPLIT',
      createdBy = null,
    } = {},
  ) {
    const normalizedLogId = toPositiveInt(logId)
    const normalizedUserId = toPositiveInt(userId)
    const startDate = normalizeDateOnly(expectedStartDate)
    if (!normalizedLogId || !normalizedUserId || !startDate) return 0

    const dateList = buildDateRange(startDate, normalizeDateOnly(expectedCompletionDate) || startDate)
    if (dateList.length === 0) return 0

    const hoursList = splitHoursAcrossDates(totalPlannedHours, dateList.length)
    const normalizedCreatedBy = toPositiveInt(createdBy)
    const normalizedSource = String(source || 'SYSTEM_SPLIT').trim().toUpperCase().slice(0, 32) || 'SYSTEM_SPLIT'
    await ensureDailyTables()

    const values = dateList.map((date, index) => [
      normalizedLogId,
      normalizedUserId,
      date,
      normalizeDecimal(hoursList[index], 0) || 0,
      normalizedSource,
      null,
      normalizedCreatedBy,
    ])

    if (values.length === 0) return 0

    const [result] = await pool.query(
      `INSERT INTO work_log_daily_plans (
         log_id,
         user_id,
         plan_date,
         planned_hours,
         source,
         note,
         created_by
       ) VALUES ?
       ON DUPLICATE KEY UPDATE
         planned_hours = VALUES(planned_hours),
         source = VALUES(source),
         note = COALESCE(work_log_daily_plans.note, VALUES(note)),
         updated_at = CURRENT_TIMESTAMP`,
      [values],
    )

    return Number(result?.affectedRows || 0)
  },

  async upsertDailyPlanForLog(
    logId,
    {
      userId,
      planDate,
      plannedHours,
      source = 'MANUAL',
      note = '',
      createdBy = null,
    } = {},
  ) {
    const normalizedLogId = toPositiveInt(logId)
    const normalizedUserId = toPositiveInt(userId)
    const normalizedPlanDate = normalizeDateOnly(planDate)
    if (!normalizedLogId || !normalizedUserId || !normalizedPlanDate) return 0

    const normalizedPlannedHours = normalizeDecimal(plannedHours, 0)
    if (normalizedPlannedHours === null || normalizedPlannedHours < 0) return 0

    const normalizedSource = String(source || 'MANUAL').trim().toUpperCase().slice(0, 32) || 'MANUAL'
    const normalizedNote = String(note || '').trim().slice(0, 500) || null
    const normalizedCreatedBy = toPositiveInt(createdBy)

    await ensureDailyTables()

    const [result] = await pool.query(
      `INSERT INTO work_log_daily_plans (
         log_id,
         user_id,
         plan_date,
         planned_hours,
         source,
         note,
         created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         planned_hours = VALUES(planned_hours),
         source = VALUES(source),
         note = VALUES(note),
         updated_at = CURRENT_TIMESTAMP`,
      [
        normalizedLogId,
        normalizedUserId,
        normalizedPlanDate,
        normalizedPlannedHours,
        normalizedSource,
        normalizedNote,
        normalizedCreatedBy,
      ],
    )

    return Number(result?.affectedRows || 0)
  },

  async listDailyPlansForLog(logId, { startDate = '', endDate = '' } = {}) {
    const normalizedLogId = toPositiveInt(logId)
    if (!normalizedLogId) return []
    await ensureDailyTables()

    const conditions = ['p.log_id = ?']
    const params = [normalizedLogId]
    const normalizedStart = normalizeDateOnly(startDate)
    const normalizedEnd = normalizeDateOnly(endDate)
    if (normalizedStart) {
      conditions.push('p.plan_date >= ?')
      params.push(normalizedStart)
    }
    if (normalizedEnd) {
      conditions.push('p.plan_date <= ?')
      params.push(normalizedEnd)
    }

    const [rows] = await pool.query(
      `SELECT
         p.id,
         p.log_id,
         p.user_id,
         DATE_FORMAT(p.plan_date, '%Y-%m-%d') AS plan_date,
         p.planned_hours,
         p.source,
         p.note,
         p.created_by,
         DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(p.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM work_log_daily_plans p
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.plan_date ASC, p.id ASC`,
      params,
    )

    return rows || []
  },

  async syncAutoDailyPlansForLog(
    logId,
    {
      userId,
      expectedStartDate,
      expectedCompletionDate = null,
      totalPlannedHours = 0,
      source = 'SYSTEM_SPLIT_UPDATE',
      createdBy = null,
    } = {},
  ) {
    const normalizedLogId = toPositiveInt(logId)
    const normalizedUserId = toPositiveInt(userId)
    const normalizedStart = normalizeDateOnly(expectedStartDate)
    if (!normalizedLogId || !normalizedUserId || !normalizedStart) return 0

    const normalizedEnd = normalizeDateOnly(expectedCompletionDate) || normalizedStart
    const dateList = buildDateRange(normalizedStart, normalizedEnd)
    if (dateList.length === 0) return 0

    await ensureDailyTables()

    const [existingRows] = await pool.query(
      `SELECT
         DATE_FORMAT(plan_date, '%Y-%m-%d') AS plan_date,
         planned_hours,
         source
       FROM work_log_daily_plans
       WHERE log_id = ?`,
      [normalizedLogId],
    )

    const dateSet = new Set(dateList)
    const manualDateSet = new Set()
    let manualHoursInRange = 0
    ;(existingRows || []).forEach((row) => {
      const date = String(row?.plan_date || '')
      if (!dateSet.has(date)) return
      const rowSource = String(row?.source || '').trim().toUpperCase()
      if (rowSource !== 'MANUAL') return
      manualDateSet.add(date)
      manualHoursInRange += Number(row?.planned_hours || 0)
    })

    const totalHours = Number(normalizeDecimal(totalPlannedHours, 0) || 0)
    const remainingAutoHours = Math.max(0, totalHours - Number(manualHoursInRange || 0))
    const autoDates = dateList.filter((date) => !manualDateSet.has(date))
    const autoHoursList = splitHoursAcrossDates(remainingAutoHours, Math.max(1, autoDates.length))

    if (autoDates.length > 0) {
      const normalizedCreatedBy = toPositiveInt(createdBy)
      const normalizedSource =
        String(source || 'SYSTEM_SPLIT_UPDATE').trim().toUpperCase().slice(0, 32) || 'SYSTEM_SPLIT_UPDATE'
      const values = autoDates.map((date, index) => [
        normalizedLogId,
        normalizedUserId,
        date,
        normalizeDecimal(autoHoursList[index], 0) || 0,
        normalizedSource,
        null,
        normalizedCreatedBy,
      ])

      await pool.query(
        `INSERT INTO work_log_daily_plans (
           log_id,
           user_id,
           plan_date,
           planned_hours,
           source,
           note,
           created_by
         ) VALUES ?
         ON DUPLICATE KEY UPDATE
           planned_hours = CASE
             WHEN work_log_daily_plans.source = 'MANUAL' THEN work_log_daily_plans.planned_hours
             ELSE VALUES(planned_hours)
           END,
           source = CASE
             WHEN work_log_daily_plans.source = 'MANUAL' THEN work_log_daily_plans.source
             ELSE VALUES(source)
           END,
           note = CASE
             WHEN work_log_daily_plans.source = 'MANUAL' THEN work_log_daily_plans.note
             ELSE VALUES(note)
           END,
           updated_at = CURRENT_TIMESTAMP`,
        [values],
      )
    }

    await pool.query(
      `DELETE FROM work_log_daily_plans
       WHERE log_id = ?
         AND plan_date NOT IN (?)`,
      [normalizedLogId, dateList],
    )

    return autoDates.length
  },

  async createDailyEntryForLog(
    logId,
    {
      userId,
      entryDate,
      actualHours,
      description = '',
      createdBy = null,
    } = {},
  ) {
    const normalizedLogId = toPositiveInt(logId)
    const normalizedUserId = toPositiveInt(userId)
    const normalizedEntryDate = normalizeDateOnly(entryDate)
    const normalizedActualHours = normalizeDecimal(actualHours, null)
    if (!normalizedLogId || !normalizedUserId || !normalizedEntryDate) return null
    if (normalizedActualHours === null || normalizedActualHours <= 0) return null

    const normalizedDescription = String(description || '').trim().slice(0, 2000) || null
    const normalizedCreatedBy = toPositiveInt(createdBy)

    await ensureDailyTables()

    // 覆盖模式：同一事项同一天仅保留最后一条，重复填报以最后一次为准
    await pool.query(
      `DELETE e_old
       FROM work_log_daily_entries e_old
       INNER JOIN work_log_daily_entries e_new
         ON e_old.log_id = e_new.log_id
        AND e_old.entry_date = e_new.entry_date
        AND e_old.id < e_new.id
       WHERE e_old.log_id = ?`,
      [normalizedLogId],
    )

    const [existingRows] = await pool.query(
      `SELECT id
       FROM work_log_daily_entries
       WHERE log_id = ?
         AND user_id = ?
         AND entry_date = ?
       ORDER BY id DESC
       LIMIT 1`,
      [normalizedLogId, normalizedUserId, normalizedEntryDate],
    )

    let entryId = 0
    const existingEntry = existingRows?.[0]
    if (existingEntry?.id) {
      await pool.query(
        `UPDATE work_log_daily_entries
         SET actual_hours = ?,
             description = ?,
             created_by = ?,
             created_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [normalizedActualHours, normalizedDescription, normalizedCreatedBy, Number(existingEntry.id)],
      )
      entryId = Number(existingEntry.id)
    } else {
      const [result] = await pool.query(
        `INSERT INTO work_log_daily_entries (
           log_id,
           user_id,
           entry_date,
           actual_hours,
           description,
           created_by
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          normalizedLogId,
          normalizedUserId,
          normalizedEntryDate,
          normalizedActualHours,
          normalizedDescription,
          normalizedCreatedBy,
        ],
      )
      entryId = Number(result?.insertId || 0)
    }

    await this.syncLogActualHoursByDailyEntries(normalizedLogId)
    return entryId
  },

  async listDailyEntriesForLog(logId, { startDate = '', endDate = '' } = {}) {
    const normalizedLogId = toPositiveInt(logId)
    if (!normalizedLogId) return []
    await ensureDailyTables()

    const conditions = ['e.log_id = ?']
    const params = [normalizedLogId]
    const normalizedStart = normalizeDateOnly(startDate)
    const normalizedEnd = normalizeDateOnly(endDate)
    if (normalizedStart) {
      conditions.push('e.entry_date >= ?')
      params.push(normalizedStart)
    }
    if (normalizedEnd) {
      conditions.push('e.entry_date <= ?')
      params.push(normalizedEnd)
    }

    const [rows] = await pool.query(
      `SELECT
         e.id,
         e.log_id,
         e.user_id,
         DATE_FORMAT(e.entry_date, '%Y-%m-%d') AS entry_date,
         e.actual_hours,
         e.description,
         e.created_by,
         DATE_FORMAT(e.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM work_log_daily_entries e
       INNER JOIN (
         SELECT log_id, entry_date, MAX(id) AS latest_id
         FROM work_log_daily_entries
         GROUP BY log_id, entry_date
       ) le ON le.latest_id = e.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.entry_date DESC, e.id DESC`,
      params,
    )

    return rows || []
  },

  async syncLogActualHoursByDailyEntries(logId) {
    const normalizedLogId = toPositiveInt(logId)
    if (!normalizedLogId) return 0
    await ensureDailyTables()

    const [[sumRow]] = await pool.query(
      `SELECT ROUND(COALESCE(SUM(e.actual_hours), 0), 1) AS total_actual_hours
       FROM work_log_daily_entries e
       INNER JOIN (
         SELECT log_id, entry_date, MAX(id) AS latest_id
         FROM work_log_daily_entries
         WHERE log_id = ?
         GROUP BY log_id, entry_date
       ) le ON le.latest_id = e.id`,
      [normalizedLogId],
    )
    const totalActualHours = normalizeDecimal(sumRow?.total_actual_hours, 0) || 0

    const [result] = await pool.query(
      `UPDATE work_logs
       SET actual_hours = ?
       WHERE id = ?`,
      [totalActualHours, normalizedLogId],
    )

    return Number(result?.affectedRows || 0)
  },

  async deleteLog(id) {
    await ensureDailyTables()
    await pool.query(`DELETE FROM work_log_daily_plans WHERE log_id = ?`, [id])
    await pool.query(`DELETE FROM work_log_daily_entries WHERE log_id = ?`, [id])
    const [result] = await pool.query(`DELETE FROM work_logs WHERE id = ?`, [id])
    return result.affectedRows
  },

  async canManageLogByDepartmentOwner(ownerUserId, logId, { isSuperAdmin = false } = {}) {
    if (isSuperAdmin) return true

    const scope = await resolveOwnerScope(ownerUserId, { isSuperAdmin: false })
    const teamMemberIds = Array.isArray(scope.team_member_ids) ? scope.team_member_ids : []
    const managedDepartmentIds = Array.isArray(scope.managed_department_ids)
      ? scope.managed_department_ids
      : []
    if (teamMemberIds.length === 0 && managedDepartmentIds.length === 0) return false

    const [rows] = await pool.query(
      `SELECT
         l.id,
         l.user_id,
         l.demand_id,
         l.phase_key,
         COALESCE(t.owner_estimate_rule, 'NONE') AS owner_estimate_rule,
         ${PHASE_OWNER_DEPARTMENT_ID_SQL} AS phase_owner_department_id,
         ${PHASE_OWNER_ESTIMATE_REQUIRED_SQL} AS phase_owner_estimate_required
       FROM work_logs l
       LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
       LEFT JOIN config_dict_items pdi
         ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
        AND pdi.item_code = l.phase_key
       WHERE l.id = ?
         AND COALESCE(l.log_status, 'IN_PROGRESS') <> 'DONE'
       LIMIT 1`,
      [logId],
    )
    if (rows.length === 0) return false

    return isOwnerEstimateTargetRow(rows[0], {
      isSuperAdmin: false,
      managedDepartmentIds,
      teamMemberIds,
    })
  },

  async updateLogOwnerEstimate(logId, { ownerEstimateHours, ownerEstimatedBy }) {
    try {
      const [result] = await pool.query(
        `UPDATE work_logs
         SET
           owner_estimate_hours = ?,
           owner_estimated_by = ?,
           owner_estimated_at = NOW()
         WHERE id = ?`,
        [normalizeDecimal(ownerEstimateHours, 0), ownerEstimatedBy || null, logId],
      )
      return result.affectedRows
    } catch (err) {
      if (isMissingColumnError(err)) {
        const wrapped = new Error('owner_estimate_fields_missing')
        wrapped.code = 'OWNER_ESTIMATE_FIELDS_MISSING'
        throw wrapped
      }
      throw err
    }
  },

  async getMyWorkbench(userId) {
    const normalizedUserId = toPositiveInt(userId)
    if (!normalizedUserId) {
      return {
        today: {
          log_count_today: 0,
          personal_estimate_hours_today: 0,
          planned_hours_today: 0,
          actual_hours_today: 0,
          remaining_hours_today: 0,
          scheduled_item_count_today: 0,
          filled_item_count_today: 0,
          assignable_hours_today: DEFAULT_DAILY_CAPACITY_HOURS,
        },
        active_items: [],
        recent_logs: [],
      }
    }

    await ensureDailyTables()

    const todayPlannedHoursSql = getTodayPlannedHoursSql('CURDATE()')
    const todayActualHoursSql = getTodayActualHoursSql()

    const [activeItemsRaw] = await pool.query(
      `SELECT
         l.id,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         l.item_type_id,
         COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
         l.description,
         l.personal_estimate_hours,
         COALESCE(tt.total_actual_hours, l.actual_hours, 0) AS actual_hours,
         l.remaining_hours,
         COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
         COALESCE(l.task_source, 'SELF') AS task_source,
         l.assigned_by_user_id,
         COALESCE(NULLIF(au.real_name, ''), au.username) AS assigned_by_name,
         DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
         DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
         DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
         l.demand_id,
         d.name AS demand_name,
         l.phase_key,
         COALESCE(pdi.item_name, l.phase_key, '-') AS phase_name,
         ${todayPlannedHoursSql} AS today_planned_hours,
         ${todayActualHoursSql} AS today_actual_hours,
         COALESCE(tt.total_actual_hours, l.actual_hours, 0) AS cumulative_actual_hours
       FROM work_logs l
       LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
       LEFT JOIN users au ON au.id = l.assigned_by_user_id
       LEFT JOIN work_demands d ON d.id = l.demand_id
       LEFT JOIN config_dict_items pdi
         ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
        AND pdi.item_code = l.phase_key
       LEFT JOIN (
         SELECT log_id, ROUND(COALESCE(SUM(planned_hours), 0), 1) AS today_planned_hours
         FROM work_log_daily_plans
         WHERE plan_date = CURDATE()
         GROUP BY log_id
       ) pt ON pt.log_id = l.id
       LEFT JOIN (
         SELECT e.log_id, ROUND(COALESCE(SUM(e.actual_hours), 0), 1) AS today_actual_hours
         FROM work_log_daily_entries e
         INNER JOIN (
           SELECT log_id, entry_date, MAX(id) AS latest_id
           FROM work_log_daily_entries
           GROUP BY log_id, entry_date
         ) le ON le.latest_id = e.id
         WHERE e.entry_date = CURDATE()
         GROUP BY log_id
       ) et ON et.log_id = l.id
       LEFT JOIN (
         SELECT e.log_id, ROUND(COALESCE(SUM(e.actual_hours), 0), 1) AS total_actual_hours
         FROM work_log_daily_entries e
         INNER JOIN (
           SELECT log_id, entry_date, MAX(id) AS latest_id
           FROM work_log_daily_entries
           GROUP BY log_id, entry_date
         ) le ON le.latest_id = e.id
         GROUP BY log_id
       ) tt ON tt.log_id = l.id
       WHERE l.user_id = ?
         AND COALESCE(l.log_status, 'IN_PROGRESS') <> 'DONE'
       ORDER BY
         CASE COALESCE(l.log_status, 'IN_PROGRESS')
           WHEN 'TODO' THEN 0
           WHEN 'IN_PROGRESS' THEN 1
           ELSE 2
         END ASC,
         CASE WHEN l.expected_completion_date IS NULL THEN 1 ELSE 0 END ASC,
         l.expected_completion_date ASC,
         l.updated_at DESC
       LIMIT 30`,
      [normalizedUserId],
    )

    const activeItems = (activeItemsRaw || []).map((item) => {
      const todayPlanned = Number(item.today_planned_hours || 0)
      const todayActual = Number(item.today_actual_hours || 0)
      const cumulativeActual = Number(item.cumulative_actual_hours || item.actual_hours || 0)
      return {
        ...item,
        today_planned_hours: toDecimal1(todayPlanned),
        today_actual_hours: toDecimal1(todayActual),
        cumulative_actual_hours: toDecimal1(cumulativeActual),
        today_scheduled: todayPlanned > 0,
        today_filled: todayActual > 0,
      }
    })

    const todayPlannedHours = toDecimal1(
      activeItems.reduce((sum, item) => sum + Number(item.today_planned_hours || 0), 0),
    )
    const todayActualHours = toDecimal1(
      activeItems.reduce((sum, item) => sum + Number(item.today_actual_hours || 0), 0),
    )
    const todayRemainingHours = toDecimal1(
      activeItems.reduce((sum, item) => sum + Number(item.remaining_hours || 0), 0),
    )
    const scheduledItemCount = activeItems.filter((item) => Number(item.today_planned_hours || 0) > 0).length
    const filledItemCount = activeItems.filter((item) => Number(item.today_actual_hours || 0) > 0).length
    const assignableHours = toDecimal1(Math.max(0, DEFAULT_DAILY_CAPACITY_HOURS - Number(todayPlannedHours || 0)))

    const [recentLogs] = await pool.query(
      `SELECT
         l.id,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         l.personal_estimate_hours,
         COALESCE(tt.total_actual_hours, l.actual_hours, 0) AS actual_hours,
         l.remaining_hours,
         l.description,
         l.demand_id,
         COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name
       FROM work_logs l
       LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
       LEFT JOIN (
         SELECT e.log_id, ROUND(COALESCE(SUM(e.actual_hours), 0), 1) AS total_actual_hours
         FROM work_log_daily_entries e
         INNER JOIN (
           SELECT log_id, entry_date, MAX(id) AS latest_id
           FROM work_log_daily_entries
           GROUP BY log_id, entry_date
         ) le ON le.latest_id = e.id
         GROUP BY log_id
       ) tt ON tt.log_id = l.id
       WHERE l.user_id = ?
       ORDER BY l.log_date DESC, l.id DESC
       LIMIT 10`,
      [normalizedUserId],
    )

    return {
      today: {
        log_count_today: filledItemCount,
        personal_estimate_hours_today: todayPlannedHours,
        planned_hours_today: todayPlannedHours,
        actual_hours_today: todayActualHours,
        remaining_hours_today: todayRemainingHours,
        scheduled_item_count_today: scheduledItemCount,
        filled_item_count_today: filledItemCount,
        assignable_hours_today: assignableHours,
      },
      active_items: activeItems,
      recent_logs: recentLogs,
    }
  },

  async getMyWeeklyReport(userId, { startDate, endDate } = {}) {
    const normalizedUserId = toPositiveInt(userId)
    const normalizedStartDate = normalizeDateOnly(startDate)
    const normalizedEndDate = normalizeDateOnly(endDate)
    const dateList = buildDateRange(normalizedStartDate, normalizedEndDate)

    const emptyPayload = {
      range: {
        start_date: normalizedStartDate || '',
        end_date: normalizedEndDate || '',
        total_days: dateList.length,
      },
      summary: {
        item_count: 0,
        todo_count: 0,
        in_progress_count: 0,
        done_count: 0,
        overdue_count: 0,
        active_days: 0,
        filled_days: 0,
        planned_hours: 0,
        actual_hours: 0,
        variance_hours: 0,
        variance_rate: null,
      },
      daily_breakdown: dateList.map((date) => ({
        date,
        planned_hours: 0,
        actual_hours: 0,
        item_count: 0,
        entry_count: 0,
      })),
      top_items: [],
    }

    if (!normalizedUserId || !normalizedStartDate || !normalizedEndDate || normalizedStartDate > normalizedEndDate) {
      return emptyPayload
    }

    await ensureDailyTables()

    const [logRows] = await pool.query(
      `SELECT
         l.id,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         l.personal_estimate_hours,
         l.actual_hours,
         COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
         DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
         DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
         COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
         l.description,
         l.demand_id,
         d.name AS demand_name,
         l.phase_key,
         COALESCE(pdi.item_name, l.phase_key, '-') AS phase_name
       FROM work_logs l
       LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
       LEFT JOIN work_demands d ON d.id = l.demand_id
       LEFT JOIN config_dict_items pdi
         ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
        AND pdi.item_code = l.phase_key
       WHERE l.user_id = ?
         AND (
           l.log_date BETWEEN ? AND ?
           OR EXISTS (
             SELECT 1
             FROM work_log_daily_plans p
             WHERE p.log_id = l.id
               AND p.user_id = ?
               AND p.plan_date BETWEEN ? AND ?
           )
           OR EXISTS (
             SELECT 1
             FROM work_log_daily_entries e
             WHERE e.log_id = l.id
               AND e.user_id = ?
               AND e.entry_date BETWEEN ? AND ?
           )
         )
       ORDER BY l.updated_at DESC, l.id DESC`,
      [
        normalizedUserId,
        normalizedStartDate,
        normalizedEndDate,
        normalizedUserId,
        normalizedStartDate,
        normalizedEndDate,
        normalizedUserId,
        normalizedStartDate,
        normalizedEndDate,
      ],
    )

    if (!Array.isArray(logRows) || logRows.length === 0) {
      return emptyPayload
    }

    const [planRows] = await pool.query(
      `SELECT
         p.log_id,
         DATE_FORMAT(p.plan_date, '%Y-%m-%d') AS plan_date,
         ROUND(COALESCE(SUM(p.planned_hours), 0), 1) AS planned_hours
       FROM work_log_daily_plans p
       WHERE p.user_id = ?
         AND p.plan_date BETWEEN ? AND ?
       GROUP BY p.log_id, p.plan_date`,
      [normalizedUserId, normalizedStartDate, normalizedEndDate],
    )

    const [entryRows] = await pool.query(
      `SELECT
         e.log_id,
         DATE_FORMAT(e.entry_date, '%Y-%m-%d') AS entry_date,
         ROUND(COALESCE(SUM(e.actual_hours), 0), 1) AS actual_hours,
         COUNT(*) AS entry_count
       FROM work_log_daily_entries e
       INNER JOIN (
         SELECT log_id, entry_date, MAX(id) AS latest_id
         FROM work_log_daily_entries
         GROUP BY log_id, entry_date
       ) le ON le.latest_id = e.id
       WHERE e.user_id = ?
         AND e.entry_date BETWEEN ? AND ?
       GROUP BY e.log_id, e.entry_date`,
      [normalizedUserId, normalizedStartDate, normalizedEndDate],
    )

    const reportDateSet = new Set(dateList)
    const dailyMap = new Map()
    dateList.forEach((date) => {
      dailyMap.set(date, {
        date,
        planned_hours: 0,
        actual_hours: 0,
        item_count: 0,
        entry_count: 0,
      })
    })

    const plannedByLogDate = new Map()
    const plannedTotalByLog = new Map()
    ;(planRows || []).forEach((row) => {
      const logId = Number(row.log_id)
      const planDate = normalizeDateOnly(row.plan_date)
      const plannedHours = toDecimal1(row.planned_hours)
      if (!logId || !planDate || !reportDateSet.has(planDate)) return
      plannedByLogDate.set(`${logId}|${planDate}`, plannedHours)
      plannedTotalByLog.set(logId, toDecimal1(Number(plannedTotalByLog.get(logId) || 0) + plannedHours))
    })

    const actualByLogDate = new Map()
    const actualTotalByLog = new Map()
    const entryCountByLog = new Map()
    ;(entryRows || []).forEach((row) => {
      const logId = Number(row.log_id)
      const entryDate = normalizeDateOnly(row.entry_date)
      const actualHours = toDecimal1(row.actual_hours)
      const entryCount = Number(row.entry_count || 0)
      if (!logId || !entryDate || !reportDateSet.has(entryDate)) return
      actualByLogDate.set(`${logId}|${entryDate}`, {
        actual_hours: actualHours,
        entry_count: entryCount,
      })
      actualTotalByLog.set(logId, toDecimal1(Number(actualTotalByLog.get(logId) || 0) + actualHours))
      entryCountByLog.set(logId, Number(entryCountByLog.get(logId) || 0) + entryCount)
    })

    const itemRows = []
    let todoCount = 0
    let inProgressCount = 0
    let doneCount = 0
    let overdueCount = 0

    ;(logRows || []).forEach((row) => {
      const logId = Number(row.id)
      if (!logId) return

      let weeklyPlannedHours = toDecimal1(plannedTotalByLog.get(logId) || 0)
      let weeklyActualHours = toDecimal1(actualTotalByLog.get(logId) || 0)
      const touchedDates = new Set()

      if (weeklyPlannedHours > 0) {
        dateList.forEach((date) => {
          const plannedHours = toDecimal1(plannedByLogDate.get(`${logId}|${date}`) || 0)
          if (plannedHours <= 0) return
          const daily = dailyMap.get(date)
          if (!daily) return
          daily.planned_hours = toDecimal1(daily.planned_hours + plannedHours)
          touchedDates.add(date)
        })
      } else {
        const fallbackEstimateHours = toDecimal1(row.personal_estimate_hours)
        const expectedStartDate = normalizeDateOnly(row.expected_start_date)
        const expectedEndDate = normalizeDateOnly(row.expected_completion_date) || expectedStartDate
        const fallbackLogDate = normalizeDateOnly(row.log_date)

        if (fallbackEstimateHours > 0 && expectedStartDate) {
          const fullDateList = buildDateRange(expectedStartDate, expectedEndDate || expectedStartDate)
          const hoursPerDay = splitHoursAcrossDates(fallbackEstimateHours, Math.max(1, fullDateList.length))
          fullDateList.forEach((date, index) => {
            if (!reportDateSet.has(date)) return
            const daily = dailyMap.get(date)
            if (!daily) return
            const plannedHours = toDecimal1(hoursPerDay[index] || 0)
            if (plannedHours <= 0) return
            daily.planned_hours = toDecimal1(daily.planned_hours + plannedHours)
            weeklyPlannedHours = toDecimal1(weeklyPlannedHours + plannedHours)
            touchedDates.add(date)
          })
        } else if (fallbackEstimateHours > 0 && fallbackLogDate && reportDateSet.has(fallbackLogDate)) {
          const daily = dailyMap.get(fallbackLogDate)
          if (daily) {
            daily.planned_hours = toDecimal1(daily.planned_hours + fallbackEstimateHours)
            weeklyPlannedHours = toDecimal1(weeklyPlannedHours + fallbackEstimateHours)
            touchedDates.add(fallbackLogDate)
          }
        }
      }

      const explicitEntryCount = Number(entryCountByLog.get(logId) || 0)
      if (weeklyActualHours > 0 || explicitEntryCount > 0) {
        dateList.forEach((date) => {
          const dailyEntry = actualByLogDate.get(`${logId}|${date}`)
          if (!dailyEntry) return
          const daily = dailyMap.get(date)
          if (!daily) return
          const actualHours = toDecimal1(dailyEntry.actual_hours)
          const entryCount = Number(dailyEntry.entry_count || 0)
          daily.actual_hours = toDecimal1(daily.actual_hours + actualHours)
          daily.entry_count = Number(daily.entry_count || 0) + entryCount
          touchedDates.add(date)
        })
      } else {
        const fallbackLogDate = normalizeDateOnly(row.log_date)
        const fallbackActualHours = toDecimal1(row.actual_hours)
        if (fallbackActualHours > 0 && fallbackLogDate && reportDateSet.has(fallbackLogDate)) {
          const daily = dailyMap.get(fallbackLogDate)
          if (daily) {
            daily.actual_hours = toDecimal1(daily.actual_hours + fallbackActualHours)
            daily.entry_count = Number(daily.entry_count || 0) + 1
            weeklyActualHours = toDecimal1(weeklyActualHours + fallbackActualHours)
            touchedDates.add(fallbackLogDate)
          }
        }
      }

      touchedDates.forEach((date) => {
        const daily = dailyMap.get(date)
        if (!daily) return
        daily.item_count = Number(daily.item_count || 0) + 1
      })

      const statusCode = String(row.log_status || 'IN_PROGRESS').trim().toUpperCase()
      if (statusCode === 'TODO') todoCount += 1
      else if (statusCode === 'DONE') doneCount += 1
      else inProgressCount += 1

      const completionDate = normalizeDateOnly(row.expected_completion_date)
      if (statusCode !== 'DONE' && completionDate && completionDate < normalizedEndDate) {
        overdueCount += 1
      }

      itemRows.push({
        id: logId,
        log_status: statusCode,
        item_type_name: row.item_type_name || `事项#${logId}`,
        description: row.description || '',
        demand_id: row.demand_id || null,
        demand_name: row.demand_name || null,
        phase_key: row.phase_key || '',
        phase_name: row.phase_name || row.phase_key || '-',
        planned_hours: toDecimal1(weeklyPlannedHours),
        actual_hours: toDecimal1(weeklyActualHours),
        variance_hours: toDecimal1(weeklyActualHours - weeklyPlannedHours),
        entry_count: explicitEntryCount,
      })
    })

    const dailyBreakdown = dateList
      .map((date) => dailyMap.get(date))
      .filter(Boolean)
      .map((item) => ({
        date: item.date,
        planned_hours: toDecimal1(item.planned_hours),
        actual_hours: toDecimal1(item.actual_hours),
        item_count: Number(item.item_count || 0),
        entry_count: Number(item.entry_count || 0),
      }))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

    const totalPlannedHours = toDecimal1(itemRows.reduce((sum, item) => sum + Number(item.planned_hours || 0), 0))
    const totalActualHours = toDecimal1(itemRows.reduce((sum, item) => sum + Number(item.actual_hours || 0), 0))
    const activeDays = dailyBreakdown.filter(
      (item) => Number(item.planned_hours || 0) > 0 || Number(item.actual_hours || 0) > 0,
    ).length
    const filledDays = dailyBreakdown.filter((item) => Number(item.actual_hours || 0) > 0).length

    const topItems = [...itemRows]
      .sort((a, b) => {
        const actualDiff = Number(b.actual_hours || 0) - Number(a.actual_hours || 0)
        if (actualDiff !== 0) return actualDiff
        const plannedDiff = Number(b.planned_hours || 0) - Number(a.planned_hours || 0)
        if (plannedDiff !== 0) return plannedDiff
        return Number(b.id || 0) - Number(a.id || 0)
      })
      .slice(0, 10)

    return {
      range: {
        start_date: normalizedStartDate,
        end_date: normalizedEndDate,
        total_days: dateList.length,
      },
      summary: {
        item_count: itemRows.length,
        todo_count: todoCount,
        in_progress_count: inProgressCount,
        done_count: doneCount,
        overdue_count: overdueCount,
        active_days: activeDays,
        filled_days: filledDays,
        planned_hours: totalPlannedHours,
        actual_hours: totalActualHours,
        variance_hours: toDecimal1(totalActualHours - totalPlannedHours),
        variance_rate: calcVarianceRate(totalActualHours, totalPlannedHours),
      },
      daily_breakdown: dailyBreakdown,
      top_items: topItems,
    }
  },

  async getMorningStandupBoard(
    viewerUserId,
    {
      canViewAll = false,
      targetDepartmentId = null,
      tabKey = '',
    } = {},
  ) {
    const viewerDepartment = await findUserDepartmentRow(viewerUserId)
    const allEnabledDepartments = await listEnabledDepartments()
    const allEnabledDepartmentIds = allEnabledDepartments.map((item) => Number(item.id))

    const requestedDepartmentId = toPositiveInt(targetDepartmentId)
    const parsedTab = parseMorningTabKey(tabKey)

    let currentMode = canViewAll ? 'ALL' : 'DEPARTMENT'
    let currentDepartmentId = null

    if (canViewAll) {
      if (parsedTab.type === 'DEPARTMENT') {
        currentMode = 'DEPARTMENT'
        currentDepartmentId = parsedTab.departmentId
      } else if (requestedDepartmentId) {
        currentMode = 'DEPARTMENT'
        currentDepartmentId = requestedDepartmentId
      } else if (parsedTab.type === 'ALL') {
        currentMode = 'ALL'
      } else {
        currentMode = 'ALL'
      }

      if (currentMode === 'DEPARTMENT' && !allEnabledDepartmentIds.includes(currentDepartmentId)) {
        currentMode = 'ALL'
        currentDepartmentId = null
      }
    } else {
      currentMode = 'DEPARTMENT'
      if (parsedTab.type === 'DEPARTMENT' && allEnabledDepartmentIds.includes(parsedTab.departmentId)) {
        currentDepartmentId = parsedTab.departmentId
      } else if (requestedDepartmentId && allEnabledDepartmentIds.includes(requestedDepartmentId)) {
        currentDepartmentId = requestedDepartmentId
      } else if (viewerDepartment?.id && allEnabledDepartmentIds.includes(viewerDepartment.id)) {
        currentDepartmentId = viewerDepartment.id
      } else {
        currentDepartmentId = allEnabledDepartmentIds[0] || null
      }
    }

    const tabs = []
    if (canViewAll) {
      tabs.push({
        key: 'all',
        label: '全部',
        department_id: null,
        is_all: true,
      })
      allEnabledDepartments.forEach((item) => {
        tabs.push({
          key: buildMorningTabKey(item.id),
          label: item.name,
          department_id: item.id,
          is_all: false,
        })
      })
    } else {
      allEnabledDepartments.forEach((item) => {
        tabs.push({
          key: buildMorningTabKey(item.id),
          label: item.name,
          department_id: item.id,
          is_all: false,
        })
      })
    }

    const defaultTabKey = canViewAll
      ? 'all'
      : viewerDepartment?.id && allEnabledDepartmentIds.includes(viewerDepartment.id)
        ? buildMorningTabKey(viewerDepartment.id)
        : tabs[0]?.key || ''
    const currentTabKey = currentMode === 'ALL' ? 'all' : buildMorningTabKey(currentDepartmentId)

    let scopedDepartmentIds = []
    if (currentMode === 'ALL') {
      scopedDepartmentIds = allEnabledDepartmentIds
    } else if (currentDepartmentId) {
      scopedDepartmentIds = [currentDepartmentId]
    }

    const emptyPayload = {
      tabs,
      default_tab_key: defaultTabKey,
      current_tab_key: currentTabKey || defaultTabKey,
      view_scope: {
        mode: currentMode,
        department_id: currentMode === 'DEPARTMENT' ? currentDepartmentId : null,
        department_name:
          currentMode === 'DEPARTMENT'
            ? (tabs.find((item) => item.department_id === currentDepartmentId)?.label || null)
            : '全部部门',
        department_ids: scopedDepartmentIds,
      },
      summary: {
        team_size: 0,
        filled_users_today: 0,
        unfilled_users_today: 0,
        active_item_count: 0,
        overdue_item_count: 0,
        due_today_item_count: 0,
      },
      focus_summary: {
        overdue_count: 0,
        due_today_count: 0,
        active_count: 0,
        unfilled_count: 0,
        yesterday_due_total: 0,
        yesterday_due_not_done_count: 0,
        yesterday_due_late_done_count: 0,
        in_progress_count: 0,
        todo_pending_count: 0,
      },
      focus_items: [],
      focus_yesterday_due_items: [],
      focus_in_progress_items: [],
      focus_todo_items: [],
      members: [],
      no_fill_members: [],
    }

    if (scopedDepartmentIds.length === 0) {
      return emptyPayload
    }

    const [memberRows] = await pool.query(
      `SELECT
         u.id AS user_id,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
         u.department_id,
         COALESCE(d.name, CONCAT('部门#', u.department_id)) AS department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
         AND COALESCE(u.include_in_metrics, 1) = 1
         AND u.department_id IN (?)
       ORDER BY u.department_id ASC, u.id ASC`,
      [scopedDepartmentIds],
    )

    const userIds = memberRows
      .map((row) => Number(row.user_id))
      .filter((id) => Number.isInteger(id) && id > 0)

    if (userIds.length === 0) {
      return emptyPayload
    }

    await ensureDailyTables()
    const todayPlannedHoursSql = getTodayPlannedHoursSql('CURDATE()')
    const todayActualHoursSql = getTodayActualHoursSql()

    const [activeItemRows] = await pool.query(
      `SELECT
         l.id,
         l.user_id,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
         l.description,
         COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
         DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
         DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
         DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
         l.demand_id,
         d.name AS demand_name,
         d.priority AS demand_priority,
         l.phase_key,
         COALESCE(pdi.item_name, l.phase_key, '-') AS phase_name,
         l.personal_estimate_hours,
         COALESCE(tt.total_actual_hours, l.actual_hours, 0) AS cumulative_actual_hours,
         ${todayPlannedHoursSql} AS today_planned_hours,
         ${todayActualHoursSql} AS today_actual_hours
       FROM work_logs l
       LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
       LEFT JOIN work_demands d ON d.id = l.demand_id
       LEFT JOIN config_dict_items pdi
         ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
        AND pdi.item_code = l.phase_key
       LEFT JOIN (
         SELECT log_id, ROUND(COALESCE(SUM(planned_hours), 0), 1) AS today_planned_hours
         FROM work_log_daily_plans
         WHERE plan_date = CURDATE()
         GROUP BY log_id
       ) pt ON pt.log_id = l.id
       LEFT JOIN (
         SELECT log_id, ROUND(COALESCE(SUM(actual_hours), 0), 1) AS today_actual_hours
         FROM work_log_daily_entries
         WHERE entry_date = CURDATE()
         GROUP BY log_id
       ) et ON et.log_id = l.id
       LEFT JOIN (
         SELECT log_id, ROUND(COALESCE(SUM(actual_hours), 0), 1) AS total_actual_hours
         FROM work_log_daily_entries
         GROUP BY log_id
       ) tt ON tt.log_id = l.id
       WHERE l.user_id IN (?)
         AND COALESCE(l.log_status, 'IN_PROGRESS') <> 'DONE'
       ORDER BY
         l.user_id ASC,
         CASE COALESCE(l.log_status, 'IN_PROGRESS')
           WHEN 'TODO' THEN 0
           WHEN 'IN_PROGRESS' THEN 1
           ELSE 2
         END ASC,
         CASE WHEN l.expected_completion_date IS NULL THEN 1 ELSE 0 END ASC,
         l.expected_completion_date ASC,
         l.updated_at DESC,
         l.id DESC
       LIMIT 4000`,
      [userIds],
    )

    const [yesterdayDueRows] = await pool.query(
      `SELECT
         l.id,
         l.user_id,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
         l.description,
         COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
         DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
         DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
         DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
         l.demand_id,
         d.name AS demand_name,
         d.priority AS demand_priority,
         l.phase_key,
         COALESCE(pdi.item_name, l.phase_key, '-') AS phase_name,
         l.personal_estimate_hours,
         COALESCE(tt.total_actual_hours, l.actual_hours, 0) AS cumulative_actual_hours
       FROM work_logs l
       LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
       LEFT JOIN work_demands d ON d.id = l.demand_id
       LEFT JOIN config_dict_items pdi
         ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
        AND pdi.item_code = l.phase_key
       LEFT JOIN (
         SELECT log_id, ROUND(COALESCE(SUM(actual_hours), 0), 1) AS total_actual_hours
         FROM work_log_daily_entries
         GROUP BY log_id
       ) tt ON tt.log_id = l.id
       WHERE l.user_id IN (?)
         AND l.expected_completion_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
       ORDER BY l.updated_at DESC, l.id DESC
       LIMIT 2000`,
      [userIds],
    )

    const activeItemsByUser = new Map()
    const plannedHoursByUser = new Map()
    const actualHoursByUser = new Map()
    activeItemRows.forEach((row) => {
      const userId = Number(row.user_id)
      if (!activeItemsByUser.has(userId)) {
        activeItemsByUser.set(userId, [])
      }
      const normalizedRow = {
        ...row,
        today_planned_hours: toDecimal1(row.today_planned_hours),
        today_actual_hours: toDecimal1(row.today_actual_hours),
      }
      activeItemsByUser.get(userId).push(normalizedRow)
      plannedHoursByUser.set(
        userId,
        Number((plannedHoursByUser.get(userId) || 0) + Number(normalizedRow.today_planned_hours || 0)),
      )
      actualHoursByUser.set(
        userId,
        Number((actualHoursByUser.get(userId) || 0) + Number(normalizedRow.today_actual_hours || 0)),
      )
    })

    const [[todayRow]] = await pool.query(
      `SELECT
         DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today_date,
         DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d') AS yesterday_date`,
    )
    const todayDate = String(todayRow?.today_date || '')
    const yesterdayDate = String(todayRow?.yesterday_date || '')
    let activeItemCount = 0
    let overdueItemCount = 0
    let dueTodayItemCount = 0
    let scheduledUsersToday = 0
    let scheduledFilledUsersToday = 0
    let unscheduledUsersToday = 0
    let totalPlannedHoursToday = 0
    let totalActualHoursToday = 0

    const members = memberRows.map((row) => {
      const userId = Number(row.user_id)
      const activeItems = activeItemsByUser.get(userId) || []
      const todayPlannedHours = toDecimal1(plannedHoursByUser.get(userId) || 0)
      const todayActualHours = toDecimal1(actualHoursByUser.get(userId) || 0)
      const todayScheduled = Number(todayPlannedHours || 0) > 0
      const todayFilled = todayScheduled && Number(todayActualHours || 0) > 0
      const assignableHours = toDecimal1(Math.max(0, DEFAULT_DAILY_CAPACITY_HOURS - Number(todayPlannedHours || 0)))

      activeItemCount += activeItems.length
      totalPlannedHoursToday += Number(todayPlannedHours || 0)
      totalActualHoursToday += Number(todayActualHours || 0)
      activeItems.forEach((item) => {
        const expectedDate = String(item.expected_completion_date || '').trim()
        if (!expectedDate) return
        if (expectedDate < todayDate) overdueItemCount += 1
        if (expectedDate === todayDate) dueTodayItemCount += 1
      })

      if (todayScheduled) {
        scheduledUsersToday += 1
        if (todayFilled) scheduledFilledUsersToday += 1
      } else {
        unscheduledUsersToday += 1
      }

      return {
        user_id: userId,
        username: row.username,
        department_id: Number(row.department_id),
        department_name: row.department_name,
        today_scheduled: todayScheduled,
        today_filled: todayFilled,
        today_planned_hours: todayPlannedHours,
        today_actual_hours: todayActualHours,
        assignable_hours: assignableHours,
        active_item_count: activeItems.length,
        active_items: activeItems,
      }
    })

    const filledUsersToday = scheduledFilledUsersToday
    const unfilledUsersToday = Math.max(scheduledUsersToday - scheduledFilledUsersToday, 0)
    const noFillMembers = members
      .filter((item) => item.today_scheduled && !item.today_filled)
      .map((item) => ({ id: item.user_id, username: item.username }))

    const usernameById = new Map(
      members.map((item) => [Number(item.user_id), item.username || `用户${Number(item.user_id)}`]),
    )
    const focusLevelRank = {
      OVERDUE: 0,
      DUE_TODAY: 1,
      NORMAL: 2,
    }
    const priorityRank = {
      P0: 0,
      P1: 1,
      P2: 2,
      P3: 3,
    }
    const buildFocusItem = (item) => {
      const expectedStartDate = String(item.expected_start_date || '').trim()
      const expectedDate = String(item.expected_completion_date || '').trim()
      const focusLevel = expectedDate
        ? expectedDate < todayDate
          ? 'OVERDUE'
          : expectedDate === todayDate
            ? 'DUE_TODAY'
            : 'NORMAL'
        : 'NORMAL'
      const demandPriority = String(item.demand_priority || '').trim().toUpperCase()
      const progress = calcCrossDayProgress({
        logStatus: item.log_status,
        expectedStartDate,
        expectedCompletionDate: expectedDate,
        todayDate,
        personalEstimateHours: item.personal_estimate_hours,
        cumulativeActualHours: item.cumulative_actual_hours,
      })

      return {
        id: Number(item.id),
        user_id: Number(item.user_id),
        username: usernameById.get(Number(item.user_id)) || `用户${Number(item.user_id)}`,
        item_type_name: item.item_type_name || '-',
        demand_id: item.demand_id || null,
        demand_name: item.demand_name || item.demand_id || '-',
        phase_name: item.phase_name || '-',
        log_status: item.log_status || 'IN_PROGRESS',
        expected_start_date: expectedStartDate || null,
        expected_completion_date: expectedDate || null,
        log_completed_at: item.log_completed_at || null,
        demand_priority: demandPriority && priorityRank[demandPriority] !== undefined ? demandPriority : null,
        focus_level: focusLevel,
        description: item.description || '',
        personal_estimate_hours: toDecimal1(item.personal_estimate_hours),
        cumulative_actual_hours: toDecimal1(item.cumulative_actual_hours),
        ...progress,
      }
    }

    const yesterdayCheckRank = {
      NOT_DONE: 0,
      LATE_DONE: 1,
      ON_TIME: 2,
    }
    const yesterdayDueItems = (yesterdayDueRows || [])
      .map((item) => {
        const mapped = buildFocusItem(item)
        const completedDate = mapped.log_completed_at ? String(mapped.log_completed_at).slice(0, 10) : ''
        let checkResult = 'NOT_DONE'
        if (mapped.log_status === 'DONE') {
          checkResult = completedDate && completedDate <= yesterdayDate ? 'ON_TIME' : 'LATE_DONE'
        }
        return {
          ...mapped,
          check_result: checkResult,
        }
      })
      .sort((a, b) => {
        const checkDiff = (yesterdayCheckRank[a.check_result] || 9) - (yesterdayCheckRank[b.check_result] || 9)
        if (checkDiff !== 0) return checkDiff
        const priorityA = a.demand_priority ? priorityRank[a.demand_priority] : 99
        const priorityB = b.demand_priority ? priorityRank[b.demand_priority] : 99
        if (priorityA !== priorityB) return priorityA - priorityB
        return Number(b.id || 0) - Number(a.id || 0)
      })
      .slice(0, 200)

    const inProgressItems = (activeItemRows || [])
      .filter((item) => {
        const status = String(item.log_status || '').trim().toUpperCase()
        const expectedDate = String(item.expected_completion_date || '').trim()
        if (expectedDate && expectedDate === yesterdayDate) return false
        return status === 'IN_PROGRESS'
      })
      .map((item) => buildFocusItem(item))
      .sort((a, b) => {
        const riskDiff = Number(Boolean(b.progress_risk)) - Number(Boolean(a.progress_risk))
        if (riskDiff !== 0) return riskDiff
        const levelDiff = (focusLevelRank[a.focus_level] || 9) - (focusLevelRank[b.focus_level] || 9)
        if (levelDiff !== 0) return levelDiff
        const priorityA = a.demand_priority ? priorityRank[a.demand_priority] : 99
        const priorityB = b.demand_priority ? priorityRank[b.demand_priority] : 99
        if (priorityA !== priorityB) return priorityA - priorityB
        const dateA = a.expected_completion_date || '9999-12-31'
        const dateB = b.expected_completion_date || '9999-12-31'
        if (dateA !== dateB) return dateA.localeCompare(dateB)
        return Number(b.id || 0) - Number(a.id || 0)
      })
      .slice(0, 200)

    const todoPendingItems = (activeItemRows || [])
      .filter((item) => {
        const status = String(item.log_status || '').trim().toUpperCase()
        const expectedStartDate = String(item.expected_start_date || '').trim()
        const expectedDate = String(item.expected_completion_date || '').trim()
        if (expectedDate && expectedDate === yesterdayDate) return false
        if (status !== 'TODO') return false
        return Boolean(expectedStartDate) && expectedStartDate !== todayDate
      })
      .map((item) => {
        const mapped = buildFocusItem(item)
        const daysToStart = calcDateDiffDays(todayDate, mapped.expected_start_date)
        return {
          ...mapped,
          days_to_start: daysToStart,
          start_risk: Number(daysToStart || 0) < 0,
        }
      })
      .sort((a, b) => {
        const riskDiff = Number(Boolean(b.start_risk)) - Number(Boolean(a.start_risk))
        if (riskDiff !== 0) return riskDiff
        const dayA = Number.isFinite(Number(a.days_to_start)) ? Number(a.days_to_start) : 9999
        const dayB = Number.isFinite(Number(b.days_to_start)) ? Number(b.days_to_start) : 9999
        if (dayA !== dayB) return dayA - dayB
        return Number(b.id || 0) - Number(a.id || 0)
      })
      .slice(0, 200)

    const focusItems = [...yesterdayDueItems, ...inProgressItems, ...todoPendingItems].slice(0, 200)
    const yesterdayDueNotDoneCount = yesterdayDueItems.filter((item) => item.check_result === 'NOT_DONE').length
    const yesterdayDueLateDoneCount = yesterdayDueItems.filter((item) => item.check_result === 'LATE_DONE').length

    return {
      tabs,
      default_tab_key: defaultTabKey,
      current_tab_key: currentTabKey || defaultTabKey,
      view_scope: {
        mode: currentMode,
        department_id: currentMode === 'DEPARTMENT' ? currentDepartmentId : null,
        department_name:
          currentMode === 'DEPARTMENT'
            ? (tabs.find((item) => item.department_id === currentDepartmentId)?.label || null)
            : '全部部门',
        department_ids: scopedDepartmentIds,
      },
      summary: {
        team_size: members.length,
        filled_users_today: filledUsersToday,
        unfilled_users_today: unfilledUsersToday,
        scheduled_users_today: scheduledUsersToday,
        unscheduled_users_today: unscheduledUsersToday,
        total_planned_hours_today: toDecimal1(totalPlannedHoursToday),
        total_actual_hours_today: toDecimal1(totalActualHoursToday),
        active_item_count: activeItemCount,
        overdue_item_count: overdueItemCount,
        due_today_item_count: dueTodayItemCount,
      },
      focus_summary: {
        overdue_count: overdueItemCount,
        due_today_count: dueTodayItemCount,
        active_count: activeItemCount,
        unfilled_count: unfilledUsersToday,
        yesterday_due_total: yesterdayDueItems.length,
        yesterday_due_not_done_count: yesterdayDueNotDoneCount,
        yesterday_due_late_done_count: yesterdayDueLateDoneCount,
        in_progress_count: inProgressItems.length,
        todo_pending_count: todoPendingItems.length,
      },
      focus_items: focusItems,
      focus_yesterday_due_items: yesterdayDueItems,
      focus_in_progress_items: inProgressItems,
      focus_todo_items: todoPendingItems,
      members,
      no_fill_members: noFillMembers,
    }
  },

  async getOwnerWorkbench(ownerUserId, { isSuperAdmin = false } = {}) {
    const scope = await resolveOwnerScope(ownerUserId, { isSuperAdmin })
    const teamMemberIds = Array.isArray(scope.team_member_ids) ? scope.team_member_ids : []
    const managedDepartmentIds = Array.isArray(scope.managed_department_ids)
      ? scope.managed_department_ids
      : []

    if (!isSuperAdmin && teamMemberIds.length === 0 && managedDepartmentIds.length === 0) {
      return {
        data_scope: {
          scope_type: scope.scope_type,
          scope_label: scope.scope_label,
          department_id: scope.department_id,
          department_name: scope.department_name,
          team_member_count: 0,
          managed_department_ids: managedDepartmentIds,
          managed_department_names: scope.managed_department_names || [],
        },
        team_overview: {
          team_size: 0,
          filled_users_today: 0,
          unfilled_users_today: 0,
          scheduled_users_today: 0,
          unscheduled_users_today: 0,
          total_personal_estimate_hours_today: 0,
          total_actual_hours_today: 0,
          total_assignable_hours_today: 0,
        },
        no_fill_members: [],
        team_members: [],
        owner_estimate_items: [],
        owner_estimate_pending_count: 0,
        demand_risks: [],
        phase_risks: [],
      }
    }

    const defaultOverview = {
      team_size: 0,
      filled_users_today: 0,
      unfilled_users_today: 0,
      scheduled_users_today: 0,
      unscheduled_users_today: 0,
      total_personal_estimate_hours_today: 0,
      total_actual_hours_today: 0,
      total_assignable_hours_today: 0,
    }
    let overview = defaultOverview
    let noFillMembers = []
    let teamMembers = []

    if (teamMemberIds.length > 0) {
      await ensureDailyTables()
      const todayPlannedHoursSql = getTodayPlannedHoursSql('CURDATE()')
      const todayActualHoursSql = getTodayActualHoursSql()

      ;[teamMembers] = await pool.query(
        `SELECT
           u.id,
           COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
           u.department_id
         FROM users u
         WHERE u.id IN (?)
           AND COALESCE(u.include_in_metrics, 1) = 1
         ORDER BY u.id ASC`,
        [teamMemberIds],
      )

      const [dailyAggRows] = await pool.query(
        `SELECT
           l.user_id,
           ROUND(COALESCE(SUM(${todayPlannedHoursSql}), 0), 1) AS today_planned_hours,
           ROUND(COALESCE(SUM(${todayActualHoursSql}), 0), 1) AS today_actual_hours
         FROM work_logs l
         LEFT JOIN (
           SELECT log_id, ROUND(COALESCE(SUM(planned_hours), 0), 1) AS today_planned_hours
           FROM work_log_daily_plans
           WHERE plan_date = CURDATE()
           GROUP BY log_id
         ) pt ON pt.log_id = l.id
         LEFT JOIN (
           SELECT log_id, ROUND(COALESCE(SUM(actual_hours), 0), 1) AS today_actual_hours
           FROM work_log_daily_entries
           WHERE entry_date = CURDATE()
           GROUP BY log_id
         ) et ON et.log_id = l.id
         WHERE l.user_id IN (?)
           AND COALESCE(l.log_status, 'IN_PROGRESS') <> 'DONE'
         GROUP BY l.user_id`,
        [teamMemberIds],
      )

      const dailyAggMap = new Map()
      ;(dailyAggRows || []).forEach((row) => {
        const id = Number(row.user_id)
        if (!Number.isInteger(id) || id <= 0) return
        dailyAggMap.set(id, {
          today_planned_hours: toDecimal1(row.today_planned_hours),
          today_actual_hours: toDecimal1(row.today_actual_hours),
        })
      })

      let scheduledUsersToday = 0
      let filledUsersToday = 0
      let totalPlannedHoursToday = 0
      let totalActualHoursToday = 0
      let totalAssignableHoursToday = 0
      teamMembers = teamMembers.map((item) => {
        const userId = Number(item.id)
        const agg = dailyAggMap.get(userId) || {}
        const todayPlannedHours = toDecimal1(agg.today_planned_hours)
        const todayActualHours = toDecimal1(agg.today_actual_hours)
        const todayScheduled = Number(todayPlannedHours || 0) > 0
        const todayFilled = todayScheduled && Number(todayActualHours || 0) > 0
        const assignableHours = toDecimal1(Math.max(0, DEFAULT_DAILY_CAPACITY_HOURS - Number(todayPlannedHours || 0)))

        totalPlannedHoursToday += Number(todayPlannedHours || 0)
        totalActualHoursToday += Number(todayActualHours || 0)
        totalAssignableHoursToday += Number(assignableHours || 0)

        if (todayScheduled) {
          scheduledUsersToday += 1
          if (todayFilled) filledUsersToday += 1
        }

        return {
          ...item,
          today_scheduled: todayScheduled,
          today_filled: todayFilled,
          today_planned_hours: todayPlannedHours,
          today_actual_hours: todayActualHours,
          assignable_hours: assignableHours,
        }
      })

      noFillMembers = teamMembers
        .filter((item) => item.today_scheduled && !item.today_filled)
        .map((item) => ({
          id: Number(item.id),
          username: item.username || `用户${Number(item.id)}`,
        }))

      const teamSize = teamMembers.length
      overview = {
        team_size: teamSize,
        filled_users_today: filledUsersToday,
        unfilled_users_today: Math.max(scheduledUsersToday - filledUsersToday, 0),
        scheduled_users_today: scheduledUsersToday,
        unscheduled_users_today: Math.max(teamSize - scheduledUsersToday, 0),
        total_personal_estimate_hours_today: toDecimal1(totalPlannedHoursToday),
        total_actual_hours_today: toDecimal1(totalActualHoursToday),
        total_assignable_hours_today: toDecimal1(totalAssignableHoursToday),
      }
    }

    let ownerEstimateItems = []
    const ownerEstimateQueryConditions = [
      `COALESCE(l.log_status, 'IN_PROGRESS') <> 'DONE'`,
      `COALESCE(u.include_in_metrics, 1) = 1`,
    ]
    const ownerEstimateQueryParams = []

    if (!isSuperAdmin) {
      const candidateConditions = []
      if (teamMemberIds.length > 0) {
        candidateConditions.push('l.user_id IN (?)')
        ownerEstimateQueryParams.push(teamMemberIds)
      }
      if (managedDepartmentIds.length > 0) {
        candidateConditions.push(`${PHASE_OWNER_DEPARTMENT_ID_SQL} IN (?)`)
        ownerEstimateQueryParams.push(managedDepartmentIds)
      }
      if (candidateConditions.length === 0) {
        candidateConditions.push('1 = 0')
      }
      ownerEstimateQueryConditions.push(`(${candidateConditions.join(' OR ')})`)
    }

    const ownerEstimateSql = `SELECT
       l.id,
       l.user_id,
       COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
       DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
       COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
       l.description,
       l.personal_estimate_hours,
       l.actual_hours,
       l.owner_estimate_hours,
       l.owner_estimated_by,
       DATE_FORMAT(l.owner_estimated_at, '%Y-%m-%d %H:%i:%s') AS owner_estimated_at,
       COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
       COALESCE(l.task_source, 'SELF') AS task_source,
       l.demand_id,
       d.name AS demand_name,
       l.phase_key,
       l.assigned_by_user_id,
       COALESCE(NULLIF(au.real_name, ''), au.username) AS assigned_by_name,
       COALESCE(pdi.item_name, l.phase_key, '-') AS phase_name,
       DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
       DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
       DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
       COALESCE(t.owner_estimate_rule, 'NONE') AS owner_estimate_rule,
       ${PHASE_OWNER_DEPARTMENT_ID_SQL} AS phase_owner_department_id,
       ${PHASE_OWNER_ESTIMATE_REQUIRED_SQL} AS phase_owner_estimate_required
     FROM work_logs l
     INNER JOIN users u ON u.id = l.user_id
     LEFT JOIN users au ON au.id = l.assigned_by_user_id
     LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
     LEFT JOIN work_demands d ON d.id = l.demand_id
     LEFT JOIN config_dict_items pdi
       ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
      AND pdi.item_code = l.phase_key
     WHERE ${ownerEstimateQueryConditions.join(' AND ')}
     ORDER BY
       CASE WHEN l.owner_estimate_hours IS NULL THEN 0 ELSE 1 END ASC,
       l.updated_at DESC,
       l.id DESC
     LIMIT 400`

    const ownerEstimateFallbackSql = `SELECT
       l.id,
       l.user_id,
       COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
       DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
       COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
       l.description,
       l.personal_estimate_hours,
       l.actual_hours,
       NULL AS owner_estimate_hours,
       NULL AS owner_estimated_by,
       NULL AS owner_estimated_at,
       COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
       COALESCE(l.task_source, 'SELF') AS task_source,
       l.demand_id,
       d.name AS demand_name,
       l.phase_key,
       l.assigned_by_user_id,
       COALESCE(NULLIF(au.real_name, ''), au.username) AS assigned_by_name,
       COALESCE(pdi.item_name, l.phase_key, '-') AS phase_name,
       DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
       DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
       DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
       COALESCE(t.owner_estimate_rule, 'NONE') AS owner_estimate_rule,
       ${PHASE_OWNER_DEPARTMENT_ID_SQL} AS phase_owner_department_id,
       ${PHASE_OWNER_ESTIMATE_REQUIRED_SQL} AS phase_owner_estimate_required
     FROM work_logs l
     INNER JOIN users u ON u.id = l.user_id
     LEFT JOIN users au ON au.id = l.assigned_by_user_id
     LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
     LEFT JOIN work_demands d ON d.id = l.demand_id
     LEFT JOIN config_dict_items pdi
       ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
      AND pdi.item_code = l.phase_key
     WHERE ${ownerEstimateQueryConditions.join(' AND ')}
     ORDER BY l.updated_at DESC, l.id DESC
     LIMIT 400`

    try {
      ;[ownerEstimateItems] = await pool.query(ownerEstimateSql, ownerEstimateQueryParams)
    } catch (err) {
      if (!isMissingColumnError(err)) throw err
      ;[ownerEstimateItems] = await pool.query(ownerEstimateFallbackSql, ownerEstimateQueryParams)
    }

    ownerEstimateItems = ownerEstimateItems
      .filter((row) =>
        isOwnerEstimateTargetRow(row, {
          isSuperAdmin,
          managedDepartmentIds,
          teamMemberIds,
        }),
      )
      .slice(0, 120)

    return {
      data_scope: {
        scope_type: scope.scope_type,
        scope_label: scope.scope_label,
        department_id: scope.department_id,
        department_name: scope.department_name,
        team_member_count: teamMemberIds.length,
        managed_department_ids: managedDepartmentIds,
        managed_department_names: scope.managed_department_names || [],
      },
      team_overview: {
        team_size: Number(overview?.team_size || 0),
        filled_users_today: Number(overview?.filled_users_today || 0),
        unfilled_users_today: Number(overview?.unfilled_users_today || 0),
        scheduled_users_today: Number(overview?.scheduled_users_today || 0),
        unscheduled_users_today: Number(overview?.unscheduled_users_today || 0),
        total_personal_estimate_hours_today: Number(overview?.total_personal_estimate_hours_today || 0),
        total_actual_hours_today: Number(overview?.total_actual_hours_today || 0),
        total_assignable_hours_today: Number(overview?.total_assignable_hours_today || 0),
      },
      no_fill_members: noFillMembers,
      team_members: teamMembers,
      owner_estimate_items: ownerEstimateItems,
      owner_estimate_pending_count: ownerEstimateItems.filter((item) => item.owner_estimate_hours === null).length,
      demand_risks: [],
      phase_risks: [],
    }
  },

  async getInsightFilterOptions() {
    const [departmentRows] = await pool.query(
      `SELECT
         d.id,
         d.name
       FROM departments d
       WHERE COALESCE(d.enabled, 1) = 1
       ORDER BY d.sort_order ASC, d.id ASC`,
    )

    const [ownerRows] = await pool.query(
      `SELECT
         u.id,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
         u.department_id,
         COALESCE(d.name, CONCAT('部门#', u.department_id)) AS department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
         AND COALESCE(u.include_in_metrics, 1) = 1
       ORDER BY u.id ASC`,
    )

    const [businessGroupRows] = await pool.query(
      `SELECT
         i.item_code AS code,
         i.item_name AS name
       FROM config_dict_items i
       INNER JOIN config_dict_types t ON t.type_key = i.type_key
       WHERE i.type_key = ?
         AND t.enabled = 1
         AND i.enabled = 1
       ORDER BY i.sort_order ASC, i.id ASC`,
      [BUSINESS_GROUP_DICT_KEY],
    )

    return {
      departments: (departmentRows || []).map((item) => ({
        id: Number(item.id),
        name: item.name || `部门#${Number(item.id)}`,
      })),
      owners: (ownerRows || []).map((item) => ({
        id: Number(item.id),
        username: item.username || `用户${Number(item.id)}`,
        department_id: toPositiveInt(item.department_id),
        department_name: item.department_name || '-',
      })),
      business_groups: (businessGroupRows || []).map((item) => ({
        code: item.code,
        name: item.name || item.code,
      })),
    }
  },

  async getDemandInsight({
    startDate,
    endDate,
    departmentId = null,
    businessGroupCode = '',
    ownerUserId = null,
    memberUserId = null,
    keyword = '',
  } = {}) {
    const { whereSql, params } = buildDemandInsightWhere({
      startDate,
      endDate,
      departmentId,
      businessGroupCode,
      ownerUserId,
      memberUserId,
      keyword,
    })

    const demandSql = `
      SELECT
        l.demand_id,
        COALESCE(d.name, l.demand_id) AS demand_name,
        d.owner_user_id,
        COALESCE(NULLIF(ou.real_name, ''), ou.username) AS owner_name,
        d.business_group_code,
        bg.item_name AS business_group_name,
        COUNT(DISTINCT l.user_id) AS member_count,
        COUNT(DISTINCT COALESCE(NULLIF(l.phase_key, ''), '__NO_PHASE__')) AS phase_count,
        ROUND(COALESCE(SUM(${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL}), 0), 1) AS total_owner_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS total_personal_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS total_actual_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0) - (${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL})), 0), 1) AS variance_owner_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0) - COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS variance_personal_hours,
        SUM(CASE WHEN (${OWNER_ESTIMATE_REQUIRED_BY_LOG_SQL}) = 1 AND l.owner_estimate_hours IS NULL THEN 1 ELSE 0 END) AS unestimated_item_count,
        DATE_FORMAT(MAX(l.log_date), '%Y-%m-%d') AS last_log_date
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN users ou ON ou.id = d.owner_user_id
      LEFT JOIN config_dict_items bg
        ON bg.type_key = '${BUSINESS_GROUP_DICT_KEY}'
       AND bg.item_code = d.business_group_code
      LEFT JOIN config_dict_items pdi
        ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
       AND pdi.item_code = l.phase_key
      LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
      WHERE ${whereSql}
      GROUP BY
        l.demand_id,
        d.name,
        d.owner_user_id,
        COALESCE(NULLIF(ou.real_name, ''), ou.username),
        d.business_group_code,
        bg.item_name
      ORDER BY total_actual_hours DESC, l.demand_id ASC
      LIMIT 400`

    const phaseSql = `
      SELECT
        l.demand_id,
        COALESCE(NULLIF(l.phase_key, ''), '__NO_PHASE__') AS phase_key,
        COALESCE(pdi.item_name, NULLIF(l.phase_key, ''), '未分阶段') AS phase_name,
        COUNT(DISTINCT l.user_id) AS member_count,
        ROUND(COALESCE(SUM(${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL}), 0), 1) AS total_owner_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS total_personal_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS total_actual_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0) - (${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL})), 0), 1) AS variance_owner_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0) - COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS variance_personal_hours,
        DATE_FORMAT(MAX(l.log_date), '%Y-%m-%d') AS last_log_date
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN config_dict_items pdi
        ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
       AND pdi.item_code = l.phase_key
      LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
      WHERE ${whereSql}
      GROUP BY
        l.demand_id,
        COALESCE(NULLIF(l.phase_key, ''), '__NO_PHASE__'),
        COALESCE(pdi.item_name, NULLIF(l.phase_key, ''), '未分阶段')
      ORDER BY l.demand_id ASC, total_actual_hours DESC
      LIMIT 4000`

    const participantSql = `
      SELECT
        l.demand_id,
        COALESCE(NULLIF(l.phase_key, ''), '__NO_PHASE__') AS phase_key,
        l.user_id,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
        ROUND(COALESCE(SUM(${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL}), 0), 1) AS owner_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS personal_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS actual_hours,
        DATE_FORMAT(MAX(l.log_date), '%Y-%m-%d') AS last_log_date
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN config_dict_items pdi
        ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
       AND pdi.item_code = l.phase_key
      LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
      WHERE ${whereSql}
      GROUP BY
        l.demand_id,
        COALESCE(NULLIF(l.phase_key, ''), '__NO_PHASE__'),
        l.user_id,
        COALESCE(NULLIF(u.real_name, ''), u.username)
      ORDER BY l.demand_id ASC, phase_key ASC, actual_hours DESC
      LIMIT 8000`

    const [demandRows, phaseRows, participantRows] = await Promise.all([
      pool.query(demandSql, params).then((r) => r[0] || []),
      pool.query(phaseSql, params).then((r) => r[0] || []),
      pool.query(participantSql, params).then((r) => r[0] || []),
    ])

    const phaseMap = new Map()
    ;(phaseRows || []).forEach((row) => {
      const demandId = row.demand_id
      const normalizedPhaseKey = row.phase_key === '__NO_PHASE__' ? '' : row.phase_key
      const key = `${demandId}__${row.phase_key}`
      phaseMap.set(key, {
        demand_id: demandId,
        phase_key: normalizedPhaseKey,
        phase_name: row.phase_name || normalizedPhaseKey || '未分阶段',
        member_count: Number(row.member_count || 0),
        total_owner_estimate_hours: toDecimal1(row.total_owner_estimate_hours),
        total_personal_estimate_hours: toDecimal1(row.total_personal_estimate_hours),
        total_actual_hours: toDecimal1(row.total_actual_hours),
        variance_owner_hours: toDecimal1(row.variance_owner_hours),
        variance_personal_hours: toDecimal1(row.variance_personal_hours),
        variance_owner_rate: calcVarianceRate(row.total_actual_hours, row.total_owner_estimate_hours),
        variance_personal_rate: calcVarianceRate(row.total_actual_hours, row.total_personal_estimate_hours),
        last_log_date: row.last_log_date || null,
        participants: [],
      })
    })

    ;(participantRows || []).forEach((row) => {
      const key = `${row.demand_id}__${row.phase_key}`
      if (!phaseMap.has(key)) return
      phaseMap.get(key).participants.push({
        user_id: Number(row.user_id),
        username: row.username || `用户${Number(row.user_id)}`,
        owner_estimate_hours: toDecimal1(row.owner_estimate_hours),
        personal_estimate_hours: toDecimal1(row.personal_estimate_hours),
        actual_hours: toDecimal1(row.actual_hours),
        variance_owner_hours: toDecimal1(
          Number(row.actual_hours || 0) - Number(row.owner_estimate_hours || 0),
        ),
        variance_personal_hours: toDecimal1(
          Number(row.actual_hours || 0) - Number(row.personal_estimate_hours || 0),
        ),
        variance_owner_rate: calcVarianceRate(row.actual_hours, row.owner_estimate_hours),
        variance_personal_rate: calcVarianceRate(row.actual_hours, row.personal_estimate_hours),
        last_log_date: row.last_log_date || null,
      })
    })

    const demandPhaseMap = new Map()
    for (const phase of phaseMap.values()) {
      if (!demandPhaseMap.has(phase.demand_id)) {
        demandPhaseMap.set(phase.demand_id, [])
      }
      demandPhaseMap.get(phase.demand_id).push(phase)
    }

    const demandList = (demandRows || []).map((row) => {
      const demandId = row.demand_id
      const phases = demandPhaseMap.get(demandId) || []
      return {
        demand_id: demandId,
        demand_name: row.demand_name || demandId,
        owner_user_id: toPositiveInt(row.owner_user_id),
        owner_name: row.owner_name || '-',
        business_group_code: row.business_group_code || null,
        business_group_name: row.business_group_name || row.business_group_code || '-',
        member_count: Number(row.member_count || 0),
        phase_count: Number(row.phase_count || 0),
        total_owner_estimate_hours: toDecimal1(row.total_owner_estimate_hours),
        total_personal_estimate_hours: toDecimal1(row.total_personal_estimate_hours),
        total_actual_hours: toDecimal1(row.total_actual_hours),
        variance_owner_hours: toDecimal1(row.variance_owner_hours),
        variance_personal_hours: toDecimal1(row.variance_personal_hours),
        variance_owner_rate: calcVarianceRate(row.total_actual_hours, row.total_owner_estimate_hours),
        variance_personal_rate: calcVarianceRate(row.total_actual_hours, row.total_personal_estimate_hours),
        unestimated_item_count: Number(row.unestimated_item_count || 0),
        last_log_date: row.last_log_date || null,
        phases,
      }
    })

    const uniqueMemberSet = new Set()
    ;(participantRows || []).forEach((item) => {
      const id = Number(item.user_id)
      if (Number.isInteger(id) && id > 0) uniqueMemberSet.add(id)
    })

    const totalOwnerEstimateHours = toDecimal1(
      demandList.reduce((sum, item) => sum + Number(item.total_owner_estimate_hours || 0), 0),
    )
    const totalPersonalEstimateHours = toDecimal1(
      demandList.reduce((sum, item) => sum + Number(item.total_personal_estimate_hours || 0), 0),
    )
    const totalActualHours = toDecimal1(
      demandList.reduce((sum, item) => sum + Number(item.total_actual_hours || 0), 0),
    )
    const totalVarianceOwnerHours = toDecimal1(totalActualHours - totalOwnerEstimateHours)
    const totalVariancePersonalHours = toDecimal1(totalActualHours - totalPersonalEstimateHours)
    const totalUnestimatedItems = demandList.reduce(
      (sum, item) => sum + Number(item.unestimated_item_count || 0),
      0,
    )

    return {
      filters: {
        start_date: startDate,
        end_date: endDate,
        department_id: departmentId,
        business_group_code: businessGroupCode || null,
        owner_user_id: ownerUserId,
        member_user_id: memberUserId,
        keyword: keyword || '',
      },
      summary: {
        demand_count: demandList.length,
        phase_count: phaseMap.size,
        participant_count: uniqueMemberSet.size,
        total_owner_estimate_hours: totalOwnerEstimateHours,
        total_personal_estimate_hours: totalPersonalEstimateHours,
        total_actual_hours: totalActualHours,
        variance_owner_hours: totalVarianceOwnerHours,
        variance_personal_hours: totalVariancePersonalHours,
        variance_owner_rate: calcVarianceRate(totalActualHours, totalOwnerEstimateHours),
        variance_personal_rate: calcVarianceRate(totalActualHours, totalPersonalEstimateHours),
        unestimated_item_count: totalUnestimatedItems,
      },
      demand_list: demandList,
    }
  },

  async getMemberInsight({
    startDate,
    endDate,
    departmentId = null,
    businessGroupCode = '',
    ownerUserId = null,
    memberUserId = null,
    keyword = '',
  } = {}) {
    const userConditions = [
      `COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'`,
      'COALESCE(u.include_in_metrics, 1) = 1',
    ]
    const userParams = []
    if (departmentId) {
      userConditions.push('u.department_id = ?')
      userParams.push(departmentId)
    }
    if (memberUserId) {
      userConditions.push('u.id = ?')
      userParams.push(memberUserId)
    }

    const userSql = `
      SELECT
        u.id AS user_id,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
        u.department_id,
        COALESCE(dep.name, CONCAT('部门#', u.department_id)) AS department_name
      FROM users u
      LEFT JOIN departments dep ON dep.id = u.department_id
      WHERE ${userConditions.join(' AND ')}
      ORDER BY u.id ASC
      LIMIT 2000`

    const [userRows] = await pool.query(userSql, userParams)
    const scopedUserRows = Array.isArray(userRows) ? userRows : []
    const scopedUserIds = scopedUserRows
      .map((row) => Number(row.user_id))
      .filter((id) => Number.isInteger(id) && id > 0)

    if (scopedUserIds.length === 0) {
      return {
        filters: {
          start_date: startDate,
          end_date: endDate,
          department_id: departmentId,
          business_group_code: businessGroupCode || null,
          owner_user_id: ownerUserId,
          member_user_id: memberUserId,
          keyword: keyword || '',
        },
        summary: {
          member_count: 0,
          total_filled_days: 0,
          total_owner_estimate_hours: 0,
          total_personal_estimate_hours: 0,
          total_actual_hours: 0,
          variance_owner_hours: 0,
          variance_personal_hours: 0,
          variance_owner_rate: null,
          variance_personal_rate: null,
          avg_actual_hours_per_day: 0,
          avg_saturation_rate: 0,
          overload_member_count: 0,
          low_load_member_count: 0,
          overload_day_count: 0,
          low_load_day_count: 0,
        },
        member_list: [],
      }
    }

    const logConditions = ['l.user_id IN (?)', 'l.log_date >= ?', 'l.log_date <= ?']
    const logParams = [scopedUserIds, startDate, endDate]
    if (businessGroupCode) {
      logConditions.push('d.business_group_code = ?')
      logParams.push(businessGroupCode)
    }
    if (ownerUserId) {
      logConditions.push('d.owner_user_id = ?')
      logParams.push(ownerUserId)
    }
    if (keyword) {
      logConditions.push(
        `(COALESCE(NULLIF(u.real_name, ''), u.username) LIKE ? OR COALESCE(d.name, '') LIKE ? OR COALESCE(l.demand_id, '') LIKE ? OR COALESCE(l.description, '') LIKE ?)`,
      )
      logParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
    }

    const logWhereSql = logConditions.join(' AND ')

    const memberSql = `
      SELECT
        l.user_id,
        COUNT(DISTINCT l.log_date) AS filled_days,
        ROUND(COALESCE(SUM(${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL}), 0), 1) AS total_owner_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS total_personal_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS total_actual_hours,
        COUNT(DISTINCT COALESCE(l.demand_id, CONCAT('NO_DEMAND#', l.id))) AS item_scope_count,
        COUNT(DISTINCT l.demand_id) AS demand_count,
        SUM(CASE WHEN (${OWNER_ESTIMATE_REQUIRED_BY_LOG_SQL}) = 1 AND l.owner_estimate_hours IS NULL THEN 1 ELSE 0 END) AS unestimated_item_count,
        DATE_FORMAT(MAX(l.log_date), '%Y-%m-%d') AS last_log_date
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN config_dict_items pdi
        ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
       AND pdi.item_code = l.phase_key
      LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
      WHERE ${logWhereSql}
      GROUP BY l.user_id
      ORDER BY total_actual_hours DESC, l.user_id ASC
      LIMIT 4000`

    const dailySql = `
      SELECT
        l.user_id,
        DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
        ROUND(COALESCE(SUM(${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL}), 0), 1) AS owner_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS personal_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS actual_hours,
        COUNT(*) AS log_count,
        COUNT(DISTINCT l.demand_id) AS demand_count
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN config_dict_items pdi
        ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
       AND pdi.item_code = l.phase_key
      LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
      WHERE ${logWhereSql}
      GROUP BY l.user_id, DATE_FORMAT(l.log_date, '%Y-%m-%d')
      ORDER BY l.user_id ASC, log_date ASC
      LIMIT 20000`

    const [memberRows, dailyRows] = await Promise.all([
      pool.query(memberSql, logParams).then((r) => r[0] || []),
      pool.query(dailySql, logParams).then((r) => r[0] || []),
    ])

    const memberAggByUser = new Map()
    ;(memberRows || []).forEach((row) => {
      memberAggByUser.set(Number(row.user_id), row)
    })

    const dailyByUser = new Map()
    ;(dailyRows || []).forEach((row) => {
      const userId = Number(row.user_id)
      if (!dailyByUser.has(userId)) {
        dailyByUser.set(userId, [])
      }
      const actualHours = Number(row.actual_hours || 0)
      const ownerEstimateHours = Number(row.owner_estimate_hours || 0)
      const personalEstimateHours = Number(row.personal_estimate_hours || 0)
      dailyByUser.get(userId).push({
        log_date: row.log_date,
        owner_estimate_hours: toDecimal1(ownerEstimateHours),
        personal_estimate_hours: toDecimal1(personalEstimateHours),
        actual_hours: toDecimal1(actualHours),
        log_count: Number(row.log_count || 0),
        demand_count: Number(row.demand_count || 0),
        variance_owner_hours: toDecimal1(actualHours - ownerEstimateHours),
        variance_personal_hours: toDecimal1(actualHours - personalEstimateHours),
        saturation_rate: toPercent2((actualHours / 8) * 100),
      })
    })

    const normalizedKeyword = String(keyword || '').trim().toLowerCase()
    const hasLogDimensionFilter = Boolean(businessGroupCode || ownerUserId)

    const memberListBase = scopedUserRows.map((userRow) => {
      const userId = Number(userRow.user_id)
      const aggRow = memberAggByUser.get(userId) || {}
      const filledDays = Number(aggRow.filled_days || 0)
      const totalOwner = Number(aggRow.total_owner_estimate_hours || 0)
      const totalPersonal = Number(aggRow.total_personal_estimate_hours || 0)
      const totalActual = Number(aggRow.total_actual_hours || 0)
      const capacityHours = filledDays * 8
      const avgActualPerDay = filledDays > 0 ? totalActual / filledDays : 0
      const avgSaturationRate = filledDays > 0 ? (totalActual / capacityHours) * 100 : 0
      const dailyStats = dailyByUser.get(userId) || []
      const overloadDays = dailyStats.filter((item) => Number(item.saturation_rate || 0) > 100).length
      const lowLoadDays = dailyStats.filter((item) => Number(item.saturation_rate || 0) < 60).length

      return {
        user_id: userId,
        username: userRow.username || `用户${userId}`,
        department_id: toPositiveInt(userRow.department_id),
        department_name: userRow.department_name || '-',
        filled_days: filledDays,
        demand_count: Number(aggRow.demand_count || 0),
        item_scope_count: Number(aggRow.item_scope_count || 0),
        total_owner_estimate_hours: toDecimal1(totalOwner),
        total_personal_estimate_hours: toDecimal1(totalPersonal),
        total_actual_hours: toDecimal1(totalActual),
        variance_owner_hours: toDecimal1(totalActual - totalOwner),
        variance_personal_hours: toDecimal1(totalActual - totalPersonal),
        variance_owner_rate: calcVarianceRate(totalActual, totalOwner),
        variance_personal_rate: calcVarianceRate(totalActual, totalPersonal),
        avg_actual_hours_per_day: toDecimal1(avgActualPerDay),
        avg_saturation_rate: toPercent2(avgSaturationRate),
        overload_days: overloadDays,
        low_load_days: lowLoadDays,
        unestimated_item_count: Number(aggRow.unestimated_item_count || 0),
        last_log_date: aggRow.last_log_date || null,
        daily_stats: dailyStats,
      }
    })

    let memberList = memberListBase
    if (hasLogDimensionFilter) {
      memberList = memberList.filter((item) => Number(item.filled_days || 0) > 0)
    }
    if (normalizedKeyword) {
      memberList = memberList.filter((item) => {
        const usernameHit = String(item.username || '').toLowerCase().includes(normalizedKeyword)
        const departmentHit = String(item.department_name || '').toLowerCase().includes(normalizedKeyword)
        const hasLogMatch = Number(item.filled_days || 0) > 0
        return usernameHit || departmentHit || hasLogMatch
      })
    }

    const totalFilledDays = memberList.reduce((sum, item) => sum + Number(item.filled_days || 0), 0)
    const totalOwnerEstimateHours = toDecimal1(
      memberList.reduce((sum, item) => sum + Number(item.total_owner_estimate_hours || 0), 0),
    )
    const totalPersonalEstimateHours = toDecimal1(
      memberList.reduce((sum, item) => sum + Number(item.total_personal_estimate_hours || 0), 0),
    )
    const totalActualHours = toDecimal1(
      memberList.reduce((sum, item) => sum + Number(item.total_actual_hours || 0), 0),
    )
    const overloadMemberCount = memberList.filter((item) => Number(item.avg_saturation_rate || 0) > 100).length
    const lowLoadMemberCount = memberList.filter((item) => Number(item.avg_saturation_rate || 0) < 60).length
    const overloadDayCount = memberList.reduce((sum, item) => sum + Number(item.overload_days || 0), 0)
    const lowLoadDayCount = memberList.reduce((sum, item) => sum + Number(item.low_load_days || 0), 0)

    return {
      filters: {
        start_date: startDate,
        end_date: endDate,
        department_id: departmentId,
        business_group_code: businessGroupCode || null,
        owner_user_id: ownerUserId,
        member_user_id: memberUserId,
        keyword: keyword || '',
      },
      summary: {
        member_count: memberList.length,
        total_filled_days: totalFilledDays,
        total_owner_estimate_hours: totalOwnerEstimateHours,
        total_personal_estimate_hours: totalPersonalEstimateHours,
        total_actual_hours: totalActualHours,
        variance_owner_hours: toDecimal1(totalActualHours - totalOwnerEstimateHours),
        variance_personal_hours: toDecimal1(totalActualHours - totalPersonalEstimateHours),
        variance_owner_rate: calcVarianceRate(totalActualHours, totalOwnerEstimateHours),
        variance_personal_rate: calcVarianceRate(totalActualHours, totalPersonalEstimateHours),
        avg_actual_hours_per_day:
          totalFilledDays > 0 ? toDecimal1(totalActualHours / totalFilledDays) : 0,
        avg_saturation_rate:
          totalFilledDays > 0 ? toPercent2((totalActualHours / (totalFilledDays * 8)) * 100) : 0,
        overload_member_count: overloadMemberCount,
        low_load_member_count: lowLoadMemberCount,
        overload_day_count: overloadDayCount,
        low_load_day_count: lowLoadDayCount,
      },
      member_list: memberList,
    }
  },

  async previewNoFillReminders(ownerUserId, { isSuperAdmin = false } = {}) {
    const ownerWorkbench = await this.getOwnerWorkbench(ownerUserId, { isSuperAdmin })
    return {
      date: new Date().toISOString().slice(0, 10),
      total_members: ownerWorkbench.team_overview.team_size,
      no_fill_members: ownerWorkbench.no_fill_members,
    }
  },
}

module.exports = Work

