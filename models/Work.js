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

async function resolveOwnerScope(ownerUserId, { isSuperAdmin = false, accessProjectId = null } = {}) {
  const scopedProjectId = toPositiveInt(accessProjectId)
  if (isSuperAdmin) {
    let teamMemberIds = []
    if (scopedProjectId) {
      const [rows] = await pool.query(
        `SELECT u.id
         FROM users u
         INNER JOIN pm_user_business_lines ubl
           ON ubl.user_id = u.id
          AND ubl.project_id = ?
         WHERE COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
         ORDER BY u.id ASC`,
        [scopedProjectId],
      )
      teamMemberIds = normalizeUserIds(rows || [])
    } else {
      teamMemberIds = await listActiveUserIds()
    }
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

  const memberSql = scopedProjectId
    ? `SELECT u.id, u.department_id
       FROM users u
       INNER JOIN pm_user_business_lines ubl
         ON ubl.user_id = u.id
        AND ubl.project_id = ?
       WHERE u.department_id IN (?)
         AND COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
       ORDER BY u.id ASC`
    : `SELECT u.id, u.department_id
       FROM users u
       WHERE u.department_id IN (?)
         AND COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
       ORDER BY u.id ASC`
  const memberParams = scopedProjectId ? [scopedProjectId, managedDepartmentIds] : [managedDepartmentIds]
  const [rows] = await pool.query(memberSql, memberParams)

  const teamMemberIds = normalizeUserIds(rows || [])
  const effectiveManagedDepartmentIds = Array.from(
    new Set(
      (rows || [])
        .map((row) => Number(row.department_id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  )
  const effectiveManagedDepartmentNames = managedDepartments
    .filter((item) => effectiveManagedDepartmentIds.includes(Number(item.id)))
    .map((item) => item.name)
    .filter(Boolean)
  const isSingleDepartment = effectiveManagedDepartmentIds.length === 1
  const departmentId = isSingleDepartment ? effectiveManagedDepartmentIds[0] : null
  const departmentName = isSingleDepartment ? effectiveManagedDepartmentNames[0] || null : null

  return {
    scope_type: 'MANAGED_DEPARTMENTS',
    department_id: departmentId,
    department_name: departmentName,
    scope_label:
      effectiveManagedDepartmentIds.length === 0
        ? '未负责部门'
        : isSingleDepartment
          ? departmentName || `部门#${departmentId}`
          : `${effectiveManagedDepartmentIds.length}个负责部门`,
    team_member_ids: teamMemberIds,
    managed_department_ids: effectiveManagedDepartmentIds,
    managed_department_names: effectiveManagedDepartmentNames,
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

function buildDemandInsightWhere({
  startDate,
  endDate,
  departmentId = null,
  businessGroupCode = '',
  ownerUserId = null,
  memberUserId = null,
  keyword = '',
  accessProjectId = null,
} = {}) {
  const conditions = [
    'l.demand_id IS NOT NULL',
    "COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'",
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
  if (toPositiveInt(accessProjectId)) {
    conditions.push('ubl.project_id = ?')
    params.push(toPositiveInt(accessProjectId))
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
  accessProjectId = null,
} = {}) {
  const conditions = ["COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'", 'l.log_date >= ?', 'l.log_date <= ?']
  const params = [startDate, endDate]

  if (departmentId) {
    conditions.push('u.department_id = ?')
    params.push(departmentId)
  }

  if (businessGroupCode) {
    conditions.push('d.business_group_code = ?')
    params.push(businessGroupCode)
  }
  if (toPositiveInt(accessProjectId)) {
    conditions.push('ubl.project_id = ?')
    params.push(toPositiveInt(accessProjectId))
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

  async canManageAssigneeByOwner(ownerUserId, assigneeUserId, { isSuperAdmin = false, accessProjectId = null } = {}) {
    const targetUserId = toPositiveInt(assigneeUserId)
    if (!targetUserId) return false
    const scopedProjectId = toPositiveInt(accessProjectId)

    if (scopedProjectId) {
      const [[bindingRow]] = await pool.query(
        `SELECT 1 AS matched
         FROM pm_user_business_lines
         WHERE user_id = ? AND project_id = ?
         LIMIT 1`,
        [targetUserId, scopedProjectId],
      )
      if (!bindingRow?.matched) return false
    }

    if (isSuperAdmin) return true

    const scope = await resolveOwnerScope(ownerUserId, { isSuperAdmin: false, accessProjectId: scopedProjectId })
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
    accessProjectId = null,
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

    if (toPositiveInt(accessProjectId)) {
      conditions.push(
        `(
          EXISTS (
            SELECT 1
            FROM pm_user_business_lines ubl
            WHERE ubl.user_id = d.owner_user_id
              AND ubl.project_id = ?
          )
          OR EXISTS (
            SELECT 1
            FROM pm_workflow_instances wfi
            WHERE wfi.demand_id = d.id
              AND wfi.project_id = ?
          )
        )`,
      )
      params.push(toPositiveInt(accessProjectId), toPositiveInt(accessProjectId))
    }

    const whereSql = conditions.join(' AND ')
    const normalizedPriorityOrder = String(priorityOrder || '').trim().toLowerCase() === 'desc' ? 'DESC' : 'ASC'
    const listSql = `
      SELECT
        d.id,
        d.name,
        d.owner_user_id,
        COALESCE(wfi.project_id, ubl.project_id) AS mapped_project_id,
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
      LEFT JOIN pm_user_business_lines ubl ON ubl.user_id = d.owner_user_id
      LEFT JOIN pm_workflow_instances wfi ON wfi.demand_id = d.id
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
         COALESCE(wfi.project_id, ubl.project_id) AS mapped_project_id,
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
       LEFT JOIN pm_user_business_lines ubl ON ubl.user_id = d.owner_user_id
       LEFT JOIN pm_workflow_instances wfi ON wfi.demand_id = d.id
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
    accessProjectId = null,
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

    if (toPositiveInt(accessProjectId)) {
      conditions.push(
        `EXISTS (
          SELECT 1
          FROM pm_user_business_lines ubl_scope
          WHERE ubl_scope.user_id = l.user_id
            AND ubl_scope.project_id = ?
        )`,
      )
      params.push(toPositiveInt(accessProjectId))
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

  async deleteLog(id) {
    const [result] = await pool.query(`DELETE FROM work_logs WHERE id = ?`, [id])
    return result.affectedRows
  },

  async canManageLogByDepartmentOwner(ownerUserId, logId, { isSuperAdmin = false, accessProjectId = null } = {}) {
    const scopedProjectId = toPositiveInt(accessProjectId)
    if (isSuperAdmin) return true

    const scope = await resolveOwnerScope(ownerUserId, { isSuperAdmin: false, accessProjectId: scopedProjectId })
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
         ${
           scopedProjectId
             ? `AND EXISTS (
                  SELECT 1
                  FROM pm_user_business_lines ubl_scope
                  WHERE ubl_scope.user_id = l.user_id
                    AND ubl_scope.project_id = ?
                )`
             : ''
         }
         AND COALESCE(l.log_status, 'IN_PROGRESS') <> 'DONE'
       LIMIT 1`,
      scopedProjectId ? [logId, scopedProjectId] : [logId],
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

  async getMyWorkbench(userId, { accessProjectId = null } = {}) {
    const scopedProjectId = toPositiveInt(accessProjectId)
    const scopeWhereSql = scopedProjectId
      ? `AND EXISTS (
           SELECT 1
           FROM pm_user_business_lines ubl_scope
           WHERE ubl_scope.user_id = work_logs.user_id
             AND ubl_scope.project_id = ?
         )`
      : ''
    const scopeWhereForAliasL = scopedProjectId
      ? `AND EXISTS (
           SELECT 1
           FROM pm_user_business_lines ubl_scope
           WHERE ubl_scope.user_id = l.user_id
             AND ubl_scope.project_id = ?
         )`
      : ''
    const [[today]] = await pool.query(
      `SELECT
         COUNT(*) AS log_count_today,
         COALESCE(SUM(personal_estimate_hours), 0) AS personal_estimate_hours_today,
         COALESCE(SUM(actual_hours), 0) AS actual_hours_today,
         COALESCE(SUM(remaining_hours), 0) AS remaining_hours_today
       FROM work_logs
       WHERE user_id = ? AND log_date = CURDATE()
       ${scopeWhereSql}`,
      scopedProjectId ? [userId, scopedProjectId] : [userId],
    )

    const [activeItems] = await pool.query(
      `SELECT
         l.id,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         l.item_type_id,
         COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
         l.description,
         l.personal_estimate_hours,
         l.actual_hours,
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
         COALESCE(pdi.item_name, l.phase_key, '-') AS phase_name
       FROM work_logs l
       LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
       LEFT JOIN users au ON au.id = l.assigned_by_user_id
       LEFT JOIN work_demands d ON d.id = l.demand_id
       LEFT JOIN config_dict_items pdi
         ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
        AND pdi.item_code = l.phase_key
       WHERE l.user_id = ?
         ${scopeWhereForAliasL}
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
      scopedProjectId ? [userId, scopedProjectId] : [userId],
    )

    const [recentLogs] = await pool.query(
      `SELECT
         l.id,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         l.personal_estimate_hours,
         l.actual_hours,
         l.remaining_hours,
         l.description,
         l.demand_id,
         COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name
       FROM work_logs l
       LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
       WHERE l.user_id = ?
       ${scopeWhereForAliasL}
       ORDER BY l.log_date DESC, l.id DESC
       LIMIT 10`,
      scopedProjectId ? [userId, scopedProjectId] : [userId],
    )

    return {
      today: {
        log_count_today: Number(today?.log_count_today || 0),
        personal_estimate_hours_today: Number(today?.personal_estimate_hours_today || 0),
        actual_hours_today: Number(today?.actual_hours_today || 0),
        remaining_hours_today: Number(today?.remaining_hours_today || 0),
      },
      active_items: activeItems,
      recent_logs: recentLogs,
    }
  },

  async getMorningStandupBoard(
    viewerUserId,
    {
      canViewAll = false,
      targetDepartmentId = null,
      tabKey = '',
      activeProjectId = null,
    } = {},
  ) {
    const viewerDepartment = await findUserDepartmentRow(viewerUserId)
    const scopedProjectId = toPositiveInt(activeProjectId)
    let allEnabledDepartments = await listEnabledDepartments()

    if (scopedProjectId) {
      const [departmentRows] = await pool.query(
        `SELECT
           d.id,
           d.name,
           MIN(COALESCE(d.sort_order, 0)) AS sort_order
         FROM users u
         INNER JOIN pm_user_business_lines ubl
           ON ubl.user_id = u.id
          AND ubl.project_id = ?
         INNER JOIN departments d ON d.id = u.department_id
         WHERE COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
           AND COALESCE(d.enabled, 1) = 1
         GROUP BY d.id, d.name
         ORDER BY sort_order ASC, d.id ASC`,
        [scopedProjectId],
      )
      allEnabledDepartments = (departmentRows || []).map((row) => ({
        id: Number(row.id),
        name: row.name || `部门#${Number(row.id)}`,
      }))
    }
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
      },
      focus_items: [],
      members: [],
      no_fill_members: [],
    }

    if (scopedDepartmentIds.length === 0) {
      return emptyPayload
    }

    const memberParams = []
    const memberProjectSql = scopedProjectId
      ? `INNER JOIN pm_user_business_lines ubl
           ON ubl.user_id = u.id
          AND ubl.project_id = ?`
      : ''
    if (scopedProjectId) {
      memberParams.push(scopedProjectId)
    }
    memberParams.push(scopedDepartmentIds)

    const [memberRows] = await pool.query(
      `SELECT
         u.id AS user_id,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
         u.department_id,
         COALESCE(d.name, CONCAT('部门#', u.department_id)) AS department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       ${memberProjectSql}
       WHERE COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
         AND u.department_id IN (?)
       ORDER BY u.department_id ASC, u.id ASC`,
      memberParams,
    )

    const userIds = memberRows
      .map((row) => Number(row.user_id))
      .filter((id) => Number.isInteger(id) && id > 0)

    if (userIds.length === 0) {
      return emptyPayload
    }

    const [filledRows] = await pool.query(
      `SELECT DISTINCT wl.user_id
       FROM work_logs wl
       WHERE wl.log_date = CURDATE()
         AND wl.user_id IN (?)`,
      [userIds],
    )
    const filledSet = new Set(
      filledRows.map((row) => Number(row.user_id)).filter((id) => Number.isInteger(id) && id > 0),
    )

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
         COALESCE(pdi.item_name, l.phase_key, '-') AS phase_name
       FROM work_logs l
       LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
       LEFT JOIN work_demands d ON d.id = l.demand_id
       LEFT JOIN config_dict_items pdi
         ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
        AND pdi.item_code = l.phase_key
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

    const activeItemsByUser = new Map()
    activeItemRows.forEach((row) => {
      const userId = Number(row.user_id)
      if (!activeItemsByUser.has(userId)) {
        activeItemsByUser.set(userId, [])
      }
      activeItemsByUser.get(userId).push(row)
    })

    const [[todayRow]] = await pool.query(`SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today_date`)
    const todayDate = String(todayRow?.today_date || '')
    let activeItemCount = 0
    let overdueItemCount = 0
    let dueTodayItemCount = 0

    const members = memberRows.map((row) => {
      const userId = Number(row.user_id)
      const activeItems = activeItemsByUser.get(userId) || []
      activeItemCount += activeItems.length
      activeItems.forEach((item) => {
        const expectedDate = String(item.expected_completion_date || '').trim()
        if (!expectedDate) return
        if (expectedDate < todayDate) overdueItemCount += 1
        if (expectedDate === todayDate) dueTodayItemCount += 1
      })

      return {
        user_id: userId,
        username: row.username,
        department_id: Number(row.department_id),
        department_name: row.department_name,
        today_filled: filledSet.has(userId),
        active_item_count: activeItems.length,
        active_items: activeItems,
      }
    })

    const filledUsersToday = members.filter((item) => item.today_filled).length
    const noFillMembers = members
      .filter((item) => !item.today_filled)
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
    const focusItems = (activeItemRows || [])
      .map((item) => {
        const expectedDate = String(item.expected_completion_date || '').trim()
        const focusLevel = expectedDate
          ? expectedDate < todayDate
            ? 'OVERDUE'
            : expectedDate === todayDate
              ? 'DUE_TODAY'
              : 'NORMAL'
          : 'NORMAL'
        const demandPriority = String(item.demand_priority || '').trim().toUpperCase()
        return {
          id: Number(item.id),
          user_id: Number(item.user_id),
          username: usernameById.get(Number(item.user_id)) || `用户${Number(item.user_id)}`,
          item_type_name: item.item_type_name || '-',
          demand_id: item.demand_id || null,
          demand_name: item.demand_name || item.demand_id || '-',
          phase_name: item.phase_name || '-',
          log_status: item.log_status || 'IN_PROGRESS',
          expected_completion_date: expectedDate || null,
          demand_priority: demandPriority && priorityRank[demandPriority] !== undefined ? demandPriority : null,
          focus_level: focusLevel,
          description: item.description || '',
        }
      })
      .sort((a, b) => {
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
        unfilled_users_today: Math.max(members.length - filledUsersToday, 0),
        active_item_count: activeItemCount,
        overdue_item_count: overdueItemCount,
        due_today_item_count: dueTodayItemCount,
      },
      focus_summary: {
        overdue_count: overdueItemCount,
        due_today_count: dueTodayItemCount,
        active_count: activeItemCount,
        unfilled_count: Math.max(members.length - filledUsersToday, 0),
      },
      focus_items: focusItems,
      members,
      no_fill_members: noFillMembers,
    }
  },

  async getOwnerWorkbench(ownerUserId, { isSuperAdmin = false, accessProjectId = null } = {}) {
    const scopedProjectId = toPositiveInt(accessProjectId)
    const scope = await resolveOwnerScope(ownerUserId, { isSuperAdmin, accessProjectId: scopedProjectId })
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
          total_personal_estimate_hours_today: 0,
          total_actual_hours_today: 0,
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
      total_personal_estimate_hours_today: 0,
      total_actual_hours_today: 0,
    }
    let overview = defaultOverview
    let noFillMembers = []
    let teamMembers = []

    if (teamMemberIds.length > 0) {
      ;[teamMembers] = await pool.query(
        `SELECT
           u.id,
           COALESCE(NULLIF(u.real_name, ''), u.username) AS username,
           u.department_id
         FROM users u
         WHERE u.id IN (?)
         ORDER BY u.id ASC`,
        [teamMemberIds],
      )

      const [[overviewRow]] = await pool.query(
        `SELECT
           COUNT(DISTINCT u.id) AS team_size,
           COUNT(DISTINCT CASE WHEN wl.log_date = CURDATE() THEN wl.user_id END) AS filled_users_today,
           COALESCE(SUM(CASE WHEN wl.log_date = CURDATE() THEN wl.personal_estimate_hours ELSE 0 END), 0) AS total_personal_estimate_hours_today,
           COALESCE(SUM(CASE WHEN wl.log_date = CURDATE() THEN wl.actual_hours ELSE 0 END), 0) AS total_actual_hours_today
         FROM users u
         LEFT JOIN work_logs wl ON wl.user_id = u.id
         WHERE u.id IN (?)`,
        [teamMemberIds],
      )
      overview = overviewRow || defaultOverview

      ;[noFillMembers] = await pool.query(
        `SELECT
           u.id,
           COALESCE(NULLIF(u.real_name, ''), u.username) AS username
         FROM users u
         LEFT JOIN (
           SELECT DISTINCT user_id
           FROM work_logs
           WHERE log_date = CURDATE()
         ) l ON l.user_id = u.id
         WHERE u.id IN (?) AND l.user_id IS NULL
         ORDER BY u.id ASC`,
        [teamMemberIds],
      )
    }

    let ownerEstimateItems = []
    const ownerEstimateQueryConditions = [`COALESCE(l.log_status, 'IN_PROGRESS') <> 'DONE'`]
    const ownerEstimateQueryParams = []
    if (scopedProjectId) {
      ownerEstimateQueryConditions.push(
        `EXISTS (
          SELECT 1
          FROM pm_user_business_lines ubl_scope
          WHERE ubl_scope.user_id = l.user_id
            AND ubl_scope.project_id = ?
        )`,
      )
      ownerEstimateQueryParams.push(scopedProjectId)
    }

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

    const teamSize = Number(overview?.team_size || 0)
    const filledUsersToday = Number(overview?.filled_users_today || 0)

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
        team_size: teamSize,
        filled_users_today: filledUsersToday,
        unfilled_users_today: Math.max(teamSize - filledUsersToday, 0),
        total_personal_estimate_hours_today: Number(overview?.total_personal_estimate_hours_today || 0),
        total_actual_hours_today: Number(overview?.total_actual_hours_today || 0),
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
    accessProjectId = null,
  } = {}) {
    const { whereSql, params } = buildDemandInsightWhere({
      startDate,
      endDate,
      departmentId,
      businessGroupCode,
      ownerUserId,
      memberUserId,
      keyword,
      accessProjectId,
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
        ROUND(COALESCE(SUM(COALESCE(l.owner_estimate_hours, 0)), 0), 1) AS total_owner_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS total_personal_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS total_actual_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0) - COALESCE(l.owner_estimate_hours, 0)), 0), 1) AS variance_owner_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0) - COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS variance_personal_hours,
        SUM(CASE WHEN l.owner_estimate_hours IS NULL THEN 1 ELSE 0 END) AS unestimated_item_count,
        DATE_FORMAT(MAX(l.log_date), '%Y-%m-%d') AS last_log_date
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN pm_user_business_lines ubl ON ubl.user_id = d.owner_user_id
      LEFT JOIN users ou ON ou.id = d.owner_user_id
      LEFT JOIN config_dict_items bg
        ON bg.type_key = '${BUSINESS_GROUP_DICT_KEY}'
       AND bg.item_code = d.business_group_code
      LEFT JOIN config_dict_items pdi
        ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
       AND pdi.item_code = l.phase_key
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
        ROUND(COALESCE(SUM(COALESCE(l.owner_estimate_hours, 0)), 0), 1) AS total_owner_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS total_personal_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS total_actual_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0) - COALESCE(l.owner_estimate_hours, 0)), 0), 1) AS variance_owner_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0) - COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS variance_personal_hours,
        DATE_FORMAT(MAX(l.log_date), '%Y-%m-%d') AS last_log_date
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN pm_user_business_lines ubl ON ubl.user_id = d.owner_user_id
      LEFT JOIN config_dict_items pdi
        ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
       AND pdi.item_code = l.phase_key
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
        ROUND(COALESCE(SUM(COALESCE(l.owner_estimate_hours, 0)), 0), 1) AS owner_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS personal_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS actual_hours,
        DATE_FORMAT(MAX(l.log_date), '%Y-%m-%d') AS last_log_date
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN pm_user_business_lines ubl ON ubl.user_id = d.owner_user_id
      LEFT JOIN config_dict_items pdi
        ON pdi.type_key = '${DEMAND_PHASE_DICT_KEY}'
       AND pdi.item_code = l.phase_key
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
    accessProjectId = null,
  } = {}) {
    const userConditions = [`COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'`]
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
    if (toPositiveInt(accessProjectId)) {
      logConditions.push('ubl.project_id = ?')
      logParams.push(toPositiveInt(accessProjectId))
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
        ROUND(COALESCE(SUM(COALESCE(l.owner_estimate_hours, 0)), 0), 1) AS total_owner_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS total_personal_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS total_actual_hours,
        COUNT(DISTINCT COALESCE(l.demand_id, CONCAT('NO_DEMAND#', l.id))) AS item_scope_count,
        COUNT(DISTINCT l.demand_id) AS demand_count,
        SUM(CASE WHEN l.owner_estimate_hours IS NULL THEN 1 ELSE 0 END) AS unestimated_item_count,
        DATE_FORMAT(MAX(l.log_date), '%Y-%m-%d') AS last_log_date
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN pm_user_business_lines ubl ON ubl.user_id = d.owner_user_id
      WHERE ${logWhereSql}
      GROUP BY l.user_id
      ORDER BY total_actual_hours DESC, l.user_id ASC
      LIMIT 4000`

    const dailySql = `
      SELECT
        l.user_id,
        DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
        ROUND(COALESCE(SUM(COALESCE(l.owner_estimate_hours, 0)), 0), 1) AS owner_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS personal_estimate_hours,
        ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS actual_hours,
        COUNT(*) AS log_count,
        COUNT(DISTINCT l.demand_id) AS demand_count
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN pm_user_business_lines ubl ON ubl.user_id = d.owner_user_id
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

  async previewNoFillReminders(ownerUserId, { isSuperAdmin = false, accessProjectId = null } = {}) {
    const ownerWorkbench = await this.getOwnerWorkbench(ownerUserId, { isSuperAdmin, accessProjectId })
    return {
      date: new Date().toISOString().slice(0, 10),
      total_members: ownerWorkbench.team_overview.team_size,
      no_fill_members: ownerWorkbench.no_fill_members,
    }
  },
}

module.exports = Work

