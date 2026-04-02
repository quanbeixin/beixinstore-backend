const pool = require('../utils/db')
const {
  normalizeTemplateGraph,
  filterTemplateGraphByParticipantRoles,
} = require('../utils/projectTemplateWorkflowGraph')

const DEMAND_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']
const DEMAND_PRIORITIES = ['P0', 'P1', 'P2', 'P3']
const DEMAND_MANAGEMENT_MODES = ['simple', 'advanced']
const DEMAND_HEALTH_STATUSES = ['green', 'yellow', 'red']
const WORK_LOG_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE']
const WORK_LOG_TASK_SOURCES = ['SELF', 'OWNER_ASSIGN', 'WORKFLOW_AUTO']
const DEMAND_PHASE_DICT_KEY = 'demand_phase_type'
const PROJECT_TEMPLATE_PHASE_DICT_KEY = 'project_template_phase_type'
const DEMAND_COMMUNICATION_TYPE_DICT_KEY = 'demand_communication_type'
const ISSUE_TYPE_DICT_KEY = 'issue_type'
const BUSINESS_GROUP_DICT_KEY = 'business_group'
const JOB_LEVEL_DICT_KEY = 'job_level'
const TASK_DIFFICULTY_DICT_KEY = 'task_difficulty'
const DEFAULT_TASK_DIFFICULTY_CODE = 'N1'
const EFFICIENCY_FACTOR_TYPES = {
  JOB_LEVEL_WEIGHT: 'JOB_LEVEL_WEIGHT',
  TASK_DIFFICULTY_WEIGHT: 'TASK_DIFFICULTY_WEIGHT',
  NET_EFFICIENCY_FORMULA: 'NET_EFFICIENCY_FORMULA',
}
const NET_EFFICIENCY_FORMULA_ITEM_CODE = 'DEFAULT'
const NET_EFFICIENCY_FORMULA_VARIABLES = Object.freeze({
  OWNER_HOURS: 'OWNER_HOURS',
  PERSONAL_HOURS: 'PERSONAL_HOURS',
  ACTUAL_HOURS: 'ACTUAL_HOURS',
  TASK_DIFFICULTY_COEFF: 'TASK_DIFFICULTY_COEFF',
  JOB_LEVEL_COEFF: 'JOB_LEVEL_COEFF',
})
const NET_EFFICIENCY_FORMULA_OPERATORS = Object.freeze({
  ADD: 'ADD',
  SUB: 'SUB',
  MUL: 'MUL',
  DIV: 'DIV',
})
const DEFAULT_NET_EFFICIENCY_FORMULA_TOKENS = Object.freeze([
  NET_EFFICIENCY_FORMULA_VARIABLES.ACTUAL_HOURS,
  NET_EFFICIENCY_FORMULA_OPERATORS.MUL,
  NET_EFFICIENCY_FORMULA_VARIABLES.TASK_DIFFICULTY_COEFF,
  NET_EFFICIENCY_FORMULA_OPERATORS.DIV,
  NET_EFFICIENCY_FORMULA_VARIABLES.JOB_LEVEL_COEFF,
])
const NET_EFFICIENCY_FORMULA_TOKEN_LABELS = Object.freeze({
  [NET_EFFICIENCY_FORMULA_VARIABLES.OWNER_HOURS]: 'Owner预估总工时',
  [NET_EFFICIENCY_FORMULA_VARIABLES.PERSONAL_HOURS]: '个人预估总工时',
  [NET_EFFICIENCY_FORMULA_VARIABLES.ACTUAL_HOURS]: '实际总工时',
  [NET_EFFICIENCY_FORMULA_VARIABLES.TASK_DIFFICULTY_COEFF]: '任务难度系数',
  [NET_EFFICIENCY_FORMULA_VARIABLES.JOB_LEVEL_COEFF]: '职级权重系数',
  [NET_EFFICIENCY_FORMULA_OPERATORS.ADD]: '+',
  [NET_EFFICIENCY_FORMULA_OPERATORS.SUB]: '-',
  [NET_EFFICIENCY_FORMULA_OPERATORS.MUL]: '×',
  [NET_EFFICIENCY_FORMULA_OPERATORS.DIV]: '÷',
})
const OWNER_ESTIMATE_RULES = ['NONE', 'OPTIONAL', 'REQUIRED']
const DEFAULT_NOTIFICATION_SCENES = [
  'node_assign',
  'node_reject',
  'task_assign',
  'task_deadline',
  'task_complete',
  'node_complete',
  'bug_assign',
  'bug_status_change',
  'bug_fixed',
  'bug_reopen',
]
const TRUE_LIKE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on'])
const WORK_UNIFIED_STATUS = {
  RISK: 'RISK',
  OVERDUE: 'OVERDUE',
  DUE_TODAY: 'DUE_TODAY',
  LATE_DONE: 'LATE_DONE',
  ON_TIME_DONE: 'ON_TIME_DONE',
  NORMAL: 'NORMAL',
}
const WORK_UNIFIED_STATUS_VALUES = Object.values(WORK_UNIFIED_STATUS)

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

const OWNER_ESTIMATE_REQUIRED_BY_LOG_SQL = `CASE
  WHEN COALESCE(t.owner_estimate_rule, 'NONE') = 'NONE' THEN 0
  ELSE 1
END`

const EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL = `CASE
  WHEN ${OWNER_ESTIMATE_REQUIRED_BY_LOG_SQL} = 1 THEN COALESCE(l.owner_estimate_hours, 0)
  ELSE COALESCE(l.actual_hours, 0)
END`

const DEFAULT_DAILY_CAPACITY_HOURS = Number.isFinite(Number(process.env.DAILY_CAPACITY_HOURS))
  ? Math.max(1, Number(process.env.DAILY_CAPACITY_HOURS))
  : 8.5

let ensureDailyTablesPromise = null
let isDailyTablesReady = false
let ensureEfficiencyFactorSettingsTablePromise = null
let isEfficiencyFactorSettingsTableReady = false

async function ensureEfficiencyFactorSettingsTable() {
  if (isEfficiencyFactorSettingsTableReady) return
  if (ensureEfficiencyFactorSettingsTablePromise) return ensureEfficiencyFactorSettingsTablePromise

  ensureEfficiencyFactorSettingsTablePromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS efficiency_factor_settings (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        factor_type VARCHAR(64) NOT NULL COMMENT '系数类型：职级权重、任务难度系数等',
        item_code VARCHAR(64) NOT NULL COMMENT '对应字典编码',
        item_name_snapshot VARCHAR(128) NULL COMMENT '保存时的字典名称快照',
        coefficient DECIMAL(10,2) NOT NULL DEFAULT 1.00 COMMENT '配置系数值',
        enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用当前映射',
        remark VARCHAR(255) NULL COMMENT '备注',
        updated_by BIGINT NULL COMMENT '最后维护人',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_efficiency_factor_type_item (factor_type, item_code),
        KEY idx_efficiency_factor_updated_by (updated_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='效能系数配置表'
    `)
    isEfficiencyFactorSettingsTableReady = true
  })().finally(() => {
    ensureEfficiencyFactorSettingsTablePromise = null
  })

  return ensureEfficiencyFactorSettingsTablePromise
}

function buildWorkflowNodeNameSql(logAlias = 'l') {
  return `(
    SELECT n.node_name_snapshot
    FROM wf_process_instances i
    INNER JOIN wf_process_instance_nodes n ON n.instance_id = i.id
    WHERE i.biz_type = 'DEMAND'
      AND i.biz_id = ${logAlias}.demand_id
      AND n.node_key = ${logAlias}.phase_key
    ORDER BY
      CASE i.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'NOT_STARTED' THEN 1 ELSE 2 END ASC,
      i.id DESC,
      n.id DESC
    LIMIT 1
  )`
}

function normalizeStatus(value) {
  const status = String(value || 'TODO').trim().toUpperCase()
  return DEMAND_STATUSES.includes(status) ? status : 'TODO'
}

function normalizePriority(value) {
  const priority = String(value || 'P2').trim().toUpperCase()
  return DEMAND_PRIORITIES.includes(priority) ? priority : 'P2'
}

function normalizeText(value, maxLen = 255) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeManagementMode(value, fallback = 'simple') {
  const mode = String(value || fallback).trim().toLowerCase()
  return DEMAND_MANAGEMENT_MODES.includes(mode) ? mode : fallback
}

function normalizeHealthStatus(value, fallback = 'green') {
  const status = String(value || fallback).trim().toLowerCase()
  return DEMAND_HEALTH_STATUSES.includes(status) ? status : fallback
}

function normalizeDateTime(value, fallback = null) {
  if (value === undefined) return fallback
  if (value === null || value === '') return null
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(text)) return `${text}:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(text)) return text
  return fallback
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

function normalizeNullableBooleanAsNumber(value) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'boolean') return value ? 1 : 0
  const normalized = String(value).trim().toLowerCase()
  if (TRUE_LIKE_VALUES.has(normalized)) return 1
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return 0
  return null
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

function parseProjectTemplateNodeConfig(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'object') return raw
  if (typeof raw !== 'string') return []

  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : []
  } catch (err) {
    return []
  }
}

function buildPhaseNameMap(rows) {
  const map = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = String(row?.item_code || '').trim().toUpperCase()
    if (!key) return
    map.set(key, String(row?.item_name || '').trim() || key)
  })
  return map
}

function resolveDemandCurrentPhaseFromTemplate(row, phaseNameMap) {
  const currentNodeKey = String(row?.current_node_key || '').trim().toUpperCase()
  if (!currentNodeKey) {
    return {
      current_phase_key: '',
      current_phase_name: '-',
    }
  }

  const hasConfiguredParticipantRoles =
    row?.participant_roles_json !== null &&
    row?.participant_roles_json !== undefined &&
    String(row?.participant_roles_json || '').trim() !== ''

  const templateGraph = hasConfiguredParticipantRoles
    ? filterTemplateGraphByParticipantRoles(row?.template_node_config, normalizeParticipantRoles(row?.participant_roles_json))
    : normalizeTemplateGraph(row?.template_node_config)

  const templateNodes = Array.isArray(templateGraph?.nodes) ? templateGraph.nodes : []
  const matchedNode = templateNodes.find((item) => String(item?.node_key || '').trim().toUpperCase() === currentNodeKey)
  const phaseKey = String(matchedNode?.phase_key || '').trim().toUpperCase()
  if (!phaseKey) {
    return {
      current_phase_key: '',
      current_phase_name: '-',
    }
  }

  return {
    current_phase_key: phaseKey,
    current_phase_name: phaseNameMap.get(phaseKey) || '-',
  }
}

function parseJsonArray(raw, fallback = []) {
  if (Array.isArray(raw)) return raw
  if (!raw) return fallback
  if (typeof raw === 'object') return fallback
  if (typeof raw !== 'string') return fallback

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch (err) {
    return fallback
  }
}

function normalizeParticipantRoles(values) {
  return Array.from(
    new Set(
      parseJsonArray(values, Array.isArray(values) ? values : [])
        .map((item) =>
          String(item || '')
            .trim()
            .replace(/\s+/g, '_')
            .toUpperCase()
            .slice(0, 64),
        )
        .filter(Boolean),
    ),
  )
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

function formatLocalDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDateOnly(value, days) {
  const base = parseDateOnlyAtLocalMidnight(value)
  if (!base) return ''
  base.setDate(base.getDate() + Number(days || 0))
  return formatLocalDateOnly(base)
}

function buildPreviousPeriodRange(startDate, endDate) {
  const start = parseDateOnlyAtLocalMidnight(startDate)
  const end = parseDateOnlyAtLocalMidnight(endDate)
  if (!start || !end || end < start) {
    return {
      startDate: '',
      endDate: '',
      days: 0,
    }
  }

  const millisPerDay = 24 * 60 * 60 * 1000
  const diffDays = Math.floor((end.getTime() - start.getTime()) / millisPerDay)
  const periodDays = diffDays + 1
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - diffDays)

  return {
    startDate: formatLocalDateOnly(previousStart),
    endDate: formatLocalDateOnly(previousEnd),
    days: periodDays,
  }
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
    result.push(formatLocalDateOnly(cursor))
    cursor.setDate(cursor.getDate() + 1)
    guard += 1
  }
  return result.length > 0 ? result : [start]
}

function isWeekendDate(dateText) {
  const normalized = normalizeDateOnly(dateText)
  if (!normalized) return false
  const date = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(date.getTime())) return false
  const weekDay = date.getDay()
  return weekDay === 0 || weekDay === 6
}

function getPreviousWorkdayDate(dateText) {
  const normalized = normalizeDateOnly(dateText)
  if (!normalized) return ''
  const date = new Date(`${normalized}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''

  let guard = 0
  do {
    date.setDate(date.getDate() - 1)
    guard += 1
  } while (guard < 7 && isWeekendDate(formatLocalDateOnly(date)))

  return formatLocalDateOnly(date)
}

function buildWorkDateRange(startDate, endDate, { fallbackToStart = true } = {}) {
  const fullDateList = buildDateRange(startDate, endDate)
  const workDateList = fullDateList.filter((date) => !isWeekendDate(date))
  if (workDateList.length > 0) return workDateList
  if (fallbackToStart && fullDateList.length > 0) return [fullDateList[0]]
  return []
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

function resolveEffectivePlanEndDate(expectedCompletionDate, { logStatus = '', logCompletedAt = null } = {}) {
  const normalizedExpectedEnd = normalizeDateOnly(expectedCompletionDate)
  const normalizedCompletedDate = normalizeDateOnly(logCompletedAt)
  const normalizedStatus = String(logStatus || '').trim().toUpperCase()

  if (normalizedStatus !== 'DONE' || !normalizedCompletedDate) {
    return normalizedExpectedEnd
  }

  if (!normalizedExpectedEnd) return normalizedCompletedDate
  return normalizedCompletedDate < normalizedExpectedEnd ? normalizedCompletedDate : normalizedExpectedEnd
}

function getTodayPlannedHoursSql(dateExpr = 'CURDATE()') {
  return `CASE
    WHEN COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'
      AND DATE(COALESCE(l.log_completed_at, l.updated_at)) < ${dateExpr}
    THEN 0
    ELSE COALESCE(pt.today_planned_hours, CASE
      WHEN l.expected_start_date IS NOT NULL
        AND WEEKDAY(${dateExpr}) < 5
        AND l.expected_start_date <= ${dateExpr}
        AND (l.expected_completion_date IS NULL OR l.expected_completion_date >= ${dateExpr})
        AND (
          COALESCE(l.log_status, 'IN_PROGRESS') <> 'DONE'
          OR DATE(COALESCE(l.log_completed_at, l.updated_at)) >= ${dateExpr}
        )
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
    END)
  END`
}

function getTodayActualHoursSql() {
  return `COALESCE(et.today_actual_hours, CASE
    WHEN l.log_date = CURDATE() THEN COALESCE(l.actual_hours, 0)
    WHEN COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'
      AND DATE(COALESCE(l.log_completed_at, l.updated_at)) = CURDATE()
    THEN COALESCE(l.actual_hours, 0)
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
    teamMemberIds = [],
  } = {},
) {
  const teamSet = new Set((teamMemberIds || []).map((id) => Number(id)))
  const ownerEstimateRequired = normalizeNullableBooleanAsNumber(row?.owner_estimate_required)
  const issueTypeOwnerEstimateRule = normalizeOwnerEstimateRule(row?.owner_estimate_rule, 'NONE')
  const effectiveRequired = ownerEstimateRequired === null ? (issueTypeOwnerEstimateRule === 'NONE' ? 0 : 1) : ownerEstimateRequired
  const rowUserId = toPositiveInt(row?.user_id)

  if (effectiveRequired !== 1) return false
  if (isSuperAdmin) return true
  if (!rowUserId) return false
  return teamSet.has(rowUserId)
}

function toDecimal1(value) {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return 0
  return Number(num.toFixed(1))
}

function toDecimal2(value) {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return 0
  return Number(num.toFixed(2))
}

function toDecimal4(value) {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return 0
  return Number(num.toFixed(4))
}

function toPercent2(value) {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return 0
  return Number(num.toFixed(2))
}

function isNetEfficiencyVariableToken(token) {
  return Object.values(NET_EFFICIENCY_FORMULA_VARIABLES).includes(String(token || '').trim().toUpperCase())
}

function isNetEfficiencyOperatorToken(token) {
  return Object.values(NET_EFFICIENCY_FORMULA_OPERATORS).includes(String(token || '').trim().toUpperCase())
}

function getDefaultNetEfficiencyFormulaTokens() {
  return [...DEFAULT_NET_EFFICIENCY_FORMULA_TOKENS]
}

function parseNetEfficiencyFormulaExpression(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split('|')
      .map((item) => String(item || '').trim().toUpperCase())
      .filter(Boolean)
  }
  return []
}

function normalizeNetEfficiencyFormulaTokens(value, { allowSingleOperand = true } = {}) {
  const tokens = parseNetEfficiencyFormulaExpression(value)
  if (tokens.length === 0) return getDefaultNetEfficiencyFormulaTokens()
  if (tokens.length % 2 === 0) {
    throw new Error('净效率公式格式不正确，运算项与运算符数量不匹配')
  }
  if (!allowSingleOperand && tokens.length < 3) {
    throw new Error('净效率公式至少需要两个字段和一个运算符')
  }
  if (tokens.length > 7) {
    throw new Error('净效率公式最多支持 4 个字段拼装')
  }

  tokens.forEach((token, index) => {
    if (index % 2 === 0 && !isNetEfficiencyVariableToken(token)) {
      throw new Error(`净效率公式存在不支持的字段：${token}`)
    }
    if (index % 2 === 1 && !isNetEfficiencyOperatorToken(token)) {
      throw new Error(`净效率公式存在不支持的运算符：${token}`)
    }
  })

  return tokens
}

function serializeNetEfficiencyFormulaTokens(value) {
  return normalizeNetEfficiencyFormulaTokens(value).join('|')
}

function formatNetEfficiencyFormulaTokens(value) {
  const tokens = normalizeNetEfficiencyFormulaTokens(value)
  return tokens.map((token) => NET_EFFICIENCY_FORMULA_TOKEN_LABELS[token] || token).join(' ')
}

function buildNetEfficiencyFormulaConfig(storedRows = []) {
  const formulaRow = (storedRows || []).find(
    (item) =>
      String(item?.factor_type || '').trim().toUpperCase() === EFFICIENCY_FACTOR_TYPES.NET_EFFICIENCY_FORMULA &&
      String(item?.item_code || '').trim().toUpperCase() === NET_EFFICIENCY_FORMULA_ITEM_CODE,
  )
  const expression = normalizeNetEfficiencyFormulaTokens(formulaRow?.remark || getDefaultNetEfficiencyFormulaTokens())
  return {
    factor_type: EFFICIENCY_FACTOR_TYPES.NET_EFFICIENCY_FORMULA,
    item_code: NET_EFFICIENCY_FORMULA_ITEM_CODE,
    item_name: '净效率公式',
    enabled: Number(formulaRow?.enabled) === 1 ? 1 : 0,
    expression,
    expression_text: formatNetEfficiencyFormulaTokens(expression),
    updated_at: formulaRow?.updated_at || null,
    updated_by_name: formulaRow?.updated_by_name || null,
    last_adjustment_record: formulaRow?.updated_at
      ? `${formulaRow.updated_at}${formulaRow.updated_by_name ? ` · ${formulaRow.updated_by_name}` : ''}`
      : '未调整',
  }
}

function evaluateNetEfficiencyByFormula(expression, context = {}) {
  const tokens = normalizeNetEfficiencyFormulaTokens(expression)
  const resolvedValue = (token) => {
    const value = Number(context[token] || 0)
    return Number.isFinite(value) ? value : 0
  }

  let result = resolvedValue(tokens[0])
  for (let index = 1; index < tokens.length; index += 2) {
    const operator = tokens[index]
    const rightValue = resolvedValue(tokens[index + 1])
    if (operator === NET_EFFICIENCY_FORMULA_OPERATORS.ADD) result += rightValue
    if (operator === NET_EFFICIENCY_FORMULA_OPERATORS.SUB) result -= rightValue
    if (operator === NET_EFFICIENCY_FORMULA_OPERATORS.MUL) result *= rightValue
    if (operator === NET_EFFICIENCY_FORMULA_OPERATORS.DIV) {
      if (rightValue === 0) return null
      result /= rightValue
    }
  }
  return toDecimal2(result)
}

function buildNetEfficiencyContext({
  totalOwnerEstimateHours = 0,
  totalPersonalEstimateHours = 0,
  totalActualHours = 0,
  taskDifficultyCoefficient = 1,
  jobLevelWeightCoefficient = 1,
} = {}) {
  return {
    [NET_EFFICIENCY_FORMULA_VARIABLES.OWNER_HOURS]: Number(totalOwnerEstimateHours || 0),
    [NET_EFFICIENCY_FORMULA_VARIABLES.PERSONAL_HOURS]: Number(totalPersonalEstimateHours || 0),
    [NET_EFFICIENCY_FORMULA_VARIABLES.ACTUAL_HOURS]: Number(totalActualHours || 0),
    [NET_EFFICIENCY_FORMULA_VARIABLES.TASK_DIFFICULTY_COEFF]: Number(taskDifficultyCoefficient || 1) || 1,
    [NET_EFFICIENCY_FORMULA_VARIABLES.JOB_LEVEL_COEFF]: Number(jobLevelWeightCoefficient || 1) || 1,
  }
}

function calcActualWeightedCoefficient(rows = [], coefficientKey, hoursKey = 'total_actual_hours') {
  const weighted = (rows || []).reduce(
    (acc, item) => {
      const hours = Number(item?.[hoursKey] || 0)
      const coefficient = Number(item?.[coefficientKey] || 0)
      if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(coefficient) || coefficient <= 0) return acc
      acc.totalHours += hours
      acc.totalValue += hours * coefficient
      return acc
    },
    { totalHours: 0, totalValue: 0 },
  )

  if (weighted.totalHours > 0) {
    return toDecimal4(weighted.totalValue / weighted.totalHours)
  }

  const fallbackList = (rows || [])
    .map((item) => Number(item?.[coefficientKey] || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (fallbackList.length === 0) return 1
  return toDecimal4(fallbackList.reduce((sum, value) => sum + value, 0) / fallbackList.length)
}

function calcAssignableHours(todayPlannedHours, todayActualHours) {
  const planned = Number(todayPlannedHours || 0)
  const actual = Number(todayActualHours || 0)
  const baseline = Math.max(
    Number.isFinite(planned) ? planned : 0,
    Number.isFinite(actual) ? actual : 0,
  )
  return toDecimal1(Math.max(0, DEFAULT_DAILY_CAPACITY_HOURS - baseline))
}

function getBeijingTodayDateString() {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = formatter.formatToParts(new Date())
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    if (map.year && map.month && map.day) {
      return `${map.year}-${map.month}-${map.day}`
    }
  } catch {
    // ignore and fallback to local runtime date
  }

  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function normalizeDatePrefix(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(text)) return text.slice(0, 10)
  return normalizeDateOnly(text)
}

function calcUnifiedWorkStatus({
  logStatus,
  expectedCompletionDate,
  logCompletedAt,
  updatedAt,
  todayDate,
  progressRisk = false,
} = {}) {
  const status = String(logStatus || 'IN_PROGRESS')
    .trim()
    .toUpperCase()
  const today = normalizeDateOnly(todayDate) || getBeijingTodayDateString()
  const expectedDate = normalizeDatePrefix(expectedCompletionDate)
  const completedDate = normalizeDatePrefix(logCompletedAt) || normalizeDatePrefix(updatedAt)

  if (status !== 'DONE' && Boolean(progressRisk)) {
    return WORK_UNIFIED_STATUS.RISK
  }

  if (status !== 'DONE') {
    if (expectedDate && expectedDate < today) return WORK_UNIFIED_STATUS.OVERDUE
    if (expectedDate && expectedDate === today) return WORK_UNIFIED_STATUS.DUE_TODAY
    return WORK_UNIFIED_STATUS.NORMAL
  }

  if (expectedDate && completedDate && completedDate > expectedDate) {
    return WORK_UNIFIED_STATUS.LATE_DONE
  }
  return WORK_UNIFIED_STATUS.ON_TIME_DONE
}

function withUnifiedWorkStatus(row, { todayDate, progressRisk } = {}) {
  if (!row || typeof row !== 'object') return row
  return {
    ...row,
    unified_status: calcUnifiedWorkStatus({
      logStatus: row.log_status,
      expectedCompletionDate: row.expected_completion_date,
      logCompletedAt: row.log_completed_at,
      updatedAt: row.updated_at,
      todayDate,
      progressRisk: progressRisk ?? row.progress_risk,
    }),
  }
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

function getBeijingCurrentHour() {
  try {
    const hourText = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      hour12: false,
    }).format(new Date())
    const hour = Number(hourText)
    if (Number.isFinite(hour)) return hour
  } catch {
    // ignore and fallback to local runtime hour
  }
  const fallbackHour = new Date().getHours()
  return Number.isFinite(fallbackHour) ? fallbackHour : 0
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
  const riskBaselineDays = Math.max(0, Math.min(totalDays, elapsedDays - 1))
  const riskBaselineProgress = toPercent2((riskBaselineDays / totalDays) * 100)
  const riskBaselineGap = toPercent2(riskBaselineProgress - actualProgress)
  const beijingHour = getBeijingCurrentHour()
  const riskCheckEnabled = beijingHour >= 18
  const isOverdue = Boolean(expectedCompletionDate && todayDate && String(expectedCompletionDate) < String(todayDate))
  const hasCarryoverLag = riskBaselineGap > 0
  const risk = isOverdue || hasCarryoverLag || (riskCheckEnabled && gap > 0)

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
  completedOnly = false,
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

  if (completedOnly) {
    conditions.push("COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'")
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
  DEMAND_MANAGEMENT_MODES,
  DEMAND_HEALTH_STATUSES,
  WORK_LOG_STATUSES,
  WORK_UNIFIED_STATUSES: WORK_UNIFIED_STATUS_VALUES,
  WORK_LOG_TASK_SOURCES,
  EFFICIENCY_FACTOR_TYPES,
  NET_EFFICIENCY_FORMULA_VARIABLES,
  NET_EFFICIENCY_FORMULA_OPERATORS,
  NET_EFFICIENCY_FORMULA_ITEM_CODE,
  DEFAULT_NET_EFFICIENCY_FORMULA_TOKENS,
  normalizeNetEfficiencyFormulaTokens,
  serializeNetEfficiencyFormulaTokens,
  formatNetEfficiencyFormulaTokens,
  buildNetEfficiencyFormulaConfig,
  evaluateNetEfficiencyByFormula,

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
    const row = rows[0]
    if (!row) return null
    return row
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
    return (rows || []).map((row) => ({
      phase_key: row.phase_key,
      phase_name: row.phase_name,
      sort_order: Number(row.sort_order) || 0,
      enabled: Number(row.enabled) === 1 ? 1 : 0,
    }))
  },

  async listProjectTemplatePhaseTypes({ enabledOnly = true } = {}) {
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
      [PROJECT_TEMPLATE_PHASE_DICT_KEY],
    )
    return (rows || []).map((row) => ({
      phase_key: row.phase_key,
      phase_name: row.phase_name,
      sort_order: Number(row.sort_order) || 0,
      enabled: Number(row.enabled) === 1 ? 1 : 0,
    }))
  },

  async findDemandCommunicationTypeByCode(code, { enabledOnly = true } = {}) {
    const normalizedCode = normalizeText(code, 50).toUpperCase()
    if (!normalizedCode) return null
    const whereEnabled = enabledOnly ? 'AND i.enabled = 1' : ''
    const [rows] = await pool.query(
      `SELECT
         i.id,
         i.item_code,
         i.item_name,
         i.enabled,
         i.sort_order,
         i.color
       FROM config_dict_items i
       INNER JOIN config_dict_types t ON t.type_key = i.type_key
       WHERE i.type_key = ?
         AND i.item_code = ?
         AND t.enabled = 1
         ${whereEnabled}
       LIMIT 1`,
      [DEMAND_COMMUNICATION_TYPE_DICT_KEY, normalizedCode],
    )
    return rows[0] || null
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

  async listProjectTemplates({
    page = 1,
    pageSize = 20,
    keyword = '',
    status = null,
  } = {}) {
    const normalizedPage = Math.max(1, Number(page) || 1)
    const normalizedPageSize = Math.min(200, Math.max(1, Number(pageSize) || 20))
    const offset = (normalizedPage - 1) * normalizedPageSize
    const conditions = ['1 = 1']
    const params = []

    if (keyword) {
      conditions.push('(name LIKE ? OR description LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`)
    }
    if (status === 0 || status === 1) {
      conditions.push('status = ?')
      params.push(status)
    }

    const whereSql = conditions.join(' AND ')
    const [rows] = await pool.query(
      `SELECT
         id,
         name,
         description,
         node_config,
         status,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM project_templates
       WHERE ${whereSql}
       ORDER BY updated_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, normalizedPageSize, offset],
    )

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM project_templates
       WHERE ${whereSql}`,
      params,
    )

    const list = (rows || []).map((row) => ({
      id: Number(row.id),
      name: row.name,
      description: row.description || '',
      node_config: parseProjectTemplateNodeConfig(row.node_config),
      status: Number(row.status) === 1 ? 1 : 0,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    }))

    return {
      rows: list,
      total: Number(total || 0),
      page: normalizedPage,
      pageSize: normalizedPageSize,
    }
  },

  async findProjectTemplateById(templateId, { enabledOnly = false } = {}) {
    const id = toPositiveInt(templateId)
    if (!id) return null

    const conditions = ['id = ?']
    const params = [id]
    if (enabledOnly) {
      conditions.push('status = 1')
    }

    const [rows] = await pool.query(
      `SELECT
         id,
         name,
         description,
         node_config,
         status,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM project_templates
       WHERE ${conditions.join(' AND ')}
       LIMIT 1`,
      params,
    )
    const row = rows[0]
    if (!row) return null
    return {
      id: Number(row.id),
      name: row.name,
      description: row.description || '',
      node_config: parseProjectTemplateNodeConfig(row.node_config),
      status: Number(row.status) === 1 ? 1 : 0,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    }
  },

  async createProjectTemplate({ name, description = '', nodeConfig = [], status = 1 }) {
    const [result] = await pool.query(
      `INSERT INTO project_templates (name, description, node_config, status)
       VALUES (?, ?, CAST(? AS JSON), ?)`,
      [name, description || null, JSON.stringify(nodeConfig || []), status === 1 ? 1 : 0],
    )
    return Number(result.insertId)
  },

  async updateProjectTemplate(templateId, { name, description = '', nodeConfig = [], status = 1 }) {
    const [result] = await pool.query(
      `UPDATE project_templates
       SET
         name = ?,
         description = ?,
         node_config = CAST(? AS JSON),
         status = ?
       WHERE id = ?`,
      [
        name,
        description || null,
        JSON.stringify(nodeConfig || []),
        status === 1 ? 1 : 0,
        templateId,
      ],
    )
    return Number(result.affectedRows || 0)
  },

  async listNotificationConfigs() {
    let rows = []
    try {
      const [queryRows] = await pool.query(
        `SELECT
           id,
           scene,
           enabled,
           receiver_roles,
           advance_days,
           DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
         FROM notification_config
         ORDER BY scene ASC`,
      )
      rows = queryRows
    } catch (err) {
      if (!isMissingTableError(err)) throw err
      return []
    }

    const sceneMap = new Map()
    ;(rows || []).forEach((row) => {
      const scene = String(row.scene || '').trim()
      if (!scene) return
      sceneMap.set(scene, {
        id: Number(row.id),
        scene,
        enabled: Number(row.enabled) === 1 ? 1 : 0,
        receiver_roles: parseJsonArray(row.receiver_roles, []),
        advance_days: Number(row.advance_days || 0),
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
      })
    })

    DEFAULT_NOTIFICATION_SCENES.forEach((scene) => {
      if (sceneMap.has(scene)) return
      sceneMap.set(scene, {
        id: null,
        scene,
        enabled: 1,
        receiver_roles: [],
        advance_days: 0,
        created_at: null,
        updated_at: null,
      })
    })

    return Array.from(sceneMap.values()).sort((a, b) => String(a.scene).localeCompare(String(b.scene)))
  },

  async findNotificationConfigByScene(scene) {
    const normalizedScene = normalizeText(scene, 50).toLowerCase()
    if (!normalizedScene) return null

    try {
      const [rows] = await pool.query(
        `SELECT
           id,
           scene,
           enabled,
           receiver_roles,
           advance_days,
           DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
         FROM notification_config
         WHERE scene = ?
         LIMIT 1`,
        [normalizedScene],
      )
      const row = rows[0] || null
      if (!row) return null
      return {
        id: Number(row.id),
        scene: row.scene,
        enabled: Number(row.enabled) === 1 ? 1 : 0,
        receiver_roles: parseJsonArray(row.receiver_roles, []),
        advance_days: Number(row.advance_days || 0),
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
      }
    } catch (err) {
      if (isMissingTableError(err)) return null
      throw err
    }
  },

  async upsertNotificationConfig(scene, { enabled = 1, receiverRoles = [], advanceDays = 0 } = {}) {
    const normalizedScene = normalizeText(scene, 50).toLowerCase()
    if (!normalizedScene) return 0

    const normalizedRoles = Array.isArray(receiverRoles)
      ? receiverRoles
          .map((item) => normalizeText(item, 64))
          .filter(Boolean)
      : []

    const [result] = await pool.query(
      `INSERT INTO notification_config (scene, enabled, receiver_roles, advance_days)
       VALUES (?, ?, CAST(? AS JSON), ?)
       ON DUPLICATE KEY UPDATE
         enabled = VALUES(enabled),
         receiver_roles = VALUES(receiver_roles),
         advance_days = VALUES(advance_days),
         updated_at = CURRENT_TIMESTAMP`,
      [
        normalizedScene,
        Number(enabled) === 1 ? 1 : 0,
        JSON.stringify(normalizedRoles),
        Math.max(0, Number(advanceDays) || 0),
      ],
    )
    return Number(result?.affectedRows || 0)
  },

  async listEfficiencyFactorSettings() {
    await ensureEfficiencyFactorSettingsTable()

    const [rows] = await pool.query(
      `SELECT
         e.id,
         e.factor_type,
         e.item_code,
         e.item_name_snapshot,
         e.coefficient,
         e.enabled,
         e.remark,
         e.updated_by,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS updated_by_name,
         DATE_FORMAT(e.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(e.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM efficiency_factor_settings e
       LEFT JOIN users u ON u.id = e.updated_by
       ORDER BY factor_type ASC, item_code ASC`,
    )

    return (rows || []).map((row) => ({
      id: Number(row.id),
      factor_type: row.factor_type,
      item_code: row.item_code,
      item_name_snapshot: row.item_name_snapshot || row.item_code || '',
      coefficient: Number(Number(row.coefficient || 1).toFixed(2)),
      enabled: Number(row.enabled) === 1 ? 1 : 0,
      remark: row.remark || '',
      updated_by: toPositiveInt(row.updated_by),
      updated_by_name: row.updated_by_name || '',
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    }))
  },

  async upsertEfficiencyFactorSettings(settings = [], { updatedBy = null } = {}) {
    await ensureEfficiencyFactorSettingsTable()
    if (!Array.isArray(settings) || settings.length === 0) return 0

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      let affectedRows = 0

      for (const item of settings) {
        const factorType = normalizeText(item?.factor_type, 64).toUpperCase()
        const itemCode = normalizeText(item?.item_code, 64).toUpperCase()
        if (!factorType || !itemCode) continue

        const coefficient = normalizeDecimal(item?.coefficient, 1)
        const enabled = Number(item?.enabled) === 1 ? 1 : 0
        const remark = normalizeText(item?.remark, 255) || null
        const itemNameSnapshot = normalizeText(item?.item_name_snapshot, 128) || itemCode
        const [result] = await conn.query(
          `INSERT INTO efficiency_factor_settings
             (factor_type, item_code, item_name_snapshot, coefficient, enabled, remark, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             item_name_snapshot = VALUES(item_name_snapshot),
             coefficient = VALUES(coefficient),
             enabled = VALUES(enabled),
             remark = VALUES(remark),
             updated_by = VALUES(updated_by),
             updated_at = CURRENT_TIMESTAMP`,
          [
            factorType,
            itemCode,
            itemNameSnapshot,
            coefficient === null ? 1 : coefficient,
            enabled,
            remark,
            toPositiveInt(updatedBy),
          ],
        )
        affectedRows += Number(result?.affectedRows || 0)
      }

      await conn.commit()
      return affectedRows
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
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
    completedOnly = false,
    excludeCompleted = false,
    cancelledOnly = false,
    excludeCancelled = false,
  } = {}) {
    const offset = (page - 1) * pageSize
    const baseConditions = ['1 = 1']
    const baseParams = []

    if (keyword) {
      baseConditions.push('(d.id LIKE ? OR d.name LIKE ?)')
      baseParams.push(`%${keyword}%`, `%${keyword}%`)
    }

    if (status) {
      baseConditions.push('d.status = ?')
      baseParams.push(normalizeStatus(status))
    }

    if (priority) {
      baseConditions.push('d.priority = ?')
      baseParams.push(normalizePriority(priority))
    }

    if (ownerUserId) {
      baseConditions.push('d.owner_user_id = ?')
      baseParams.push(ownerUserId)
    }

    if (updatedStartDate) {
      baseConditions.push('d.updated_at >= ?')
      baseParams.push(`${updatedStartDate} 00:00:00`)
    }

    if (updatedEndDate) {
      baseConditions.push('d.updated_at < DATE_ADD(?, INTERVAL 1 DAY)')
      baseParams.push(updatedEndDate)
    }

    if (mineUserId) {
      baseConditions.push(
        `(d.owner_user_id = ? OR EXISTS (
          SELECT 1 FROM work_logs mwl WHERE mwl.demand_id = d.id AND mwl.user_id = ?
        ))`,
      )
      baseParams.push(mineUserId, mineUserId)
    }

    const conditions = [...baseConditions]
    const params = [...baseParams]

    if (completedOnly) {
      conditions.push("d.status = 'DONE'")
    } else if (cancelledOnly) {
      conditions.push("d.status = 'CANCELLED'")
    } else {
      if (excludeCompleted) {
        conditions.push("d.status <> 'DONE'")
      }
      if (excludeCancelled) {
        conditions.push("d.status <> 'CANCELLED'")
      }
    }

    if (businessGroupCode) {
      conditions.push('d.business_group_code = ?')
      params.push(businessGroupCode)
    }

    const activeConditions = [...baseConditions, "d.status <> 'DONE'", "d.status <> 'CANCELLED'"]
    const activeWhereSql = activeConditions.join(' AND ')
    const whereSql = conditions.join(' AND ')
    const normalizedPriorityOrder = String(priorityOrder || '').trim().toLowerCase() === 'desc' ? 'DESC' : 'ASC'
    const orderSql = priorityOrder
      ? `ORDER BY
        CASE d.priority
          WHEN 'P0' THEN 0
          WHEN 'P1' THEN 1
          WHEN 'P2' THEN 2
          ELSE 3
        END ${normalizedPriorityOrder},
        d.created_at DESC,
        d.id DESC`
      : `ORDER BY d.created_at DESC, d.id DESC`
    const listSql = `
      SELECT
        d.id,
        d.name,
        d.owner_user_id,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS owner_name,
        d.management_mode,
        d.template_id,
        d.participant_roles_json,
        pt.name AS template_name,
        pt.node_config AS template_node_config,
        d.project_manager,
        COALESCE(NULLIF(pm.real_name, ''), pm.username) AS project_manager_name,
        d.health_status,
        DATE_FORMAT(d.actual_start_time, '%Y-%m-%d %H:%i:%s') AS actual_start_time,
        DATE_FORMAT(d.actual_end_time, '%Y-%m-%d %H:%i:%s') AS actual_end_time,
        d.doc_link,
        d.ui_design_link,
        d.test_case_link,
        d.business_group_code,
        bg.item_name AS business_group_name,
        DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS expected_release_date,
        ci.current_node_key,
        ci.current_node_name,
        ci.current_phase_key,
        ci.current_phase_name,
        ci.current_node_planned_start_date,
        ci.current_node_planned_end_date,
        d.status,
        d.priority,
        d.description,
        d.created_by,
        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
        DATE_FORMAT(d.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
        COALESCE(pm2.member_count, 0) AS member_count,
        COALESCE(d.overall_estimated_hours, ta.total_personal_estimate_hours, 0) AS total_personal_estimate_hours,
        COALESCE(d.overall_actual_hours, ta.total_actual_hours, 0) AS total_actual_hours,
        COALESCE(d.overall_estimated_hours, 0) AS overall_estimated_hours,
        COALESCE(d.overall_actual_hours, 0) AS overall_actual_hours,
        COALESCE(lr.remaining_hours, 0) AS latest_remaining_hours
      FROM work_demands d
      LEFT JOIN users u ON u.id = d.owner_user_id
      LEFT JOIN users pm ON pm.id = d.project_manager
      LEFT JOIN project_templates pt ON pt.id = d.template_id
      LEFT JOIN config_dict_items bg
        ON bg.type_key = '${BUSINESS_GROUP_DICT_KEY}'
       AND bg.item_code = d.business_group_code
      LEFT JOIN (
        SELECT
          x.biz_id AS demand_id,
          x.current_node_key,
          COALESCE(NULLIF(n.node_name_snapshot, ''), NULLIF(pdi_node.item_name, ''), NULLIF(pdi_phase.item_name, ''), '-') AS current_node_name,
          COALESCE(NULLIF(n.phase_key, ''), '') AS current_phase_key,
          COALESCE(pdi_phase.item_name, NULLIF(pdi_node.item_name, ''), '-') AS current_phase_name,
          DATE_FORMAT(n.planned_start_time, '%Y-%m-%d') AS current_node_planned_start_date,
          DATE_FORMAT(n.planned_end_time, '%Y-%m-%d') AS current_node_planned_end_date
        FROM wf_process_instances x
        LEFT JOIN wf_process_instance_nodes n
          ON n.instance_id = x.id
         AND n.node_key = x.current_node_key
        LEFT JOIN config_dict_items pdi_phase
          ON pdi_phase.type_key = '${DEMAND_PHASE_DICT_KEY}'
         AND pdi_phase.item_code = n.phase_key
        LEFT JOIN config_dict_items pdi_node
          ON pdi_node.type_key = '${DEMAND_PHASE_DICT_KEY}'
         AND pdi_node.item_code = n.node_key
        INNER JOIN (
          SELECT biz_id, MAX(id) AS latest_instance_id
          FROM wf_process_instances
          WHERE biz_type = 'DEMAND'
            AND status <> 'TERMINATED'
          GROUP BY biz_id
        ) latest
          ON latest.latest_instance_id = x.id
      ) ci ON ci.demand_id = d.id
      LEFT JOIN (
        SELECT demand_id, COUNT(*) AS member_count
        FROM project_members
        GROUP BY demand_id
      ) pm2 ON pm2.demand_id = d.id
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
      ${orderSql}
      LIMIT ? OFFSET ?`

    const [rows] = await pool.query(listSql, [...params, pageSize, offset])
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM work_demands d
       WHERE ${whereSql}`,
      params,
    )
    const [[{ all_total: allTotal }]] = await pool.query(
      `SELECT COUNT(*) AS all_total
       FROM work_demands d
       WHERE ${activeWhereSql}`,
      baseParams,
    )
    const [[{ completed_total: completedTotal }]] = await pool.query(
      `SELECT COUNT(*) AS completed_total
       FROM work_demands d
       WHERE ${baseConditions.join(' AND ')}
         AND d.status = 'DONE'`,
      baseParams,
    )
    const [[{ cancelled_total: cancelledTotal }]] = await pool.query(
      `SELECT COUNT(*) AS cancelled_total
       FROM work_demands d
       WHERE ${baseConditions.join(' AND ')}
         AND d.status = 'CANCELLED'`,
      baseParams,
    )
    const [groupCountRows] = await pool.query(
      `SELECT
         COALESCE(d.business_group_code, '') AS business_group_code,
         COALESCE(bg.item_name, d.business_group_code, '') AS business_group_name,
         COUNT(*) AS total
       FROM work_demands d
       LEFT JOIN config_dict_items bg
         ON bg.type_key = '${BUSINESS_GROUP_DICT_KEY}'
        AND bg.item_code = d.business_group_code
       WHERE ${activeWhereSql}
       GROUP BY d.business_group_code, bg.item_name
       ORDER BY total DESC, business_group_code ASC`,
      baseParams,
    )
    const [templatePhaseRows] = await pool.query(
      `SELECT item_code, item_name
       FROM config_dict_items
       WHERE type_key = ?
         AND enabled = 1`,
      [PROJECT_TEMPLATE_PHASE_DICT_KEY],
    )

    const todayDate = getBeijingTodayDateString()
    const templatePhaseNameMap = buildPhaseNameMap(templatePhaseRows)
    const normalizedRows = (rows || []).map((row) => {
      const { participant_roles_json: _participantRolesJson, template_node_config: _templateNodeConfig, ...rest } = row || {}
      const resolvedCurrentPhase = resolveDemandCurrentPhaseFromTemplate(row, templatePhaseNameMap)
      return withUnifiedWorkStatus(
        {
          ...rest,
          ...resolvedCurrentPhase,
          participant_roles: normalizeParticipantRoles(row?.participant_roles_json),
        },
        { todayDate },
      )
    })
    return {
      rows: normalizedRows,
      total,
      allTotal: Number(allTotal || 0),
      completedTotal: Number(completedTotal || 0),
      cancelledTotal: Number(cancelledTotal || 0),
      groupCounts: (groupCountRows || []).map((item) => ({
        business_group_code: item.business_group_code || '',
        business_group_name: item.business_group_name || item.business_group_code || '',
        total: Number(item.total || 0),
      })),
    }
  },

  async findDemandById(id) {
    const [rows] = await pool.query(
      `SELECT
         d.id,
         d.name,
         d.owner_user_id,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS owner_name,
         d.management_mode,
         d.template_id,
         d.participant_roles_json,
         pt.name AS template_name,
         d.project_manager,
         COALESCE(NULLIF(pm.real_name, ''), pm.username) AS project_manager_name,
         d.health_status,
         DATE_FORMAT(d.actual_start_time, '%Y-%m-%d %H:%i:%s') AS actual_start_time,
         DATE_FORMAT(d.actual_end_time, '%Y-%m-%d %H:%i:%s') AS actual_end_time,
         d.doc_link,
         d.ui_design_link,
         d.test_case_link,
         COALESCE(d.overall_estimated_hours, 0) AS overall_estimated_hours,
         COALESCE(d.overall_actual_hours, 0) AS overall_actual_hours,
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
         COALESCE(pm2.member_count, 0) AS member_count
       FROM work_demands d
       LEFT JOIN users u ON u.id = d.owner_user_id
       LEFT JOIN users pm ON pm.id = d.project_manager
       LEFT JOIN project_templates pt ON pt.id = d.template_id
       LEFT JOIN config_dict_items bg
         ON bg.type_key = '${BUSINESS_GROUP_DICT_KEY}'
        AND bg.item_code = d.business_group_code
       LEFT JOIN (
         SELECT demand_id, COUNT(*) AS member_count
         FROM project_members
         GROUP BY demand_id
       ) pm2 ON pm2.demand_id = d.id
       WHERE d.id = ?`,
      [id],
    )
    const todayDate = getBeijingTodayDateString()
    const row = rows[0] || null
    const normalizedRow = row
      ? (() => {
          const { participant_roles_json: _participantRolesJson, ...rest } = row
          return {
            ...rest,
            participant_roles: normalizeParticipantRoles(row?.participant_roles_json),
          }
        })()
      : null
    return withUnifiedWorkStatus(
      normalizedRow,
      { todayDate },
    )
  },

  async createDemand({
    demandId = '',
    name,
    ownerUserId,
    managementMode = 'simple',
    templateId = null,
    participantRoles = [],
    projectManager = null,
    healthStatus = 'green',
    actualStartTime = null,
    actualEndTime = null,
    docLink = null,
    uiDesignLink = null,
    testCaseLink = null,
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
          id, name, owner_user_id, management_mode, template_id, participant_roles_json, project_manager, health_status,
          actual_start_time, actual_end_time, doc_link, ui_design_link, test_case_link, business_group_code,
          expected_release_date, status, priority, description, created_by
        ) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalDemandId,
          name,
          ownerUserId,
          normalizeManagementMode(managementMode),
          toPositiveInt(templateId),
          JSON.stringify(normalizeParticipantRoles(participantRoles)),
          toPositiveInt(projectManager),
          normalizeHealthStatus(healthStatus),
          normalizeDateTime(actualStartTime, null),
          normalizeDateTime(actualEndTime, null),
          normalizeText(docLink, 500) || null,
          normalizeText(uiDesignLink, 500) || null,
          normalizeText(testCaseLink, 500) || null,
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
      managementMode = 'simple',
      templateId = null,
      participantRoles = [],
      projectManager = null,
      healthStatus = 'green',
      actualStartTime = null,
      actualEndTime = null,
      docLink = null,
      uiDesignLink = null,
      testCaseLink = null,
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
         management_mode = ?,
         template_id = ?,
         participant_roles_json = CAST(? AS JSON),
         project_manager = ?,
         health_status = ?,
         actual_start_time = ?,
         actual_end_time = ?,
         doc_link = ?,
         ui_design_link = ?,
         test_case_link = ?,
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
        normalizeManagementMode(managementMode),
        toPositiveInt(templateId),
        JSON.stringify(normalizeParticipantRoles(participantRoles)),
        toPositiveInt(projectManager),
        normalizeHealthStatus(healthStatus),
        normalizeDateTime(actualStartTime, null),
        normalizeDateTime(actualEndTime, null),
        normalizeText(docLink, 500) || null,
        normalizeText(uiDesignLink, 500) || null,
        normalizeText(testCaseLink, 500) || null,
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

  async calculateDemandHourSummary(demandId, { conn = null } = {}) {
    const normalizedDemandId = String(demandId || '').trim().toUpperCase()
    if (!normalizedDemandId) {
      return {
        overall_estimated_hours: 0,
        overall_actual_hours: 0,
      }
    }

    const db = conn || pool

    let latestInstanceId = null
    let workflowTaskEstimatedHours = 0
    let workflowNodeEstimatedHours = 0
    let workflowNodeActualHours = 0

    try {
      const [instanceRows] = await db.query(
        `SELECT id
         FROM wf_process_instances
         WHERE biz_type = 'DEMAND'
           AND biz_id = ?
           AND status <> 'TERMINATED'
         ORDER BY id DESC
         LIMIT 1`,
        [normalizedDemandId],
      )
      latestInstanceId = Number(instanceRows?.[0]?.id || 0) || null

      if (latestInstanceId) {
        const [[taskAggRow]] = await db.query(
          `SELECT ROUND(COALESCE(SUM(CASE
                    WHEN COALESCE(status, 'TODO') <> 'CANCELLED' AND COALESCE(personal_estimated_hours, 0) > 0
                      THEN personal_estimated_hours
                    ELSE 0
                  END), 0), 1) AS total_estimated_hours
           FROM wf_process_tasks
           WHERE instance_id = ?`,
          [latestInstanceId],
        )
        workflowTaskEstimatedHours = normalizeDecimal(taskAggRow?.total_estimated_hours, 0) || 0

        const [[nodeAggRow]] = await db.query(
          `SELECT
             ROUND(COALESCE(SUM(CASE
               WHEN COALESCE(status, 'TODO') <> 'CANCELLED'
                 THEN COALESCE(personal_estimated_hours, owner_estimated_hours, 0)
               ELSE 0
             END), 0), 1) AS total_estimated_hours,
             ROUND(COALESCE(SUM(CASE
               WHEN COALESCE(status, 'TODO') <> 'CANCELLED'
                 THEN COALESCE(actual_hours, 0)
               ELSE 0
             END), 0), 1) AS total_actual_hours
           FROM wf_process_instance_nodes
           WHERE instance_id = ?`,
          [latestInstanceId],
        )
        workflowNodeEstimatedHours = normalizeDecimal(nodeAggRow?.total_estimated_hours, 0) || 0
        workflowNodeActualHours = normalizeDecimal(nodeAggRow?.total_actual_hours, 0) || 0
      }
    } catch (err) {
      if (!isMissingTableError(err)) throw err
    }

    const [[manualLogAggRow]] = await db.query(
      `SELECT
         ROUND(COALESCE(SUM(CASE
           WHEN COALESCE(log_status, 'IN_PROGRESS') <> 'CANCELLED'
             AND COALESCE(task_source, 'SELF') <> 'WORKFLOW_AUTO'
             AND COALESCE(personal_estimate_hours, 0) > 0
             THEN personal_estimate_hours
           ELSE 0
         END), 0), 1) AS total_estimated_hours,
         ROUND(COALESCE(SUM(CASE
           WHEN COALESCE(log_status, 'IN_PROGRESS') <> 'CANCELLED'
             THEN COALESCE(actual_hours, 0)
           ELSE 0
         END), 0), 1) AS total_actual_hours
       FROM work_logs
       WHERE demand_id = ?`,
      [normalizedDemandId],
    )

    const manualLogEstimatedHours = normalizeDecimal(manualLogAggRow?.total_estimated_hours, 0) || 0
    const logActualHours = normalizeDecimal(manualLogAggRow?.total_actual_hours, 0) || 0

    const rolledEstimatedHours =
      workflowTaskEstimatedHours + manualLogEstimatedHours > 0
        ? normalizeDecimal(workflowTaskEstimatedHours + manualLogEstimatedHours, 0) || 0
        : workflowNodeEstimatedHours
    const rolledActualHours = logActualHours > 0 ? logActualHours : workflowNodeActualHours

    return {
      overall_estimated_hours: normalizeDecimal(rolledEstimatedHours, 0) || 0,
      overall_actual_hours: normalizeDecimal(rolledActualHours, 0) || 0,
    }
  },

  async refreshDemandHourSummary(demandId, { conn = null } = {}) {
    const normalizedDemandId = String(demandId || '').trim().toUpperCase()
    if (!normalizedDemandId) {
      return {
        overall_estimated_hours: 0,
        overall_actual_hours: 0,
      }
    }

    const db = conn || pool
    const summary = await this.calculateDemandHourSummary(normalizedDemandId, { conn: db })
    await db.query(
      `UPDATE work_demands
       SET overall_estimated_hours = ?, overall_actual_hours = ?
       WHERE id = ?`,
      [summary.overall_estimated_hours, summary.overall_actual_hours, normalizedDemandId],
    )
    return summary
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

  async listDemandMembers(demandId) {
    const normalizedDemandId = String(demandId || '').trim().toUpperCase()
    if (!normalizedDemandId) return []

    const [rows] = await pool.query(
      `SELECT
         pm.id,
         pm.demand_id,
         pm.user_id,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS user_name,
         u.username,
         DATE_FORMAT(pm.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM project_members pm
       LEFT JOIN users u ON u.id = pm.user_id
       WHERE pm.demand_id = ?
       ORDER BY pm.id ASC`,
      [normalizedDemandId],
    )

    return (rows || []).map((row) => ({
      id: Number(row.id),
      demand_id: row.demand_id,
      user_id: Number(row.user_id),
      user_name: row.user_name || '',
      username: row.username || '',
      created_at: row.created_at || null,
    }))
  },

  async addDemandMember(demandId, userId) {
    const normalizedDemandId = String(demandId || '').trim().toUpperCase()
    const normalizedUserId = toPositiveInt(userId)
    if (!normalizedDemandId || !normalizedUserId) return null

    await pool.query(
      `INSERT INTO project_members (demand_id, user_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
      [normalizedDemandId, normalizedUserId],
    )

    const [rows] = await pool.query(
      `SELECT
         pm.id,
         pm.demand_id,
         pm.user_id,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS user_name,
         u.username,
         DATE_FORMAT(pm.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM project_members pm
       LEFT JOIN users u ON u.id = pm.user_id
       WHERE pm.demand_id = ?
         AND pm.user_id = ?
       LIMIT 1`,
      [normalizedDemandId, normalizedUserId],
    )
    const row = rows[0] || null
    if (!row) return null
    return {
      id: Number(row.id),
      demand_id: row.demand_id,
      user_id: Number(row.user_id),
      user_name: row.user_name || '',
      username: row.username || '',
      created_at: row.created_at || null,
    }
  },

  async removeDemandMember(demandId, userId) {
    const normalizedDemandId = String(demandId || '').trim().toUpperCase()
    const normalizedUserId = toPositiveInt(userId)
    if (!normalizedDemandId || !normalizedUserId) return 0

    const [result] = await pool.query(
      `DELETE FROM project_members
       WHERE demand_id = ?
         AND user_id = ?`,
      [normalizedDemandId, normalizedUserId],
    )
    return Number(result?.affectedRows || 0)
  },

  async listDemandCommunications(demandId, { recordTypeCode = '', limit = 200 } = {}) {
    const normalizedDemandId = String(demandId || '').trim().toUpperCase()
    if (!normalizedDemandId) return []
    const normalizedRecordTypeCode = normalizeText(recordTypeCode, 50).toUpperCase()
    const normalizedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500)

    const conditions = ['dc.demand_id = ?']
    const params = [normalizedDemandId]
    if (normalizedRecordTypeCode) {
      conditions.push('dc.record_type_code = ?')
      params.push(normalizedRecordTypeCode)
    }

    const [rows] = await pool.query(
      `SELECT
         dc.id,
         dc.demand_id,
         dc.record_type_code,
         COALESCE(dti.item_name, dc.record_type_code) AS record_type_name,
         dti.color AS record_type_color,
         dc.content,
         dc.created_by,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS created_by_name,
         dc.updated_by,
         COALESCE(NULLIF(uu.real_name, ''), uu.username) AS updated_by_name,
         DATE_FORMAT(dc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(dc.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM work_demand_communications dc
       LEFT JOIN users u ON u.id = dc.created_by
       LEFT JOIN users uu ON uu.id = dc.updated_by
       LEFT JOIN config_dict_items dti
         ON dti.type_key = '${DEMAND_COMMUNICATION_TYPE_DICT_KEY}'
        AND dti.item_code = dc.record_type_code
       WHERE ${conditions.join(' AND ')}
       ORDER BY dc.created_at DESC, dc.id DESC
       LIMIT ?`,
      [...params, normalizedLimit],
    )

    return (rows || []).map((row) => ({
      id: Number(row.id),
      demand_id: row.demand_id,
      record_type_code: row.record_type_code || '',
      record_type_name: row.record_type_name || row.record_type_code || '',
      record_type_color: row.record_type_color || null,
      content: row.content || '',
      created_by: Number(row.created_by),
      created_by_name: row.created_by_name || '',
      updated_by: row.updated_by ? Number(row.updated_by) : null,
      updated_by_name: row.updated_by_name || '',
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    }))
  },

  async findDemandCommunicationById(id) {
    const normalizedId = toPositiveInt(id)
    if (!normalizedId) return null

    const [rows] = await pool.query(
      `SELECT
         dc.id,
         dc.demand_id,
         dc.record_type_code,
         COALESCE(dti.item_name, dc.record_type_code) AS record_type_name,
         dti.color AS record_type_color,
         dc.content,
         dc.created_by,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS created_by_name,
         dc.updated_by,
         COALESCE(NULLIF(uu.real_name, ''), uu.username) AS updated_by_name,
         DATE_FORMAT(dc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(dc.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM work_demand_communications dc
       LEFT JOIN users u ON u.id = dc.created_by
       LEFT JOIN users uu ON uu.id = dc.updated_by
       LEFT JOIN config_dict_items dti
         ON dti.type_key = '${DEMAND_COMMUNICATION_TYPE_DICT_KEY}'
        AND dti.item_code = dc.record_type_code
       WHERE dc.id = ?
       LIMIT 1`,
      [normalizedId],
    )

    const row = rows[0] || null
    if (!row) return null
    return {
      id: Number(row.id),
      demand_id: row.demand_id,
      record_type_code: row.record_type_code || '',
      record_type_name: row.record_type_name || row.record_type_code || '',
      record_type_color: row.record_type_color || null,
      content: row.content || '',
      created_by: Number(row.created_by),
      created_by_name: row.created_by_name || '',
      updated_by: row.updated_by ? Number(row.updated_by) : null,
      updated_by_name: row.updated_by_name || '',
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    }
  },

  async createDemandCommunication({
    demandId,
    recordTypeCode,
    content,
    createdBy,
  }) {
    const normalizedDemandId = String(demandId || '').trim().toUpperCase()
    const normalizedRecordTypeCode = normalizeText(recordTypeCode, 50).toUpperCase()
    const normalizedContent = normalizeText(content, 5000)
    const normalizedCreatedBy = toPositiveInt(createdBy)
    if (!normalizedDemandId || !normalizedRecordTypeCode || !normalizedContent || !normalizedCreatedBy) return null

    const [result] = await pool.query(
      `INSERT INTO work_demand_communications (
         demand_id,
         record_type_code,
         content,
         created_by,
         updated_by
       ) VALUES (?, ?, ?, ?, ?)`,
      [normalizedDemandId, normalizedRecordTypeCode, normalizedContent, normalizedCreatedBy, normalizedCreatedBy],
    )

    return this.findDemandCommunicationById(result.insertId)
  },

  async deleteDemandCommunication(id) {
    const normalizedId = toPositiveInt(id)
    if (!normalizedId) return 0

    const [result] = await pool.query(
      `DELETE FROM work_demand_communications
       WHERE id = ?`,
      [normalizedId],
    )
    return Number(result?.affectedRows || 0)
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
        d.management_mode,
        d.template_id,
        pt.name AS template_name,
        d.project_manager,
        COALESCE(NULLIF(pm.real_name, ''), pm.username) AS project_manager_name,
        d.health_status,
        DATE_FORMAT(d.actual_start_time, '%Y-%m-%d %H:%i:%s') AS actual_start_time,
        DATE_FORMAT(d.actual_end_time, '%Y-%m-%d %H:%i:%s') AS actual_end_time,
        d.doc_link,
        d.business_group_code,
        bg.item_name AS business_group_name,
        d.status,
        DATE_FORMAT(d.completed_at, '%Y-%m-%d %H:%i:%s') AS archived_at,
        DATE_FORMAT(d.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
        COALESCE(lc.related_log_count, 0) AS related_log_count,
        COALESCE(pm2.member_count, 0) AS member_count`
    const fromSql = `
      FROM work_demands d
      LEFT JOIN users u ON u.id = d.owner_user_id
      LEFT JOIN users pm ON pm.id = d.project_manager
      LEFT JOIN project_templates pt ON pt.id = d.template_id
      LEFT JOIN config_dict_items bg
        ON bg.type_key = '${BUSINESS_GROUP_DICT_KEY}'
       AND bg.item_code = d.business_group_code
      LEFT JOIN (
        SELECT demand_id, COUNT(*) AS member_count
        FROM project_members
        GROUP BY demand_id
      ) pm2 ON pm2.demand_id = d.id
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
      const [queryRows] = await pool.query(listSqlWithWorkflow, [...params, pageSize, offset])
      rows = queryRows
    } catch (err) {
      if (!isMissingTableError(err)) throw err
      const [queryRows] = await pool.query(listSqlWithoutWorkflow, [...params, pageSize, offset])
      rows = queryRows
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM work_demands d
       WHERE ${whereSql}`,
      params,
    )

    return { rows, total }
  },

  async restoreArchivedDemand(demandId) {
    const normalizedDemandId = String(demandId || '').trim().toUpperCase()
    if (!normalizedDemandId) {
      const err = new Error('demand_id_invalid')
      err.code = 'DEMAND_ID_INVALID'
      throw err
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [demandRows] = await conn.query(
        `SELECT id, status
         FROM work_demands
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [normalizedDemandId],
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

      let activeWorkflow = null
      try {
        const [workflowRows] = await conn.query(
          `SELECT id, status
           FROM wf_process_instances
           WHERE biz_type = 'DEMAND'
             AND biz_id = ?
           ORDER BY
             CASE status
               WHEN 'IN_PROGRESS' THEN 0
               WHEN 'NOT_STARTED' THEN 1
               ELSE 2
             END ASC,
             id DESC
           LIMIT 1`,
          [normalizedDemandId],
        )
        activeWorkflow = workflowRows[0] || null
      } catch (err) {
        if (!isMissingTableError(err)) throw err
      }

      const workflowStatus = String(activeWorkflow?.status || '').toUpperCase()
      const restoredStatus =
        workflowStatus === 'IN_PROGRESS' || workflowStatus === 'NOT_STARTED' ? 'IN_PROGRESS' : 'TODO'

      const [updateResult] = await conn.query(
        `UPDATE work_demands
         SET status = ?, completed_at = NULL, updated_at = NOW()
         WHERE id = ?`,
        [restoredStatus, normalizedDemandId],
      )

      await conn.commit()
      return {
        demand_id: normalizedDemandId,
        restored_status: restoredStatus,
        affected_rows: Number(updateResult?.affectedRows || 0),
        workflow_instance_id: activeWorkflow?.id ? Number(activeWorkflow.id) : null,
        workflow_status: workflowStatus || null,
      }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
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
    logStatus = '',
    unifiedStatus = '',
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
      conditions.push('COALESCE(l.expected_start_date, l.log_date) >= ?')
      params.push(startDate)
    }

    if (endDate) {
      conditions.push('COALESCE(l.expected_start_date, l.log_date) <= ?')
      params.push(endDate)
    }

    if (logStatus) {
      conditions.push(`COALESCE(l.log_status, 'IN_PROGRESS') = ?`)
      params.push(logStatus)
    }

    if (keyword) {
      conditions.push('(l.description LIKE ? OR COALESCE(l.demand_id, \'\') LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`)
    }

    const whereSql = conditions.join(' AND ')
    const listBaseSql = `
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
        l.self_task_difficulty_code,
        COALESCE(std.item_name, l.self_task_difficulty_code, NULL) AS self_task_difficulty_name,
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
        COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name,
        d.name AS demand_name,
        DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN users au ON au.id = l.assigned_by_user_id
      LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN config_dict_items std
        ON std.type_key = '${TASK_DIFFICULTY_DICT_KEY}'
       AND std.item_code = l.self_task_difficulty_code
      LEFT JOIN config_dict_items pdi
        ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
       AND pdi.item_code = l.phase_key
      WHERE ${whereSql}
      ORDER BY l.log_date DESC, l.id DESC`

    const todayDate = getBeijingTodayDateString()
    const normalizedUnifiedStatus = String(unifiedStatus || '').trim().toUpperCase()

    if (normalizedUnifiedStatus && WORK_UNIFIED_STATUS_VALUES.includes(normalizedUnifiedStatus)) {
      const [allRows] = await pool.query(listBaseSql, params)
      const normalizedRows = (allRows || []).map((row) =>
        withUnifiedWorkStatus(row, { todayDate }),
      )
      const filteredRows = normalizedRows.filter(
        (row) => String(row.unified_status || '').toUpperCase() === normalizedUnifiedStatus,
      )
      const total = filteredRows.length
      const pagedRows = filteredRows.slice(offset, offset + pageSize)
      return { rows: pagedRows, total }
    }

    const [rows] = await pool.query(`${listBaseSql} LIMIT ? OFFSET ?`, [...params, pageSize, offset])
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM work_logs l
       INNER JOIN users u ON u.id = l.user_id
       WHERE ${whereSql}`,
      params,
    )
    const normalizedRows = (rows || []).map((row) =>
      withUnifiedWorkStatus(row, { todayDate }),
    )
    return { rows: normalizedRows, total }
  },

  async findLogById(id) {
    const fullSql = `SELECT
       l.id,
       l.user_id,
       DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
       l.item_type_id,
       l.description,
       l.personal_estimate_hours,
       l.actual_hours,
       l.remaining_hours,
       l.self_task_difficulty_code,
       COALESCE(std.item_name, l.self_task_difficulty_code, NULL) AS self_task_difficulty_name,
       l.owner_estimate_hours,
       l.task_difficulty_code,
       COALESCE(td.item_name, l.task_difficulty_code, NULL) AS task_difficulty_name,
       COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
       COALESCE(l.task_source, 'SELF') AS task_source,
       l.relate_task_id,
       l.demand_id,
       l.phase_key,
       l.assigned_by_user_id,
       COALESCE(NULLIF(au.real_name, ''), au.username) AS assigned_by_name,
       DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
       DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
       DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
       DATE_FORMAT(l.owner_estimated_at, '%Y-%m-%d %H:%i:%s') AS owner_estimated_at,
       DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
       DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM work_logs l
     LEFT JOIN users au ON au.id = l.assigned_by_user_id
     LEFT JOIN config_dict_items std
       ON std.type_key = '${TASK_DIFFICULTY_DICT_KEY}'
      AND std.item_code = l.self_task_difficulty_code
     LEFT JOIN config_dict_items td
       ON td.type_key = '${TASK_DIFFICULTY_DICT_KEY}'
      AND td.item_code = l.task_difficulty_code
     WHERE l.id = ?`
    const ownerOnlySql = `SELECT
       l.id,
       l.user_id,
       DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
       l.item_type_id,
       l.description,
       l.personal_estimate_hours,
       l.actual_hours,
       l.remaining_hours,
       l.self_task_difficulty_code,
       COALESCE(std.item_name, l.self_task_difficulty_code, NULL) AS self_task_difficulty_name,
       l.owner_estimate_hours,
       l.task_difficulty_code,
       COALESCE(td.item_name, l.task_difficulty_code, NULL) AS task_difficulty_name,
       COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
       COALESCE(l.task_source, 'SELF') AS task_source,
       l.relate_task_id,
       l.demand_id,
       l.phase_key,
       l.assigned_by_user_id,
       COALESCE(NULLIF(au.real_name, ''), au.username) AS assigned_by_name,
       DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
       DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
       DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
       DATE_FORMAT(l.owner_estimated_at, '%Y-%m-%d %H:%i:%s') AS owner_estimated_at,
       DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
       DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM work_logs l
     LEFT JOIN users au ON au.id = l.assigned_by_user_id
     LEFT JOIN config_dict_items std
       ON std.type_key = '${TASK_DIFFICULTY_DICT_KEY}'
      AND std.item_code = l.self_task_difficulty_code
     LEFT JOIN config_dict_items td
       ON td.type_key = '${TASK_DIFFICULTY_DICT_KEY}'
      AND td.item_code = l.task_difficulty_code
     WHERE l.id = ?`
    const legacySql = `SELECT
       l.id,
       l.user_id,
       DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
       l.item_type_id,
       l.description,
       l.personal_estimate_hours,
       l.actual_hours,
       l.remaining_hours,
       NULL AS self_task_difficulty_code,
       NULL AS self_task_difficulty_name,
       NULL AS owner_estimate_hours,
       NULL AS task_difficulty_code,
       NULL AS task_difficulty_name,
       COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
       COALESCE(l.task_source, 'SELF') AS task_source,
       l.relate_task_id,
       l.demand_id,
       l.phase_key,
       l.assigned_by_user_id,
       COALESCE(NULLIF(au.real_name, ''), au.username) AS assigned_by_name,
       DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
       DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
       DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
       NULL AS owner_estimated_at,
       DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
       DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM work_logs l
     LEFT JOIN users au ON au.id = l.assigned_by_user_id
     WHERE l.id = ?`
    try {
      const [rows] = await pool.query(fullSql, [id])
      return rows[0] || null
    } catch (err) {
      if (!isMissingColumnError(err)) throw err
    }
    try {
      const [rows] = await pool.query(ownerOnlySql, [id])
      return rows[0] || null
    } catch (err) {
      if (!isMissingColumnError(err)) throw err
    }
    const [rows] = await pool.query(legacySql, [id])
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
    selfTaskDifficultyCode = null,
    ownerEstimateRequired = null,
  }) {
    const normalizedStatus = WORK_LOG_STATUSES.includes(String(logStatus || '').toUpperCase())
      ? String(logStatus).toUpperCase()
      : 'IN_PROGRESS'
    const normalizedOwnerEstimateRequired = normalizeNullableBooleanAsNumber(ownerEstimateRequired)
    try {
      const [result] = await pool.query(
        `INSERT INTO work_logs (
           user_id, log_date, item_type_id, description, personal_estimate_hours, actual_hours, remaining_hours, log_status, task_source, demand_id, phase_key, assigned_by_user_id, expected_start_date, expected_completion_date, log_completed_at, self_task_difficulty_code, owner_estimate_required
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'DONE' THEN COALESCE(?, NOW()) ELSE NULL END, ?, ?)`,
        [
          userId,
          logDate,
          itemTypeId,
          description,
          normalizeDecimal(personalEstimateHours, 0),
          normalizeDecimal(actualHours, 0),
          normalizeDecimal(remainingHours, 0),
          normalizedStatus,
          normalizeTaskSource(taskSource, 'SELF'),
          demandId,
          phaseKey,
          toPositiveInt(assignedByUserId),
          expectedStartDate,
          expectedCompletionDate,
          normalizedStatus,
          logCompletedAt,
          selfTaskDifficultyCode || null,
          normalizedOwnerEstimateRequired,
        ],
      )
      return result.insertId
    } catch (err) {
      if (!isMissingColumnError(err)) throw err
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
          normalizedStatus,
          normalizeTaskSource(taskSource, 'SELF'),
          demandId,
          phaseKey,
          toPositiveInt(assignedByUserId),
          expectedStartDate,
          expectedCompletionDate,
          normalizedStatus,
          logCompletedAt,
        ],
      )
      return result.insertId
    }
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
      selfTaskDifficultyCode = null,
      ownerEstimateRequired = null,
    },
  ) {
    const normalizedStatus = WORK_LOG_STATUSES.includes(String(logStatus || '').toUpperCase())
      ? String(logStatus).toUpperCase()
      : 'IN_PROGRESS'
    const normalizedOwnerEstimateRequired = normalizeNullableBooleanAsNumber(ownerEstimateRequired)
    try {
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
           self_task_difficulty_code = ?,
           owner_estimate_required = ?,
           log_completed_at = CASE
             WHEN ? = 'DONE' THEN COALESCE(?, log_completed_at, NOW())
             ELSE ?
           END
         WHERE id = ?`,
        [
          logDate,
          itemTypeId,
          description,
          normalizeDecimal(personalEstimateHours, 0),
          normalizeDecimal(actualHours, 0),
          normalizeDecimal(remainingHours, 0),
          normalizedStatus,
          normalizeTaskSource(taskSource, 'SELF'),
          demandId,
          phaseKey,
          toPositiveInt(assignedByUserId),
          expectedStartDate,
          expectedCompletionDate,
          selfTaskDifficultyCode || null,
          normalizedOwnerEstimateRequired,
          normalizedStatus,
          logCompletedAt,
          logCompletedAt,
          id,
        ],
      )
      return result.affectedRows
    } catch (err) {
      if (!isMissingColumnError(err)) throw err
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
             ELSE ?
           END
         WHERE id = ?`,
        [
          logDate,
          itemTypeId,
          description,
          normalizeDecimal(personalEstimateHours, 0),
          normalizeDecimal(actualHours, 0),
          normalizeDecimal(remainingHours, 0),
          normalizedStatus,
          normalizeTaskSource(taskSource, 'SELF'),
          demandId,
          phaseKey,
          toPositiveInt(assignedByUserId),
          expectedStartDate,
          expectedCompletionDate,
          normalizedStatus,
          logCompletedAt,
          logCompletedAt,
          id,
        ],
      )
      return result.affectedRows
    }
  },

  async seedDailyPlansForLog(
    logId,
    {
      userId,
      expectedStartDate,
      expectedCompletionDate = null,
      logStatus = 'IN_PROGRESS',
      logCompletedAt = null,
      totalPlannedHours = 0,
      source = 'SYSTEM_SPLIT',
      createdBy = null,
    } = {},
  ) {
    const normalizedLogId = toPositiveInt(logId)
    const normalizedUserId = toPositiveInt(userId)
    const startDate = normalizeDateOnly(expectedStartDate)
    if (!normalizedLogId || !normalizedUserId || !startDate) return 0

    const effectiveEndDate =
      resolveEffectivePlanEndDate(expectedCompletionDate, { logStatus, logCompletedAt }) || startDate
    const dateList = buildWorkDateRange(startDate, effectiveEndDate)
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
      logStatus = 'IN_PROGRESS',
      logCompletedAt = null,
      totalPlannedHours = 0,
      source = 'SYSTEM_SPLIT_UPDATE',
      createdBy = null,
    } = {},
  ) {
    const normalizedLogId = toPositiveInt(logId)
    const normalizedUserId = toPositiveInt(userId)
    const normalizedStart = normalizeDateOnly(expectedStartDate)
    if (!normalizedLogId || !normalizedUserId || !normalizedStart) return 0

    const normalizedEnd =
      resolveEffectivePlanEndDate(expectedCompletionDate, { logStatus, logCompletedAt }) || normalizedStart
    const dateList = buildWorkDateRange(normalizedStart, normalizedEnd)
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
    if (normalizedActualHours === null || normalizedActualHours < 0) return null

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

  async updateDailyEntryForLog(
    logId,
    entryId,
    {
      userId,
      entryDate,
      actualHours,
      description = '',
      createdBy = null,
    } = {},
  ) {
    const normalizedLogId = toPositiveInt(logId)
    const normalizedEntryId = toPositiveInt(entryId)
    const normalizedUserId = toPositiveInt(userId)
    const normalizedEntryDate = normalizeDateOnly(entryDate)
    const normalizedActualHours = normalizeDecimal(actualHours, null)
    if (!normalizedLogId || !normalizedEntryId || !normalizedUserId || !normalizedEntryDate) return null
    if (normalizedActualHours === null || normalizedActualHours < 0) return null

    const normalizedDescription = String(description || '').trim().slice(0, 2000) || null
    const normalizedCreatedBy = toPositiveInt(createdBy)

    await ensureDailyTables()

    const [entryRows] = await pool.query(
      `SELECT id, user_id, DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date
       FROM work_log_daily_entries
       WHERE id = ?
         AND log_id = ?
       LIMIT 1`,
      [normalizedEntryId, normalizedLogId],
    )
    const existingEntry = entryRows?.[0] || null
    if (!existingEntry) {
      const err = new Error('WORK_LOG_DAILY_ENTRY_NOT_FOUND')
      err.code = 'WORK_LOG_DAILY_ENTRY_NOT_FOUND'
      throw err
    }

    if (Number(existingEntry.user_id) !== normalizedUserId) {
      const err = new Error('WORK_LOG_DAILY_ENTRY_FORBIDDEN')
      err.code = 'WORK_LOG_DAILY_ENTRY_FORBIDDEN'
      throw err
    }

    const [conflictRows] = await pool.query(
      `SELECT id
       FROM work_log_daily_entries
       WHERE log_id = ?
         AND user_id = ?
         AND entry_date = ?
         AND id <> ?
       ORDER BY id DESC
       LIMIT 1`,
      [normalizedLogId, normalizedUserId, normalizedEntryDate, normalizedEntryId],
    )
    if (Array.isArray(conflictRows) && conflictRows.length > 0) {
      const err = new Error('WORK_LOG_DAILY_ENTRY_DATE_CONFLICT')
      err.code = 'WORK_LOG_DAILY_ENTRY_DATE_CONFLICT'
      throw err
    }

    await pool.query(
      `UPDATE work_log_daily_entries
       SET entry_date = ?,
           actual_hours = ?,
           description = ?,
           created_by = ?,
           created_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [normalizedEntryDate, normalizedActualHours, normalizedDescription, normalizedCreatedBy, normalizedEntryId],
    )

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

    await this.syncLogActualHoursByDailyEntries(normalizedLogId)
    return normalizedEntryId
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
    if (teamMemberIds.length === 0) return false

    let rows = []
    try {
      ;[rows] = await pool.query(
        `SELECT
           l.id,
           l.user_id,
           l.demand_id,
           l.phase_key,
           l.owner_estimate_required,
           COALESCE(t.owner_estimate_rule, 'NONE') AS owner_estimate_rule
         FROM work_logs l
         LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
         WHERE l.id = ?
           AND COALESCE(l.log_status, 'IN_PROGRESS') <> 'DONE'
         LIMIT 1`,
        [logId],
      )
    } catch (err) {
      if (!isMissingColumnError(err)) throw err
      ;[rows] = await pool.query(
        `SELECT
           l.id,
           l.user_id,
           l.demand_id,
           l.phase_key,
           NULL AS owner_estimate_required,
           COALESCE(t.owner_estimate_rule, 'NONE') AS owner_estimate_rule
         FROM work_logs l
         LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
         WHERE l.id = ?
           AND COALESCE(l.log_status, 'IN_PROGRESS') <> 'DONE'
         LIMIT 1`,
        [logId],
      )
    }
    if (rows.length === 0) return false

    return isOwnerEstimateTargetRow(rows[0], {
      isSuperAdmin: false,
      teamMemberIds,
    })
  },

  async updateLogOwnerEstimate(logId, payload = {}) {
    const { ownerEstimateHours, ownerEstimatedBy, taskDifficultyCode } = payload
    const updates = [
      'owner_estimate_hours = ?',
      'owner_estimated_by = ?',
      'owner_estimated_at = NOW()',
    ]
    const params = [normalizeDecimal(ownerEstimateHours, 0), ownerEstimatedBy || null]
    if (Object.prototype.hasOwnProperty.call(payload, 'taskDifficultyCode')) {
      updates.push('task_difficulty_code = ?')
      params.push(taskDifficultyCode || null)
    }
    params.push(logId)
    try {
      const [result] = await pool.query(
        `UPDATE work_logs
         SET ${updates.join(', ')}
         WHERE id = ?`,
        params,
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
        current_user: {
          id: null,
          department_id: null,
          department_name: '',
        },
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
        today_planned_detail_items: [],
        today_actual_detail_items: [],
        today_done_items: [],
        active_items: [],
        recent_logs: [],
      }
    }

    await ensureDailyTables()
    const currentUserDepartment = await findUserDepartmentRow(normalizedUserId)

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
         l.self_task_difficulty_code,
         COALESCE(std.item_name, l.self_task_difficulty_code, NULL) AS self_task_difficulty_name,
         COALESCE(l.actual_hours, tt.total_actual_hours, 0) AS actual_hours,
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
         COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name,
         ${todayPlannedHoursSql} AS today_planned_hours,
         ${todayActualHoursSql} AS today_actual_hours,
         COALESCE(l.actual_hours, tt.total_actual_hours, 0) AS cumulative_actual_hours
       FROM work_logs l
       LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
       LEFT JOIN users au ON au.id = l.assigned_by_user_id
       LEFT JOIN work_demands d ON d.id = l.demand_id
       LEFT JOIN config_dict_items std
         ON std.type_key = '${TASK_DIFFICULTY_DICT_KEY}'
        AND std.item_code = l.self_task_difficulty_code
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

    const todayDate = getBeijingTodayDateString()

    const activeItems = (activeItemsRaw || []).map((item) => {
      const todayPlanned = Number(item.today_planned_hours || 0)
      const todayActual = Number(item.today_actual_hours || 0)
      const cumulativeActual = Number(item.cumulative_actual_hours || item.actual_hours || 0)
      const progress = calcCrossDayProgress({
        logStatus: item.log_status,
        expectedStartDate: item.expected_start_date,
        expectedCompletionDate: item.expected_completion_date,
        todayDate,
        personalEstimateHours: item.personal_estimate_hours,
        cumulativeActualHours: cumulativeActual,
      })
      const normalizedItem = {
        ...item,
        today_planned_hours: toDecimal1(todayPlanned),
        today_actual_hours: toDecimal1(todayActual),
        cumulative_actual_hours: toDecimal1(cumulativeActual),
        today_scheduled: todayPlanned > 0,
        today_filled: todayActual > 0,
        ...progress,
      }
      return withUnifiedWorkStatus(normalizedItem, {
        todayDate,
        progressRisk: progress.progress_risk,
      })
    })

    const [todaySummaryRows] = await pool.query(
      `SELECT
         ROUND(COALESCE(SUM(${todayPlannedHoursSql}), 0), 1) AS planned_hours_today,
         ROUND(COALESCE(SUM(${todayActualHoursSql}), 0), 1) AS actual_hours_today,
         SUM(CASE WHEN ${todayPlannedHoursSql} > 0 THEN 1 ELSE 0 END) AS scheduled_item_count_today,
         SUM(CASE WHEN ${todayActualHoursSql} > 0 THEN 1 ELSE 0 END) AS filled_item_count_today
       FROM work_logs l
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
       WHERE l.user_id = ?`,
      [normalizedUserId],
    )

    const todaySummary = todaySummaryRows?.[0] || {}
    const todayPlannedHours = toDecimal1(todaySummary.planned_hours_today)
    const todayActualHours = toDecimal1(todaySummary.actual_hours_today)
    const todayRemainingHours = toDecimal1(
      activeItems.reduce((sum, item) => sum + Number(item.remaining_hours || 0), 0),
    )
    const scheduledItemCount = Number(todaySummary.scheduled_item_count_today || 0)
    const filledItemCount = Number(todaySummary.filled_item_count_today || 0)
    const assignableHours = calcAssignableHours(todayPlannedHours, todayActualHours)

    const [todayDetailRows] = await pool.query(
      `SELECT
         l.id,
         COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
         l.description,
         l.demand_id,
         d.name AS demand_name,
         l.phase_key,
         COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name,
         ${todayPlannedHoursSql} AS today_planned_hours,
         ${todayActualHoursSql} AS today_actual_hours,
         COALESCE(l.log_status, 'IN_PROGRESS') AS log_status
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
         SELECT e.log_id, ROUND(COALESCE(SUM(e.actual_hours), 0), 1) AS today_actual_hours
         FROM work_log_daily_entries e
         INNER JOIN (
           SELECT log_id, entry_date, MAX(id) AS latest_id
           FROM work_log_daily_entries
           GROUP BY log_id, entry_date
         ) le ON le.latest_id = e.id
         WHERE e.entry_date = CURDATE()
         GROUP BY e.log_id
       ) et ON et.log_id = l.id
       WHERE l.user_id = ?
         AND (${todayPlannedHoursSql} > 0 OR ${todayActualHoursSql} > 0)
       ORDER BY l.id DESC`,
      [normalizedUserId],
    )

    const mapTodayDetailItem = (row) => ({
      id: Number(row.id),
      item_type_name: row.item_type_name || '-',
      description: row.description || '',
      demand_id: row.demand_id || null,
      demand_name: row.demand_name || row.demand_id || '-',
      phase_name: row.phase_name || row.phase_key || '-',
      log_status: row.log_status || 'IN_PROGRESS',
      today_planned_hours: toDecimal1(row.today_planned_hours),
      today_actual_hours: toDecimal1(row.today_actual_hours),
    })

    const todayPlannedDetailItems = (todayDetailRows || [])
      .filter((row) => Number(row.today_planned_hours || 0) > 0)
      .map(mapTodayDetailItem)

    const todayActualDetailItems = (todayDetailRows || [])
      .filter((row) => Number(row.today_actual_hours || 0) > 0)
      .map(mapTodayDetailItem)

    const [todayDoneRows] = await pool.query(
      `SELECT
         l.id,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         l.item_type_id,
         COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
         l.description,
         l.personal_estimate_hours,
         l.self_task_difficulty_code,
         COALESCE(std.item_name, l.self_task_difficulty_code, NULL) AS self_task_difficulty_name,
         COALESCE(l.actual_hours, tt.total_actual_hours, 0) AS actual_hours,
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
         COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name,
         ${todayPlannedHoursSql} AS today_planned_hours,
         ${todayActualHoursSql} AS today_actual_hours,
         COALESCE(l.actual_hours, tt.total_actual_hours, 0) AS cumulative_actual_hours
       FROM work_logs l
       LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
       LEFT JOIN users au ON au.id = l.assigned_by_user_id
       LEFT JOIN work_demands d ON d.id = l.demand_id
       LEFT JOIN config_dict_items std
         ON std.type_key = '${TASK_DIFFICULTY_DICT_KEY}'
        AND std.item_code = l.self_task_difficulty_code
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
         AND COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'
         AND DATE(COALESCE(l.log_completed_at, l.updated_at)) = CURDATE()
       ORDER BY COALESCE(l.log_completed_at, l.updated_at) DESC, l.id DESC`,
      [normalizedUserId],
    )

    const todayDoneItems = (todayDoneRows || []).map((item) => ({
      ...item,
      today_planned_hours: toDecimal1(item.today_planned_hours),
      today_actual_hours: toDecimal1(item.today_actual_hours),
      cumulative_actual_hours: toDecimal1(item.cumulative_actual_hours || item.actual_hours || 0),
      personal_estimate_hours: toDecimal1(item.personal_estimate_hours),
    }))

    const [recentLogs] = await pool.query(
      `SELECT
         l.id,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         l.personal_estimate_hours,
         COALESCE(l.actual_hours, tt.total_actual_hours, 0) AS actual_hours,
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
      current_user: {
        id: normalizedUserId,
        department_id: Number(currentUserDepartment?.id || 0) || null,
        department_name: currentUserDepartment?.name || '',
      },
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
      today_planned_detail_items: todayPlannedDetailItems,
      today_actual_detail_items: todayActualDetailItems,
      today_done_items: todayDoneItems,
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
         COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name
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
          const fullDateList = buildWorkDateRange(expectedStartDate, expectedEndDate || expectedStartDate)
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
        yesterday_due_completed_count: 0,
        in_progress_count: 0,
        done_today_count: 0,
        todo_pending_count: 0,
      },
      focus_items: [],
      focus_yesterday_due_items: [],
      focus_in_progress_items: [],
      focus_done_today_items: [],
      focus_todo_items: [],
      today_planned_detail_items: [],
      today_actual_detail_items: [],
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
    const [[todayRow]] = await pool.query(
      `SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today_date`,
    )
    const todayDate = String(todayRow?.today_date || '')
    const previousWorkdayDate = getPreviousWorkdayDate(todayDate)

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
         COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name,
         l.personal_estimate_hours,
         COALESCE(l.actual_hours, tt.total_actual_hours, 0) AS cumulative_actual_hours,
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
         COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name,
         l.personal_estimate_hours,
         COALESCE(l.actual_hours, tt.total_actual_hours, 0) AS cumulative_actual_hours
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
         AND (
           l.expected_completion_date = ?
           OR (
             COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'
             AND DATE(COALESCE(l.log_completed_at, l.updated_at)) = ?
           )
         )
       ORDER BY l.updated_at DESC, l.id DESC
       LIMIT 2000`,
      [userIds, previousWorkdayDate, previousWorkdayDate],
    )

    const [doneTodayRows] = await pool.query(
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
         COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name,
         l.personal_estimate_hours,
         COALESCE(l.actual_hours, tt.total_actual_hours, 0) AS cumulative_actual_hours,
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
         AND COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'
         AND DATE(COALESCE(l.log_completed_at, l.updated_at)) = CURDATE()
       ORDER BY l.updated_at DESC, l.id DESC
       LIMIT 2000`,
      [userIds],
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
         SELECT e.log_id, ROUND(COALESCE(SUM(e.actual_hours), 0), 1) AS today_actual_hours
         FROM work_log_daily_entries e
         INNER JOIN (
           SELECT log_id, entry_date, MAX(id) AS latest_id
           FROM work_log_daily_entries
           GROUP BY log_id, entry_date
         ) le ON le.latest_id = e.id
         WHERE e.entry_date = CURDATE()
         GROUP BY e.log_id
       ) et ON et.log_id = l.id
       WHERE l.user_id IN (?)
       GROUP BY l.user_id`,
      [userIds],
    )

    const [todayDetailRows] = await pool.query(
      `SELECT
         l.id,
         l.user_id,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
         COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
         l.description,
         l.demand_id,
         d.name AS demand_name,
         l.phase_key,
         COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name,
         ${todayPlannedHoursSql} AS today_planned_hours,
         ${todayActualHoursSql} AS today_actual_hours,
         COALESCE(l.log_status, 'IN_PROGRESS') AS log_status
       FROM work_logs l
       INNER JOIN users u ON u.id = l.user_id
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
         SELECT e.log_id, ROUND(COALESCE(SUM(e.actual_hours), 0), 1) AS today_actual_hours
         FROM work_log_daily_entries e
         INNER JOIN (
           SELECT log_id, entry_date, MAX(id) AS latest_id
           FROM work_log_daily_entries
           GROUP BY log_id, entry_date
         ) le ON le.latest_id = e.id
         WHERE e.entry_date = CURDATE()
         GROUP BY e.log_id
       ) et ON et.log_id = l.id
       WHERE l.user_id IN (?)
         AND (${todayPlannedHoursSql} > 0 OR ${todayActualHoursSql} > 0)
       ORDER BY u.id ASC, l.id DESC`,
      [userIds],
    )

    const dailyAggByUser = new Map()
    ;(dailyAggRows || []).forEach((row) => {
      const userId = Number(row.user_id)
      if (!Number.isInteger(userId) || userId <= 0) return
      dailyAggByUser.set(userId, {
        today_planned_hours: toDecimal1(row.today_planned_hours),
        today_actual_hours: toDecimal1(row.today_actual_hours),
      })
    })

    const mapTodayDetailItem = (row) => ({
      id: Number(row.id),
      user_id: Number(row.user_id),
      username: row.username || `用户${Number(row.user_id)}`,
      item_type_name: row.item_type_name || '-',
      description: row.description || '',
      demand_id: row.demand_id || null,
      demand_name: row.demand_name || row.demand_id || '-',
      phase_name: row.phase_name || row.phase_key || '-',
      log_status: row.log_status || 'IN_PROGRESS',
      today_planned_hours: toDecimal1(row.today_planned_hours),
      today_actual_hours: toDecimal1(row.today_actual_hours),
    })

    const todayPlannedDetailItems = (todayDetailRows || [])
      .filter((row) => Number(row.today_planned_hours || 0) > 0)
      .map(mapTodayDetailItem)

    const todayActualDetailItems = (todayDetailRows || [])
      .filter((row) => Number(row.today_actual_hours || 0) > 0)
      .map(mapTodayDetailItem)

    const isInProgressAlignmentItem = (item) => {
      const status = String(item?.log_status || '').trim().toUpperCase()
      const expectedStartDate = String(item?.expected_start_date || item?.log_date || '').trim()
      const expectedDate = String(item?.expected_completion_date || '').trim()
      if (expectedDate && expectedDate === previousWorkdayDate) return false
      const startedTodayOrBefore = Boolean(expectedStartDate) && expectedStartDate <= todayDate
      return (status === 'IN_PROGRESS' || status === 'TODO') && startedTodayOrBefore
    }
    const activeItemsByUser = new Map()
    ;(activeItemRows || []).filter((row) => isInProgressAlignmentItem(row)).forEach((row) => {
      const userId = Number(row.user_id)
      if (!activeItemsByUser.has(userId)) {
        activeItemsByUser.set(userId, [])
      }
      const cumulativeActual = toDecimal1(row.cumulative_actual_hours)
      const progress = calcCrossDayProgress({
        logStatus: row.log_status,
        expectedStartDate: row.expected_start_date,
        expectedCompletionDate: row.expected_completion_date,
        todayDate,
        personalEstimateHours: row.personal_estimate_hours,
        cumulativeActualHours: cumulativeActual,
      })
      const normalizedRow = {
        ...row,
        today_planned_hours: toDecimal1(row.today_planned_hours),
        today_actual_hours: toDecimal1(row.today_actual_hours),
        cumulative_actual_hours: cumulativeActual,
        ...progress,
      }
      activeItemsByUser.get(userId).push(
        withUnifiedWorkStatus(normalizedRow, {
          todayDate,
          progressRisk: progress.progress_risk,
        }),
      )
    })

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
      const dailyAgg = dailyAggByUser.get(userId) || {}
      const todayPlannedHours = toDecimal1(dailyAgg.today_planned_hours)
      const todayActualHours = toDecimal1(dailyAgg.today_actual_hours)
      const todayScheduled = Number(todayPlannedHours || 0) > 0
      const todayFilled = todayScheduled && Number(todayActualHours || 0) > 0
      const assignableHours = calcAssignableHours(todayPlannedHours, todayActualHours)

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

      const mappedItem = {
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
      return withUnifiedWorkStatus(mappedItem, {
        todayDate,
        progressRisk: progress.progress_risk,
      })
    }

    const yesterdayCheckRank = {
      NOT_DONE: 0,
      LATE_DONE: 1,
      ON_TIME: 2,
      PREV_WORKDAY_DONE: 3,
    }
    const yesterdayDueItems = (yesterdayDueRows || [])
      .map((item) => {
        const mapped = buildFocusItem(item)
        const completedDate = mapped.log_completed_at ? String(mapped.log_completed_at).slice(0, 10) : ''
        const expectedDate = String(mapped.expected_completion_date || '').trim()
        let checkResult = 'NOT_DONE'
        if (expectedDate === previousWorkdayDate) {
          if (mapped.log_status === 'DONE') {
            checkResult = completedDate && completedDate <= previousWorkdayDate ? 'ON_TIME' : 'LATE_DONE'
          }
        } else if (mapped.log_status === 'DONE' && completedDate === previousWorkdayDate) {
          checkResult = 'PREV_WORKDAY_DONE'
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

    const inProgressCandidateRows = [...(activeItemRows || [])]
    const inProgressItems = inProgressCandidateRows
      .filter((item) => isInProgressAlignmentItem(item))
      .map((item) => buildFocusItem(item))
      .sort((a, b) => {
        const getPriorityBucket = (row) => {
          if (row?.progress_risk) return 0
          if (row?.focus_level === 'OVERDUE') return 1
          if (row?.focus_level === 'DUE_TODAY') return 2
          return 3
        }

        const bucketA = getPriorityBucket(a)
        const bucketB = getPriorityBucket(b)
        if (bucketA !== bucketB) return bucketA - bucketB

        const phaseA = String(a.phase_name || a.phase_key || '').trim() || '~'
        const phaseB = String(b.phase_name || b.phase_key || '').trim() || '~'
        const phaseDiff = phaseA.localeCompare(phaseB, 'zh-Hans-CN')
        if (phaseDiff !== 0) return phaseDiff

        const progressA = Number.isFinite(Number(a.progress_percent)) ? Number(a.progress_percent) : -1
        const progressB = Number.isFinite(Number(b.progress_percent)) ? Number(b.progress_percent) : -1
        if (progressA !== progressB) return progressB - progressA

        const dateA = a.expected_completion_date || '9999-12-31'
        const dateB = b.expected_completion_date || '9999-12-31'
        if (dateA !== dateB) return dateA.localeCompare(dateB)
        return Number(b.id || 0) - Number(a.id || 0)
      })
      .slice(0, 200)

    const doneTodayItems = (doneTodayRows || [])
      .map((item) => buildFocusItem(item))
      .sort((a, b) => {
        const phaseA = String(a.phase_name || a.phase_key || '').trim() || '~'
        const phaseB = String(b.phase_name || b.phase_key || '').trim() || '~'
        const phaseDiff = phaseA.localeCompare(phaseB, 'zh-Hans-CN')
        if (phaseDiff !== 0) return phaseDiff

        const progressA = Number.isFinite(Number(a.progress_percent)) ? Number(a.progress_percent) : -1
        const progressB = Number.isFinite(Number(b.progress_percent)) ? Number(b.progress_percent) : -1
        if (progressA !== progressB) return progressB - progressA

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
        if (status !== 'TODO') return false
        if (expectedStartDate && expectedStartDate <= todayDate) return false
        return true
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
    const yesterdayDueCompletedCount = yesterdayDueItems.filter((item) => item.check_result === 'PREV_WORKDAY_DONE').length

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
        yesterday_due_completed_count: yesterdayDueCompletedCount,
        in_progress_count: inProgressItems.length,
        done_today_count: doneTodayItems.length,
        todo_pending_count: todoPendingItems.length,
      },
      focus_items: focusItems,
      focus_yesterday_due_items: yesterdayDueItems,
      focus_in_progress_items: inProgressItems,
      focus_done_today_items: doneTodayItems,
      focus_todo_items: todoPendingItems,
      today_planned_detail_items: todayPlannedDetailItems,
      today_actual_detail_items: todayActualDetailItems,
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

    if (!isSuperAdmin && teamMemberIds.length === 0) {
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
           SELECT e.log_id, ROUND(COALESCE(SUM(e.actual_hours), 0), 1) AS today_actual_hours
           FROM work_log_daily_entries e
           INNER JOIN (
             SELECT log_id, entry_date, MAX(id) AS latest_id
             FROM work_log_daily_entries
             GROUP BY log_id, entry_date
           ) le ON le.latest_id = e.id
           WHERE e.entry_date = CURDATE()
           GROUP BY e.log_id
         ) et ON et.log_id = l.id
         WHERE l.user_id IN (?)
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
        const assignableHours = calcAssignableHours(todayPlannedHours, todayActualHours)

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
       l.task_difficulty_code,
       COALESCE(td.item_name, l.task_difficulty_code, NULL) AS task_difficulty_name,
       l.owner_estimated_by,
       DATE_FORMAT(l.owner_estimated_at, '%Y-%m-%d %H:%i:%s') AS owner_estimated_at,
       COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
       COALESCE(l.task_source, 'SELF') AS task_source,
       l.demand_id,
       d.name AS demand_name,
       l.phase_key,
       l.assigned_by_user_id,
       COALESCE(NULLIF(au.real_name, ''), au.username) AS assigned_by_name,
       COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name,
       DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
       DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
       DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
       l.owner_estimate_required,
       COALESCE(t.owner_estimate_rule, 'NONE') AS owner_estimate_rule
     FROM work_logs l
     INNER JOIN users u ON u.id = l.user_id
     LEFT JOIN users au ON au.id = l.assigned_by_user_id
     LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
     LEFT JOIN work_demands d ON d.id = l.demand_id
     LEFT JOIN config_dict_items td
       ON td.type_key = '${TASK_DIFFICULTY_DICT_KEY}'
      AND td.item_code = l.task_difficulty_code
     LEFT JOIN config_dict_items pdi
       ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
      AND pdi.item_code = l.phase_key
     WHERE ${ownerEstimateQueryConditions.join(' AND ')}
     ORDER BY
       CASE WHEN l.owner_estimate_hours IS NULL THEN 0 ELSE 1 END ASC,
       l.updated_at DESC,
       l.id DESC
     LIMIT 400`

    const ownerEstimateOwnerOnlySql = `SELECT
       l.id,
       l.user_id,
       COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
       DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
       COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
       l.description,
       l.personal_estimate_hours,
       l.actual_hours,
       l.owner_estimate_hours,
       l.task_difficulty_code,
       COALESCE(td.item_name, l.task_difficulty_code, NULL) AS task_difficulty_name,
       l.owner_estimated_by,
       DATE_FORMAT(l.owner_estimated_at, '%Y-%m-%d %H:%i:%s') AS owner_estimated_at,
       COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
       COALESCE(l.task_source, 'SELF') AS task_source,
       l.demand_id,
       d.name AS demand_name,
       l.phase_key,
       l.assigned_by_user_id,
       COALESCE(NULLIF(au.real_name, ''), au.username) AS assigned_by_name,
       COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name,
       DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
       DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
       DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
       NULL AS owner_estimate_required,
       COALESCE(t.owner_estimate_rule, 'NONE') AS owner_estimate_rule
     FROM work_logs l
     INNER JOIN users u ON u.id = l.user_id
     LEFT JOIN users au ON au.id = l.assigned_by_user_id
     LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
     LEFT JOIN work_demands d ON d.id = l.demand_id
     LEFT JOIN config_dict_items td
       ON td.type_key = '${TASK_DIFFICULTY_DICT_KEY}'
      AND td.item_code = l.task_difficulty_code
     LEFT JOIN config_dict_items pdi
       ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
      AND pdi.item_code = l.phase_key
     WHERE ${ownerEstimateQueryConditions.join(' AND ')}
     ORDER BY l.updated_at DESC, l.id DESC
     LIMIT 400`

    const ownerEstimateLegacySql = `SELECT
       l.id,
       l.user_id,
       COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
       DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
       COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
       l.description,
       l.personal_estimate_hours,
       l.actual_hours,
       NULL AS owner_estimate_hours,
       NULL AS task_difficulty_code,
       NULL AS task_difficulty_name,
       NULL AS owner_estimated_by,
       NULL AS owner_estimated_at,
       COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
       COALESCE(l.task_source, 'SELF') AS task_source,
       l.demand_id,
       d.name AS demand_name,
       l.phase_key,
       l.assigned_by_user_id,
       COALESCE(NULLIF(au.real_name, ''), au.username) AS assigned_by_name,
       COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name,
       DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
       DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
       DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
       NULL AS owner_estimate_required,
       COALESCE(t.owner_estimate_rule, 'NONE') AS owner_estimate_rule
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
      const [queryRows] = await pool.query(ownerEstimateSql, ownerEstimateQueryParams)
      ownerEstimateItems = queryRows
    } catch (err) {
      if (!isMissingColumnError(err)) throw err
      try {
        const [queryRows] = await pool.query(ownerEstimateOwnerOnlySql, ownerEstimateQueryParams)
        ownerEstimateItems = queryRows
      } catch (innerErr) {
        if (!isMissingColumnError(innerErr)) throw innerErr
        const [queryRows] = await pool.query(ownerEstimateLegacySql, ownerEstimateQueryParams)
        ownerEstimateItems = queryRows
      }
    }

    const todayDate = getBeijingTodayDateString()
    ownerEstimateItems = ownerEstimateItems
      .filter((row) =>
        isOwnerEstimateTargetRow(row, {
          isSuperAdmin,
          teamMemberIds,
        }),
      )
      .map((row) => withUnifiedWorkStatus(row, { todayDate }))
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

  async getInsightFilterOptions({ departmentIds = [] } = {}) {
    const scopedDepartmentIds = Array.from(
      new Set(
        (Array.isArray(departmentIds) ? departmentIds : [])
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item) && item > 0),
      ),
    )
    const hasDepartmentScope = scopedDepartmentIds.length > 0

    const departmentSql = `
      SELECT
        d.id,
        d.name
      FROM departments d
      WHERE COALESCE(d.enabled, 1) = 1
        ${hasDepartmentScope ? 'AND d.id IN (?)' : ''}
      ORDER BY d.sort_order ASC, d.id ASC`
    const [departmentRows] = await pool.query(
      departmentSql,
      hasDepartmentScope ? [scopedDepartmentIds] : [],
    )

    const ownerSql = `
      SELECT
        u.id,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
        u.department_id,
        COALESCE(d.name, CONCAT('部门#', u.department_id)) AS department_name
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
        AND COALESCE(u.include_in_metrics, 1) = 1
        ${hasDepartmentScope ? 'AND u.department_id IN (?)' : ''}
      ORDER BY u.id ASC`
    const [ownerRows] = await pool.query(ownerSql, hasDepartmentScope ? [scopedDepartmentIds] : [])

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

  async getDepartmentEfficiencyRanking({
    departmentId,
    startDate,
    endDate,
    sortOrder = 'desc',
    keyword = '',
    completedOnly = false,
  } = {}) {
    await ensureEfficiencyFactorSettingsTable()
    const normalizedDepartmentId = toPositiveInt(departmentId)
    if (!normalizedDepartmentId) {
      return {
        filters: {
          department_id: null,
          start_date: startDate,
          end_date: endDate,
          keyword: keyword || '',
          sort_order: 'desc',
          previous_start_date: '',
          previous_end_date: '',
        },
        summary: {
          department_id: null,
          department_name: '-',
          member_count: 0,
          avg_actual_hours: 0,
          total_owner_estimate_hours: 0,
          total_personal_estimate_hours: 0,
          total_actual_hours: 0,
          net_efficiency_value: null,
        },
        rows: [],
      }
    }

    const normalizedSortOrder = String(sortOrder || '').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC'
    const normalizedKeyword = String(keyword || '').trim().toLowerCase()
    const normalizedCompletedOnly = Boolean(completedOnly)
    const previousRange = buildPreviousPeriodRange(startDate, endDate)

    const storedRowsPromise = this.listEfficiencyFactorSettings()
    const [departmentRows, currentRows, previousRows, storedRows] = await Promise.all([
      pool.query(
        `SELECT id, name
         FROM departments
         WHERE id = ?
         LIMIT 1`,
        [normalizedDepartmentId],
      ).then((result) => result[0] || []),
      pool.query(
        `SELECT
           u.id AS user_id,
           COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
           u.department_id,
           COALESCE(dep.name, CONCAT('部门#', u.department_id)) AS department_name,
           COALESCE(u.job_level, '') AS job_level,
           jl.item_name AS job_level_name,
           COUNT(DISTINCT l.log_date) AS filled_days,
           ROUND(COALESCE(SUM(${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL}), 0), 1) AS total_owner_estimate_hours,
           ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS total_personal_estimate_hours,
           ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS total_actual_hours,
           COALESCE(
             ROUND(
               COALESCE(SUM(COALESCE(l.actual_hours, 0) * COALESCE(tdw.coefficient, 1)), 0)
               / NULLIF(SUM(COALESCE(l.actual_hours, 0)), 0),
               4
             ),
             1
           ) AS task_difficulty_coefficient,
           MAX(COALESCE(jw.coefficient, 1)) AS job_level_weight_coefficient,
           DATE_FORMAT(MAX(l.log_date), '%Y-%m-%d') AS last_log_date
         FROM users u
         LEFT JOIN departments dep ON dep.id = u.department_id
         LEFT JOIN config_dict_items jl
           ON jl.type_key = '${JOB_LEVEL_DICT_KEY}'
          AND jl.item_code = u.job_level
         LEFT JOIN efficiency_factor_settings jw
           ON jw.factor_type = '${EFFICIENCY_FACTOR_TYPES.JOB_LEVEL_WEIGHT}'
          AND CONVERT(jw.item_code USING utf8mb4) COLLATE utf8mb4_unicode_ci =
              CONVERT(COALESCE(NULLIF(u.job_level, ''), '__NO_JOB_LEVEL__') USING utf8mb4) COLLATE utf8mb4_unicode_ci
          AND jw.enabled = 1
         LEFT JOIN work_logs l
           ON l.user_id = u.id
          AND l.log_date >= ?
          AND l.log_date <= ?
          ${normalizedCompletedOnly ? "AND COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'" : ''}
         LEFT JOIN efficiency_factor_settings tdw
           ON tdw.factor_type = '${EFFICIENCY_FACTOR_TYPES.TASK_DIFFICULTY_WEIGHT}'
          AND CONVERT(tdw.item_code USING utf8mb4) COLLATE utf8mb4_unicode_ci =
              CONVERT(COALESCE(NULLIF(l.task_difficulty_code, ''), '${DEFAULT_TASK_DIFFICULTY_CODE}') USING utf8mb4) COLLATE utf8mb4_unicode_ci
          AND tdw.enabled = 1
         LEFT JOIN work_demands d ON d.id = l.demand_id
         LEFT JOIN config_dict_items pdi
           ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
          AND pdi.item_code = l.phase_key
         LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
         WHERE u.department_id = ?
           AND COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
           AND COALESCE(u.include_in_metrics, 1) = 1
         GROUP BY
           u.id,
           COALESCE(NULLIF(u.real_name, ''), u.username),
           u.department_id,
           COALESCE(dep.name, CONCAT('部门#', u.department_id)),
           COALESCE(u.job_level, ''),
           jl.item_name
         ORDER BY total_actual_hours ${normalizedSortOrder}, u.id ASC`,
        [startDate, endDate, normalizedDepartmentId],
      ).then((result) => result[0] || []),
      previousRange.startDate && previousRange.endDate
        ? pool.query(
            `SELECT
               l.user_id,
               ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS previous_actual_hours
             FROM work_logs l
             INNER JOIN users u ON u.id = l.user_id
             WHERE u.department_id = ?
               AND COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
               AND COALESCE(u.include_in_metrics, 1) = 1
               AND l.log_date >= ?
               AND l.log_date <= ?
               ${normalizedCompletedOnly ? "AND COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'" : ''}
             GROUP BY l.user_id`,
            [normalizedDepartmentId, previousRange.startDate, previousRange.endDate],
          ).then((result) => result[0] || [])
        : Promise.resolve([]),
      storedRowsPromise,
    ])

    const departmentName =
      departmentRows?.[0]?.name || `部门#${normalizedDepartmentId}`
    const netEfficiencyFormula = buildNetEfficiencyFormulaConfig(storedRows)
    const previousActualByUserId = new Map(
      (previousRows || []).map((row) => [Number(row.user_id), Number(row.previous_actual_hours || 0)]),
    )

    let rows = (currentRows || []).map((row) => {
      const userId = Number(row.user_id)
      const totalActualHours = Number(row.total_actual_hours || 0)
      const previousActualHours = Number(previousActualByUserId.get(userId) || 0)
      const trendDeltaActualHours = toDecimal1(totalActualHours - previousActualHours)
      let trendDirection = 'FLAT'
      if (trendDeltaActualHours > 0) trendDirection = 'UP'
      if (trendDeltaActualHours < 0) trendDirection = 'DOWN'

      return {
        rank: 0,
        user_id: userId,
        username: row.username || `用户${userId}`,
        department_id: toPositiveInt(row.department_id),
        department_name: row.department_name || departmentName,
        job_level: row.job_level || null,
        job_level_name: row.job_level_name || row.job_level || '-',
        filled_days: Number(row.filled_days || 0),
        total_owner_estimate_hours: toDecimal1(row.total_owner_estimate_hours),
        total_personal_estimate_hours: toDecimal1(row.total_personal_estimate_hours),
        total_actual_hours: toDecimal1(totalActualHours),
        task_difficulty_coefficient: toDecimal4(row.task_difficulty_coefficient || 1),
        job_level_weight_coefficient: toDecimal4(row.job_level_weight_coefficient || 1),
        net_efficiency_value: evaluateNetEfficiencyByFormula(
          netEfficiencyFormula.expression,
          buildNetEfficiencyContext({
            totalOwnerEstimateHours: row.total_owner_estimate_hours,
            totalPersonalEstimateHours: row.total_personal_estimate_hours,
            totalActualHours,
            taskDifficultyCoefficient: row.task_difficulty_coefficient || 1,
            jobLevelWeightCoefficient: row.job_level_weight_coefficient || 1,
          }),
        ),
        previous_actual_hours: toDecimal1(previousActualHours),
        trend_direction: trendDirection,
        trend_delta_actual_hours: trendDeltaActualHours,
        last_log_date: row.last_log_date || null,
      }
    })

    if (normalizedKeyword) {
      rows = rows.filter((row) => {
        const usernameHit = String(row.username || '').toLowerCase().includes(normalizedKeyword)
        const levelHit = String(row.job_level_name || row.job_level || '').toLowerCase().includes(normalizedKeyword)
        return usernameHit || levelHit
      })
    }

    if (normalizedCompletedOnly) {
      rows = rows.filter(
        (row) =>
          Number(row.filled_days || 0) > 0 ||
          Number(row.total_owner_estimate_hours || 0) > 0 ||
          Number(row.total_personal_estimate_hours || 0) > 0 ||
          Number(row.total_actual_hours || 0) > 0,
      )
    }

    rows = [...rows].sort((left, right) => {
      const leftValue = Number(left?.net_efficiency_value)
      const rightValue = Number(right?.net_efficiency_value)
      const normalizedLeft = Number.isFinite(leftValue) ? leftValue : (normalizedSortOrder === 'ASC' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
      const normalizedRight = Number.isFinite(rightValue) ? rightValue : (normalizedSortOrder === 'ASC' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
      if (normalizedLeft !== normalizedRight) {
        return normalizedSortOrder === 'ASC' ? normalizedLeft - normalizedRight : normalizedRight - normalizedLeft
      }

      const leftActualHours = Number(left?.total_actual_hours || 0)
      const rightActualHours = Number(right?.total_actual_hours || 0)
      if (leftActualHours !== rightActualHours) {
        return normalizedSortOrder === 'ASC' ? leftActualHours - rightActualHours : rightActualHours - leftActualHours
      }

      return Number(left?.user_id || 0) - Number(right?.user_id || 0)
    })

    rows = rows.map((row, index) => ({
      ...row,
      rank: index + 1,
    }))

    const totalOwnerEstimateHours = toDecimal1(
      rows.reduce((sum, row) => sum + Number(row.total_owner_estimate_hours || 0), 0),
    )
    const totalPersonalEstimateHours = toDecimal1(
      rows.reduce((sum, row) => sum + Number(row.total_personal_estimate_hours || 0), 0),
    )
    const totalActualHours = toDecimal1(
      rows.reduce((sum, row) => sum + Number(row.total_actual_hours || 0), 0),
    )
    const avgTaskDifficultyCoefficient = calcActualWeightedCoefficient(rows, 'task_difficulty_coefficient')
    const avgJobLevelWeightCoefficient = calcActualWeightedCoefficient(rows, 'job_level_weight_coefficient')

    return {
      filters: {
        department_id: normalizedDepartmentId,
        start_date: startDate,
        end_date: endDate,
        keyword: keyword || '',
        sort_order: normalizedSortOrder.toLowerCase(),
        completed_only: normalizedCompletedOnly,
        previous_start_date: previousRange.startDate,
        previous_end_date: previousRange.endDate,
      },
      summary: {
        department_id: normalizedDepartmentId,
        department_name: departmentName,
        member_count: rows.length,
        avg_actual_hours: rows.length > 0 ? toDecimal1(totalActualHours / rows.length) : 0,
        total_owner_estimate_hours: totalOwnerEstimateHours,
        total_personal_estimate_hours: totalPersonalEstimateHours,
        total_actual_hours: totalActualHours,
        task_difficulty_coefficient: avgTaskDifficultyCoefficient,
        job_level_weight_coefficient: avgJobLevelWeightCoefficient,
        net_efficiency_formula_text: netEfficiencyFormula.expression_text || formatNetEfficiencyFormulaTokens(netEfficiencyFormula.expression),
        net_efficiency_value: evaluateNetEfficiencyByFormula(
          netEfficiencyFormula.expression,
          buildNetEfficiencyContext({
            totalOwnerEstimateHours,
            totalPersonalEstimateHours,
            totalActualHours,
            taskDifficultyCoefficient: avgTaskDifficultyCoefficient,
            jobLevelWeightCoefficient: avgJobLevelWeightCoefficient,
          }),
        ),
      },
      rows,
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
    completedOnly = false,
  } = {}) {
    const { whereSql, params } = buildDemandInsightWhere({
      startDate,
      endDate,
      departmentId,
      businessGroupCode,
      ownerUserId,
      memberUserId,
      keyword,
      completedOnly,
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
        completed_only: Boolean(completedOnly),
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
    completedOnly = false,
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
          completed_only: Boolean(completedOnly),
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

    await ensureDailyTables()

    const logConditions = ['l.user_id IN (?)']
    const logParams = [scopedUserIds]
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
    logConditions.push(
      `(
        l.log_date BETWEEN ? AND ?
        OR EXISTS (
          SELECT 1
          FROM work_log_daily_entries e
          WHERE e.log_id = l.id
            AND e.user_id = l.user_id
            AND e.entry_date BETWEEN ? AND ?
        )
      )`,
    )
    logParams.push(startDate, endDate, startDate, endDate)
    if (completedOnly) {
      logConditions.push("COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'")
    }

    const logWhereSql = logConditions.join(' AND ')

    const logSql = `
      SELECT
        l.id,
        l.user_id,
        DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
        l.demand_id,
        COALESCE(d.name, '无需求') AS demand_name,
        l.description,
        l.phase_key,
        COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name,
        COALESCE(t.name, '其他') AS item_type_name,
        ROUND(COALESCE(${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL}, 0), 1) AS owner_estimate_hours,
        ROUND(COALESCE(l.personal_estimate_hours, 0), 1) AS personal_estimate_hours,
        ROUND(COALESCE(l.actual_hours, 0), 1) AS actual_hours,
        COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
        DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
        CASE WHEN (${OWNER_ESTIMATE_REQUIRED_BY_LOG_SQL}) = 1 AND l.owner_estimate_hours IS NULL THEN 1 ELSE 0 END AS owner_pending
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN config_dict_items pdi
        ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
       AND pdi.item_code = l.phase_key
      LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
      WHERE ${logWhereSql}
      ORDER BY l.user_id ASC, l.updated_at DESC, l.id DESC
      LIMIT 50000`

    const entrySql = `
      SELECT
        l.user_id,
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
      INNER JOIN work_logs l ON l.id = e.log_id
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      WHERE l.user_id IN (?)
        AND e.entry_date BETWEEN ? AND ?
        ${completedOnly ? "AND COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'" : ''}
        ${businessGroupCode ? 'AND d.business_group_code = ?' : ''}
        ${ownerUserId ? 'AND d.owner_user_id = ?' : ''}
        ${keyword ? "AND (COALESCE(NULLIF(u.real_name, ''), u.username) LIKE ? OR COALESCE(d.name, '') LIKE ? OR COALESCE(l.demand_id, '') LIKE ? OR COALESCE(l.description, '') LIKE ?)" : ''}
      GROUP BY l.user_id, e.log_id, e.entry_date
      ORDER BY l.user_id ASC, e.entry_date ASC, e.log_id ASC
      LIMIT 50000`

    const entryParams = [scopedUserIds, startDate, endDate]
    if (businessGroupCode) entryParams.push(businessGroupCode)
    if (ownerUserId) entryParams.push(ownerUserId)
    if (keyword) entryParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)

    const [logRows, entryRows] = await Promise.all([
      pool.query(logSql, logParams).then((r) => r[0] || []),
      pool.query(entrySql, entryParams).then((r) => r[0] || []),
    ])

    const memberAggByUser = new Map()
    const dailyItemsByUserDate = new Map()
    const explicitEntryByLogDate = new Map()
    const explicitEntryCountByLog = new Map()

    function ensureMemberAgg(userId) {
      if (!memberAggByUser.has(userId)) {
        memberAggByUser.set(userId, {
          filled_days_set: new Set(),
          demand_ids: new Set(),
          item_scope_keys: new Set(),
          total_owner_estimate_hours: 0,
          total_personal_estimate_hours: 0,
          total_actual_hours: 0,
          unestimated_item_count: 0,
          last_log_date: '',
        })
      }
      return memberAggByUser.get(userId)
    }

    function ensureDailyItem(userId, date, row) {
      const key = `${userId}_${date}`
      if (!dailyItemsByUserDate.has(key)) {
        dailyItemsByUserDate.set(key, [])
      }
      const list = dailyItemsByUserDate.get(key)
      const logId = Number(row.log_id || row.id || 0)
      let target = list.find((item) => Number(item.log_id) === logId)
      if (!target) {
        target = {
          log_id: logId,
          demand_id: row.demand_id || null,
          demand_name: row.demand_name || '无需求',
          description: row.description || '',
          phase_key: row.phase_key || '',
          phase_name: row.phase_name || '',
          item_type_name: row.item_type_name || '其他',
          owner_estimate_hours: 0,
          personal_estimate_hours: 0,
          actual_hours: 0,
        }
        list.push(target)
      }
      return target
    }

    ;(entryRows || []).forEach((row) => {
      const userId = Number(row.user_id)
      const logId = Number(row.log_id)
      const entryDate = normalizeDateOnly(row.entry_date)
      if (!userId || !logId || !entryDate) return
      explicitEntryByLogDate.set(`${logId}|${entryDate}`, {
        actual_hours: toDecimal1(row.actual_hours),
        entry_count: Number(row.entry_count || 0),
      })
      explicitEntryCountByLog.set(logId, Number(explicitEntryCountByLog.get(logId) || 0) + Number(row.entry_count || 0))
    })

    ;(logRows || []).forEach((row) => {
      const userId = Number(row.user_id)
      const logId = Number(row.id)
      const logDate = normalizeDateOnly(row.log_date)
      if (!userId || !logId) return
      const memberAgg = ensureMemberAgg(userId)

      if (logDate && logDate >= startDate && logDate <= endDate) {
        memberAgg.total_owner_estimate_hours = toDecimal1(
          Number(memberAgg.total_owner_estimate_hours || 0) + Number(row.owner_estimate_hours || 0),
        )
        memberAgg.total_personal_estimate_hours = toDecimal1(
          Number(memberAgg.total_personal_estimate_hours || 0) + Number(row.personal_estimate_hours || 0),
        )
        memberAgg.filled_days_set.add(logDate)
        memberAgg.last_log_date = memberAgg.last_log_date && memberAgg.last_log_date > logDate ? memberAgg.last_log_date : logDate

        const estimateItem = ensureDailyItem(userId, logDate, row)
        estimateItem.owner_estimate_hours = toDecimal1(
          Number(estimateItem.owner_estimate_hours || 0) + Number(row.owner_estimate_hours || 0),
        )
        estimateItem.personal_estimate_hours = toDecimal1(
          Number(estimateItem.personal_estimate_hours || 0) + Number(row.personal_estimate_hours || 0),
        )
      }

      if (row.demand_id) memberAgg.demand_ids.add(String(row.demand_id))
      memberAgg.item_scope_keys.add(row.demand_id ? `DEMAND:${row.demand_id}` : `NO_DEMAND#${logId}`)
      memberAgg.unestimated_item_count += Number(row.owner_pending || 0)
    })

    ;(entryRows || []).forEach((row) => {
      const userId = Number(row.user_id)
      const logId = Number(row.log_id)
      const entryDate = normalizeDateOnly(row.entry_date)
      if (!userId || !logId || !entryDate) return

      const sourceLog = (logRows || []).find((item) => Number(item.id) === logId)
      if (!sourceLog) return

      const memberAgg = ensureMemberAgg(userId)
      const actualHours = Number(row.actual_hours || 0)
      memberAgg.total_actual_hours = toDecimal1(Number(memberAgg.total_actual_hours || 0) + actualHours)
      memberAgg.filled_days_set.add(entryDate)
      memberAgg.last_log_date =
        memberAgg.last_log_date && memberAgg.last_log_date > entryDate ? memberAgg.last_log_date : entryDate

      const actualItem = ensureDailyItem(userId, entryDate, sourceLog)
      actualItem.actual_hours = toDecimal1(Number(actualItem.actual_hours || 0) + actualHours)
    })

    ;(logRows || []).forEach((row) => {
      const userId = Number(row.user_id)
      const logId = Number(row.id)
      const logDate = normalizeDateOnly(row.log_date)
      const hasExplicitEntry = Number(explicitEntryCountByLog.get(logId) || 0) > 0
      const fallbackActualHours = Number(row.actual_hours || 0)
      if (!userId || !logId || hasExplicitEntry || !logDate || logDate < startDate || logDate > endDate || fallbackActualHours <= 0) return

      const memberAgg = ensureMemberAgg(userId)
      memberAgg.total_actual_hours = toDecimal1(Number(memberAgg.total_actual_hours || 0) + fallbackActualHours)
      memberAgg.filled_days_set.add(logDate)
      memberAgg.last_log_date =
        memberAgg.last_log_date && memberAgg.last_log_date > logDate ? memberAgg.last_log_date : logDate

      const actualItem = ensureDailyItem(userId, logDate, row)
      actualItem.actual_hours = toDecimal1(Number(actualItem.actual_hours || 0) + fallbackActualHours)
    })

    const dailyByUser = new Map()
    dailyItemsByUserDate.forEach((items, key) => {
      const [userIdText, logDate] = String(key).split('_')
      const userId = Number(userIdText)
      if (!userId || !logDate) return
      if (!dailyByUser.has(userId)) {
        dailyByUser.set(userId, [])
      }
      const normalizedItems = (items || []).map((item) => ({
        ...item,
        owner_estimate_hours: toDecimal1(item.owner_estimate_hours),
        personal_estimate_hours: toDecimal1(item.personal_estimate_hours),
        actual_hours: toDecimal1(item.actual_hours),
      }))
      const ownerEstimateHours = toDecimal1(
        normalizedItems.reduce((sum, item) => sum + Number(item.owner_estimate_hours || 0), 0),
      )
      const personalEstimateHours = toDecimal1(
        normalizedItems.reduce((sum, item) => sum + Number(item.personal_estimate_hours || 0), 0),
      )
      const actualHours = toDecimal1(
        normalizedItems.reduce((sum, item) => sum + Number(item.actual_hours || 0), 0),
      )
      const demandCount = new Set(
        normalizedItems.map((item) => String(item.demand_id || '').trim()).filter(Boolean),
      ).size
      const logCount = new Set(
        normalizedItems.map((item) => Number(item.log_id)).filter((item) => Number.isInteger(item) && item > 0),
      ).size

      dailyByUser.get(userId).push({
        log_date: logDate,
        owner_estimate_hours: ownerEstimateHours,
        personal_estimate_hours: personalEstimateHours,
        actual_hours: actualHours,
        log_count: logCount,
        demand_count: demandCount,
        variance_owner_hours: toDecimal1(actualHours - ownerEstimateHours),
        variance_personal_hours: toDecimal1(actualHours - personalEstimateHours),
        saturation_rate: toPercent2((actualHours / DEFAULT_DAILY_CAPACITY_HOURS) * 100),
        items: normalizedItems.sort((a, b) => Number(a.log_id || 0) - Number(b.log_id || 0)),
      })
    })

    const normalizedKeyword = String(keyword || '').trim().toLowerCase()
    const hasLogDimensionFilter = Boolean(businessGroupCode || ownerUserId)

    const memberListBase = scopedUserRows.map((userRow) => {
      const userId = Number(userRow.user_id)
      const aggRow = memberAggByUser.get(userId) || {}
      const filledDays = Number((aggRow.filled_days_set && aggRow.filled_days_set.size) || 0)
      const totalOwner = Number(aggRow.total_owner_estimate_hours || 0)
      const totalPersonal = Number(aggRow.total_personal_estimate_hours || 0)
      const totalActual = Number(aggRow.total_actual_hours || 0)
      const capacityHours = filledDays * DEFAULT_DAILY_CAPACITY_HOURS
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
        demand_count: Number((aggRow.demand_ids && aggRow.demand_ids.size) || 0),
        item_scope_count: Number((aggRow.item_scope_keys && aggRow.item_scope_keys.size) || 0),
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
        completed_only: Boolean(completedOnly),
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

  async getDepartmentEfficiencyDetail({
    departmentId,
    startDate,
    endDate,
  } = {}) {
    const normalizedDepartmentId = toPositiveInt(departmentId)
    if (!normalizedDepartmentId) {
      return {
        filters: {
          department_id: null,
          start_date: startDate,
          end_date: endDate,
        },
        summary: {
          department_id: null,
          department_name: '-',
          member_count: 0,
          total_owner_estimate_hours: 0,
          total_personal_estimate_hours: 0,
          total_actual_hours: 0,
          net_efficiency_value: null,
          task_difficulty_coefficient: 1,
          job_level_weight_coefficient: 1,
          avg_actual_hours: 0,
          avg_actual_hours_per_member: 0,
          variance_owner_hours: 0,
          variance_personal_hours: 0,
        },
        work_type_distribution: [],
        member_ranking: [],
        demand_top_list: [],
        trend: [],
        alerts: {
          high_load_members: [],
          low_load_members: [],
          high_variance_demands: [],
        },
      }
    }

    const [rankingData, memberInsight, demandInsight, workTypeRows, trendRows] = await Promise.all([
      this.getDepartmentEfficiencyRanking({
        departmentId: normalizedDepartmentId,
        startDate,
        endDate,
        sortOrder: 'desc',
      }),
      this.getMemberInsight({
        startDate,
        endDate,
        departmentId: normalizedDepartmentId,
      }),
      this.getDemandInsight({
        startDate,
        endDate,
        departmentId: normalizedDepartmentId,
      }),
      pool.query(
        `SELECT
           COALESCE(t.id, l.item_type_id) AS item_type_id,
           COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
           COUNT(*) AS task_count,
           ROUND(COALESCE(SUM(${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL}), 0), 1) AS owner_estimate_hours,
           ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS personal_estimate_hours,
           ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS actual_hours
         FROM work_logs l
         INNER JOIN users u ON u.id = l.user_id
         LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
         WHERE u.department_id = ?
           AND COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
           AND COALESCE(u.include_in_metrics, 1) = 1
           AND l.log_date >= ?
           AND l.log_date <= ?
         GROUP BY COALESCE(t.id, l.item_type_id), COALESCE(t.name, CONCAT('类型#', l.item_type_id))
         ORDER BY actual_hours DESC, task_count DESC, item_type_id ASC`,
        [normalizedDepartmentId, startDate, endDate],
      ).then((r) => r[0] || []),
      pool.query(
        `SELECT
           DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
           ROUND(COALESCE(SUM(${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL}), 0), 1) AS owner_estimate_hours,
           ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS personal_estimate_hours,
           ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS actual_hours
         FROM work_logs l
         INNER JOIN users u ON u.id = l.user_id
         LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
         WHERE u.department_id = ?
           AND COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
           AND COALESCE(u.include_in_metrics, 1) = 1
           AND l.log_date >= ?
           AND l.log_date <= ?
         GROUP BY DATE_FORMAT(l.log_date, '%Y-%m-%d')
         ORDER BY log_date ASC`,
        [normalizedDepartmentId, startDate, endDate],
      ).then((r) => r[0] || []),
    ])

    const summary = rankingData?.summary || {}
    const trendMap = new Map(
      (trendRows || []).map((row) => [
        String(row.log_date || ''),
        {
          date: row.log_date,
          owner_estimate_hours: toDecimal1(row.owner_estimate_hours),
          personal_estimate_hours: toDecimal1(row.personal_estimate_hours),
          actual_hours: toDecimal1(row.actual_hours),
        },
      ]),
    )
    const trend = buildDateRange(startDate, endDate).map((date) => {
      const found = trendMap.get(date)
      return (
        found || {
          date,
          owner_estimate_hours: 0,
          personal_estimate_hours: 0,
          actual_hours: 0,
        }
      )
    })

    const demandTopList = Array.isArray(demandInsight?.demand_list)
      ? demandInsight.demand_list.slice(0, 10).map((item) => ({
          demand_id: item.demand_id,
          demand_name: item.demand_name,
          member_count: Number(item.member_count || 0),
          total_owner_estimate_hours: toDecimal1(item.total_owner_estimate_hours),
          total_personal_estimate_hours: toDecimal1(item.total_personal_estimate_hours),
          total_actual_hours: toDecimal1(item.total_actual_hours),
          last_log_date: item.last_log_date || null,
        }))
      : []

    const memberList = Array.isArray(memberInsight?.member_list) ? memberInsight.member_list : []
    const highLoadMembers = memberList
      .filter((item) => Number(item.avg_saturation_rate || 0) > 100)
      .sort((a, b) => Number(b.avg_saturation_rate || 0) - Number(a.avg_saturation_rate || 0))
      .slice(0, 10)
      .map((item) => ({
        user_id: item.user_id,
        username: item.username,
        avg_saturation_rate: toPercent2(item.avg_saturation_rate),
        avg_actual_hours_per_day: toDecimal1(item.avg_actual_hours_per_day),
        total_actual_hours: toDecimal1(item.total_actual_hours),
      }))
    const lowLoadMembers = memberList
      .filter((item) => Number(item.avg_saturation_rate || 0) < 60)
      .sort((a, b) => Number(a.avg_saturation_rate || 0) - Number(b.avg_saturation_rate || 0))
      .slice(0, 10)
      .map((item) => ({
        user_id: item.user_id,
        username: item.username,
        avg_saturation_rate: toPercent2(item.avg_saturation_rate),
        avg_actual_hours_per_day: toDecimal1(item.avg_actual_hours_per_day),
        total_actual_hours: toDecimal1(item.total_actual_hours),
      }))
    const highVarianceDemands = demandTopList
      .map((item) => ({
        ...item,
        variance_owner_hours: toDecimal1(
          Number(item.total_actual_hours || 0) - Number(item.total_owner_estimate_hours || 0),
        ),
      }))
      .sort((a, b) => Math.abs(Number(b.variance_owner_hours || 0)) - Math.abs(Number(a.variance_owner_hours || 0)))
      .slice(0, 10)

    return {
      filters: {
        department_id: normalizedDepartmentId,
        start_date: startDate,
        end_date: endDate,
      },
      summary: {
        department_id: normalizedDepartmentId,
        department_name: summary.department_name || `部门#${normalizedDepartmentId}`,
        member_count: Number(summary.member_count || 0),
        total_owner_estimate_hours: toDecimal1(summary.total_owner_estimate_hours),
        total_personal_estimate_hours: toDecimal1(summary.total_personal_estimate_hours),
        total_actual_hours: toDecimal1(summary.total_actual_hours),
        net_efficiency_value:
          summary.net_efficiency_value === null || summary.net_efficiency_value === undefined
            ? null
            : toDecimal2(summary.net_efficiency_value),
        task_difficulty_coefficient: toDecimal4(summary.task_difficulty_coefficient || 1),
        job_level_weight_coefficient: toDecimal4(summary.job_level_weight_coefficient || 1),
        avg_actual_hours: toDecimal1(summary.avg_actual_hours),
        avg_actual_hours_per_member:
          Number(summary.member_count || 0) > 0
            ? toDecimal1(Number(summary.total_actual_hours || 0) / Number(summary.member_count || 0))
            : 0,
        variance_owner_hours: toDecimal1(
          Number(summary.total_actual_hours || 0) - Number(summary.total_owner_estimate_hours || 0),
        ),
        variance_personal_hours: toDecimal1(
          Number(summary.total_actual_hours || 0) - Number(summary.total_personal_estimate_hours || 0),
        ),
      },
      work_type_distribution: (workTypeRows || []).map((row) => ({
        item_type_id: toPositiveInt(row.item_type_id),
        item_type_name: row.item_type_name || '-',
        task_count: Number(row.task_count || 0),
        owner_estimate_hours: toDecimal1(row.owner_estimate_hours),
        personal_estimate_hours: toDecimal1(row.personal_estimate_hours),
        actual_hours: toDecimal1(row.actual_hours),
      })),
      member_ranking: Array.isArray(rankingData?.rows) ? rankingData.rows : [],
      demand_top_list: demandTopList,
      trend,
      alerts: {
        high_load_members: highLoadMembers,
        low_load_members: lowLoadMembers,
        high_variance_demands: highVarianceDemands,
      },
    }
  },

  async getMemberEfficiencyDetail({
    userId,
    startDate,
    endDate,
    completedOnly = false,
  } = {}) {
    await ensureEfficiencyFactorSettingsTable()
    const normalizedUserId = toPositiveInt(userId)
    if (!normalizedUserId) {
      return {
        filters: {
          user_id: null,
          start_date: startDate,
          end_date: endDate,
          completed_only: Boolean(completedOnly),
        },
        summary: {
          user_id: null,
          username: '-',
          department_id: null,
          department_name: '-',
          job_level: null,
          job_level_name: '-',
          filled_days: 0,
          total_owner_estimate_hours: 0,
          total_personal_estimate_hours: 0,
          total_actual_hours: 0,
          net_efficiency_value: null,
          task_difficulty_coefficient: 1,
          job_level_weight_coefficient: 1,
          avg_actual_hours_per_day: 0,
        },
        work_type_distribution: [],
        demand_summary_list: [],
        work_item_list: [],
        trend: [],
        phase_distribution: [],
      }
    }

    const storedRowsPromise = this.listEfficiencyFactorSettings()
    const [userRows, memberInsight, demandInsight, workTypeRows, workItemRows, trendRows, phaseRows, factorRows, storedRows] =
      await Promise.all([
        pool.query(
          `SELECT
             u.id AS user_id,
             COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
             u.department_id,
             COALESCE(dep.name, CONCAT('部门#', u.department_id)) AS department_name,
             COALESCE(u.job_level, '') AS job_level,
             COALESCE(jl.item_name, COALESCE(u.job_level, ''), '-') AS job_level_name
           FROM users u
           LEFT JOIN departments dep ON dep.id = u.department_id
           LEFT JOIN config_dict_items jl
             ON jl.type_key = '${JOB_LEVEL_DICT_KEY}'
            AND jl.item_code = u.job_level
           WHERE u.id = ?
           LIMIT 1`,
          [normalizedUserId],
        ).then((r) => r[0] || []),
        this.getMemberInsight({
          startDate,
          endDate,
          memberUserId: normalizedUserId,
          completedOnly,
        }),
        this.getDemandInsight({
          startDate,
          endDate,
          memberUserId: normalizedUserId,
          completedOnly,
        }),
        pool.query(
          `SELECT
             COALESCE(t.id, l.item_type_id) AS item_type_id,
             COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
             COUNT(*) AS task_count,
             ROUND(COALESCE(SUM(${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL}), 0), 1) AS owner_estimate_hours,
             ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS personal_estimate_hours,
             ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS actual_hours
           FROM work_logs l
           LEFT JOIN work_demands d ON d.id = l.demand_id
           LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
           WHERE l.user_id = ?
             AND l.log_date >= ?
             AND l.log_date <= ?
             ${completedOnly ? "AND COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'" : ''}
           GROUP BY COALESCE(t.id, l.item_type_id), COALESCE(t.name, CONCAT('类型#', l.item_type_id))
           ORDER BY actual_hours DESC, task_count DESC, item_type_id ASC`,
          [normalizedUserId, startDate, endDate],
        ).then((r) => r[0] || []),
        pool.query(
          `SELECT
             l.id AS log_id,
             DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
             COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
             COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
             l.demand_id,
             d.name AS demand_name,
             l.phase_key,
             COALESCE(${buildWorkflowNodeNameSql('l')}, pdi.item_name, l.phase_key, '-') AS phase_name,
             l.description,
             l.task_difficulty_code,
             COALESCE(td.item_name, l.task_difficulty_code, NULL) AS task_difficulty_name,
             l.self_task_difficulty_code,
             COALESCE(std.item_name, l.self_task_difficulty_code, NULL) AS self_task_difficulty_name,
             COALESCE(tdf.coefficient, 1) AS task_difficulty_coefficient,
             ROUND(COALESCE(${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL}, 0), 1) AS owner_estimate_hours,
             ROUND(COALESCE(l.personal_estimate_hours, 0), 1) AS personal_estimate_hours,
             ROUND(COALESCE(l.actual_hours, 0), 1) AS actual_hours,
             DATE_FORMAT(l.expected_start_date, '%Y-%m-%d') AS expected_start_date,
             DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
             DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s') AS last_log_date
           FROM work_logs l
           LEFT JOIN work_demands d ON d.id = l.demand_id
           LEFT JOIN config_dict_items pdi
             ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
            AND pdi.item_code = l.phase_key
           LEFT JOIN config_dict_items td
             ON td.type_key = '${TASK_DIFFICULTY_DICT_KEY}'
            AND td.item_code = l.task_difficulty_code
           LEFT JOIN config_dict_items std
             ON std.type_key = '${TASK_DIFFICULTY_DICT_KEY}'
            AND std.item_code = l.self_task_difficulty_code
           LEFT JOIN efficiency_factor_settings tdf
             ON tdf.factor_type = '${EFFICIENCY_FACTOR_TYPES.TASK_DIFFICULTY_WEIGHT}'
            AND CONVERT(tdf.item_code USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                CONVERT(COALESCE(NULLIF(l.task_difficulty_code, ''), '${DEFAULT_TASK_DIFFICULTY_CODE}') USING utf8mb4) COLLATE utf8mb4_unicode_ci
            AND tdf.enabled = 1
           LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
           WHERE l.user_id = ?
             AND l.log_date >= ?
             AND l.log_date <= ?
             ${completedOnly ? "AND COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'" : ''}
           ORDER BY l.log_date DESC, l.id DESC
           LIMIT 500`,
          [normalizedUserId, startDate, endDate],
        ).then((r) => r[0] || []),
        pool.query(
          `SELECT
             DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
             ROUND(COALESCE(SUM(${EFFECTIVE_OWNER_ESTIMATE_HOURS_SQL}), 0), 1) AS owner_estimate_hours,
             ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS personal_estimate_hours,
             ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS actual_hours
           FROM work_logs l
           LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
           WHERE l.user_id = ?
             AND l.log_date >= ?
             AND l.log_date <= ?
             ${completedOnly ? "AND COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'" : ''}
           GROUP BY DATE_FORMAT(l.log_date, '%Y-%m-%d')
           ORDER BY log_date ASC`,
          [normalizedUserId, startDate, endDate],
        ).then((r) => r[0] || []),
        pool.query(
          `SELECT
             COALESCE(NULLIF(l.phase_key, ''), '__NO_PHASE__') AS phase_key,
             COALESCE(
               MAX(${buildWorkflowNodeNameSql('l')}),
               MAX(pdi.item_name),
               NULLIF(MAX(l.phase_key), ''),
               '未分阶段'
             ) AS phase_name,
             COUNT(*) AS task_count,
             ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS actual_hours
           FROM work_logs l
           LEFT JOIN config_dict_items pdi
             ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
            AND pdi.item_code = l.phase_key
           LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
           WHERE l.user_id = ?
             AND l.log_date >= ?
             AND l.log_date <= ?
             ${completedOnly ? "AND COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'" : ''}
           GROUP BY COALESCE(NULLIF(l.phase_key, ''), '__NO_PHASE__')
          ORDER BY actual_hours DESC, task_count DESC`,
          [normalizedUserId, startDate, endDate],
        ).then((r) => r[0] || []),
        pool.query(
          `SELECT
             COALESCE(
               ROUND(
                 COALESCE(SUM(COALESCE(l.actual_hours, 0) * COALESCE(tdw.coefficient, 1)), 0)
                 / NULLIF(SUM(COALESCE(l.actual_hours, 0)), 0),
                 4
               ),
               1
             ) AS task_difficulty_coefficient,
             MAX(COALESCE(jw.coefficient, 1)) AS job_level_weight_coefficient
           FROM users u
           LEFT JOIN efficiency_factor_settings jw
             ON jw.factor_type = '${EFFICIENCY_FACTOR_TYPES.JOB_LEVEL_WEIGHT}'
            AND CONVERT(jw.item_code USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                CONVERT(COALESCE(NULLIF(u.job_level, ''), '__NO_JOB_LEVEL__') USING utf8mb4) COLLATE utf8mb4_unicode_ci
            AND jw.enabled = 1
           LEFT JOIN work_logs l
             ON l.user_id = u.id
            AND l.log_date >= ?
            AND l.log_date <= ?
            ${completedOnly ? "AND COALESCE(l.log_status, 'IN_PROGRESS') = 'DONE'" : ''}
           LEFT JOIN efficiency_factor_settings tdw
             ON tdw.factor_type = '${EFFICIENCY_FACTOR_TYPES.TASK_DIFFICULTY_WEIGHT}'
            AND CONVERT(tdw.item_code USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                CONVERT(COALESCE(NULLIF(l.task_difficulty_code, ''), '${DEFAULT_TASK_DIFFICULTY_CODE}') USING utf8mb4) COLLATE utf8mb4_unicode_ci
            AND tdw.enabled = 1
           WHERE u.id = ?
           GROUP BY u.id
           LIMIT 1`,
          [startDate, endDate, normalizedUserId],
        ).then((r) => r[0] || []),
        storedRowsPromise,
      ])

    const userInfo = userRows?.[0] || {}
    const memberSummary = Array.isArray(memberInsight?.member_list)
      ? memberInsight.member_list.find((item) => Number(item.user_id) === normalizedUserId) || {}
      : {}
    const memberFactor = factorRows?.[0] || {}
    const netEfficiencyFormula = buildNetEfficiencyFormulaConfig(storedRows)

    const trendMap = new Map(
      (trendRows || []).map((row) => [
        String(row.log_date || ''),
        {
          date: row.log_date,
          owner_estimate_hours: toDecimal1(row.owner_estimate_hours),
          personal_estimate_hours: toDecimal1(row.personal_estimate_hours),
          actual_hours: toDecimal1(row.actual_hours),
        },
      ]),
    )
    const trend = buildDateRange(startDate, endDate).map((date) => {
      const found = trendMap.get(date)
      return (
        found || {
          date,
          owner_estimate_hours: 0,
          personal_estimate_hours: 0,
          actual_hours: 0,
        }
      )
    })

    return {
      filters: {
        user_id: normalizedUserId,
        start_date: startDate,
        end_date: endDate,
        completed_only: Boolean(completedOnly),
      },
      summary: {
        user_id: normalizedUserId,
        username: userInfo.username || memberSummary.username || `用户${normalizedUserId}`,
        department_id: toPositiveInt(userInfo.department_id),
        department_name: userInfo.department_name || memberSummary.department_name || '-',
        job_level: userInfo.job_level || null,
        job_level_name: userInfo.job_level_name || userInfo.job_level || '-',
        filled_days: Number(memberSummary.filled_days || 0),
        total_owner_estimate_hours: toDecimal1(memberSummary.total_owner_estimate_hours),
        total_personal_estimate_hours: toDecimal1(memberSummary.total_personal_estimate_hours),
        total_actual_hours: toDecimal1(memberSummary.total_actual_hours),
        task_difficulty_coefficient: toDecimal4(memberFactor.task_difficulty_coefficient || 1),
        job_level_weight_coefficient: toDecimal4(memberFactor.job_level_weight_coefficient || 1),
        net_efficiency_value: evaluateNetEfficiencyByFormula(
          netEfficiencyFormula.expression,
          buildNetEfficiencyContext({
            totalOwnerEstimateHours: memberSummary.total_owner_estimate_hours,
            totalPersonalEstimateHours: memberSummary.total_personal_estimate_hours,
            totalActualHours: memberSummary.total_actual_hours,
            taskDifficultyCoefficient: memberFactor.task_difficulty_coefficient || 1,
            jobLevelWeightCoefficient: memberFactor.job_level_weight_coefficient || 1,
          }),
        ),
        avg_actual_hours_per_day: toDecimal1(memberSummary.avg_actual_hours_per_day),
      },
      work_type_distribution: (workTypeRows || []).map((row) => ({
        item_type_id: toPositiveInt(row.item_type_id),
        item_type_name: row.item_type_name || '-',
        task_count: Number(row.task_count || 0),
        owner_estimate_hours: toDecimal1(row.owner_estimate_hours),
        personal_estimate_hours: toDecimal1(row.personal_estimate_hours),
        actual_hours: toDecimal1(row.actual_hours),
      })),
      demand_summary_list: Array.isArray(demandInsight?.demand_list)
        ? demandInsight.demand_list.map((item) => ({
            demand_id: item.demand_id,
            demand_name: item.demand_name,
            business_group_code: item.business_group_code || null,
            business_group_name: item.business_group_name || '-',
            phase_count: Number(item.phase_count || 0),
            total_owner_estimate_hours: toDecimal1(item.total_owner_estimate_hours),
            total_personal_estimate_hours: toDecimal1(item.total_personal_estimate_hours),
            total_actual_hours: toDecimal1(item.total_actual_hours),
            variance_owner_hours: toDecimal1(item.variance_owner_hours),
            variance_personal_hours: toDecimal1(item.variance_personal_hours),
            last_log_date: item.last_log_date || null,
          }))
        : [],
      work_item_list: (workItemRows || []).map((row) => ({
        log_id: Number(row.log_id),
        log_date: row.log_date || null,
        item_type_name: row.item_type_name || '-',
        log_status: row.log_status || 'IN_PROGRESS',
        task_difficulty_code: row.task_difficulty_code || null,
        task_difficulty_name: row.task_difficulty_name || row.task_difficulty_code || null,
        self_task_difficulty_code: row.self_task_difficulty_code || null,
        self_task_difficulty_name: row.self_task_difficulty_name || row.self_task_difficulty_code || null,
        task_difficulty_coefficient: toDecimal4(row.task_difficulty_coefficient || 1),
        demand_id: row.demand_id || null,
        demand_name: row.demand_name || null,
        phase_key: row.phase_key || '',
        phase_name: row.phase_name || row.phase_key || '-',
        description: row.description || '',
        owner_estimate_hours: toDecimal1(row.owner_estimate_hours),
        personal_estimate_hours: toDecimal1(row.personal_estimate_hours),
        actual_hours: toDecimal1(row.actual_hours),
        net_efficiency_value: evaluateNetEfficiencyByFormula(
          netEfficiencyFormula.expression,
          buildNetEfficiencyContext({
            totalOwnerEstimateHours: row.owner_estimate_hours,
            totalPersonalEstimateHours: row.personal_estimate_hours,
            totalActualHours: row.actual_hours,
            taskDifficultyCoefficient: row.task_difficulty_coefficient || 1,
            jobLevelWeightCoefficient: memberFactor.job_level_weight_coefficient || 1,
          }),
        ),
        expected_start_date: row.expected_start_date || null,
        expected_completion_date: row.expected_completion_date || null,
        last_log_date: row.last_log_date || null,
      })),
      trend,
      phase_distribution: (phaseRows || []).map((row) => ({
        phase_key: row.phase_key === '__NO_PHASE__' ? '' : row.phase_key || '',
        phase_name: row.phase_name || '未分阶段',
        task_count: Number(row.task_count || 0),
        actual_hours: toDecimal1(row.actual_hours),
      })),
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

  // 方案5：混合模式冲突检测
  async checkActualHoursConflict(logId, newActualHours) {
    if (!newActualHours || newActualHours === 0) return { hasConflict: false }

    const [entries] = await pool.query(
      'SELECT COUNT(*) as count FROM work_log_daily_entries WHERE log_id = ?',
      [logId]
    )

    if (entries[0].count > 0) {
      return {
        hasConflict: true,
        message: '该工作已有每日实际用时记录，不能一次性填写总实际用时。请删除每日记录后再试，或继续使用每日记录模式。'
      }
    }

    return { hasConflict: false }
  },

  // 方案7：预估修改后重新计算每日计划
  async recalculateDailyPlans(logId) {
    const [logs] = await pool.query(
      'SELECT personal_estimate_hours, expected_start_date, expected_completion_date, log_status, log_completed_at FROM work_logs WHERE id = ?',
      [logId]
    )

    if (logs.length === 0) return

    const log = logs[0]
    const today = new Date().toISOString().split('T')[0]

    // 删除今天及未来的自动计划
    await pool.query(
      'DELETE FROM work_log_daily_plans WHERE log_id = ? AND plan_date >= ? AND source = ?',
      [logId, today, 'AUTO']
    )

    // 重新生成每日计划
    const effectiveEndDate = resolveEffectivePlanEndDate(log.expected_completion_date, {
      logStatus: log.log_status,
      logCompletedAt: log.log_completed_at,
    })

    if (log.expected_start_date && effectiveEndDate && log.personal_estimate_hours > 0) {
      const startDate = new Date(Math.max(new Date(log.expected_start_date), new Date(today)))
      const endDate = new Date(effectiveEndDate)

      // 计算工作日数量（排除周末）
      let workDays = 0
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0 && d.getDay() !== 6) workDays++
      }

      if (workDays > 0) {
        const dailyHours = (log.personal_estimate_hours / workDays).toFixed(1)

        // 插入新的每日计划
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          if (d.getDay() !== 0 && d.getDay() !== 6) {
            const planDate = d.toISOString().split('T')[0]
            await pool.query(
              'INSERT INTO work_log_daily_plans (log_id, plan_date, planned_hours, source) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE planned_hours = ?, source = ?',
              [logId, planDate, dailyHours, 'AUTO', dailyHours, 'AUTO']
            )
          }
        }
      }
    }
  },

  async getMyAssignedItems(assignedByUserId) {
    const sql = `
      SELECT
        l.id,
        l.user_id,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
        l.item_type_id,
        it.name AS item_type_name,
        l.description,
        l.demand_id,
        d.name AS demand_name,
        l.phase_key,
        l.personal_estimate_hours,
        l.actual_hours,
        l.expected_start_date,
        l.expected_completion_date,
        l.log_status,
        l.log_completed_at
      FROM work_logs l
      LEFT JOIN users u ON u.id = l.user_id
      LEFT JOIN work_item_types it ON it.id = l.item_type_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      WHERE l.assigned_by_user_id = ?
      ORDER BY l.id DESC
    `
    const [rows] = await pool.query(sql, [assignedByUserId])
    return rows
  }
}

module.exports = Work
