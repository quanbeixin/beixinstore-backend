const pool = require('../utils/db')

const DEMAND_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']
const DEMAND_PRIORITIES = ['P0', 'P1', 'P2', 'P3']
const WORK_LOG_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE']
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

const Work = {
  DEMAND_STATUSES,
  DEMAND_PRIORITIES,
  WORK_LOG_STATUSES,

  async isDepartmentManager(userId) {
    const rows = await listManagedDepartmentRows(userId)
    return rows.length > 0
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
        l.demand_id,
        l.phase_key,
        DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
        DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
        COALESCE(pdi.item_name, l.phase_key, '-') AS phase_name,
        d.name AS demand_name,
        DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
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
         l.demand_id,
         l.phase_key,
         DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
         DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
         DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM work_logs l
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
    demandId = null,
    phaseKey = null,
    expectedCompletionDate = null,
    logCompletedAt = null,
  }) {
    const [result] = await pool.query(
      `INSERT INTO work_logs (
         user_id, log_date, item_type_id, description, personal_estimate_hours, actual_hours, remaining_hours, log_status, demand_id, phase_key, expected_completion_date, log_completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'DONE' THEN COALESCE(?, NOW()) ELSE NULL END)`,
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
        demandId,
        phaseKey,
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
      demandId = null,
      phaseKey = null,
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
         demand_id = ?,
         phase_key = ?,
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
        demandId,
        phaseKey,
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
    const [[today]] = await pool.query(
      `SELECT
         COUNT(*) AS log_count_today,
         COALESCE(SUM(personal_estimate_hours), 0) AS personal_estimate_hours_today,
         COALESCE(SUM(actual_hours), 0) AS actual_hours_today,
         COALESCE(SUM(remaining_hours), 0) AS remaining_hours_today
       FROM work_logs
       WHERE user_id = ? AND log_date = CURDATE()`,
      [userId],
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
         DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
         DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
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
      [userId],
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
       ORDER BY l.log_date DESC, l.id DESC
       LIMIT 10`,
      [userId],
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
          total_personal_estimate_hours_today: 0,
          total_actual_hours_today: 0,
        },
        no_fill_members: [],
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

    if (teamMemberIds.length > 0) {
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
       l.demand_id,
       d.name AS demand_name,
       l.phase_key,
       COALESCE(pdi.item_name, l.phase_key, '-') AS phase_name,
       DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
       DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
       COALESCE(t.owner_estimate_rule, 'NONE') AS owner_estimate_rule,
       ${PHASE_OWNER_DEPARTMENT_ID_SQL} AS phase_owner_department_id,
       ${PHASE_OWNER_ESTIMATE_REQUIRED_SQL} AS phase_owner_estimate_required
     FROM work_logs l
     INNER JOIN users u ON u.id = l.user_id
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
       l.demand_id,
       d.name AS demand_name,
       l.phase_key,
       COALESCE(pdi.item_name, l.phase_key, '-') AS phase_name,
       DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
       DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
       COALESCE(t.owner_estimate_rule, 'NONE') AS owner_estimate_rule,
       ${PHASE_OWNER_DEPARTMENT_ID_SQL} AS phase_owner_department_id,
       ${PHASE_OWNER_ESTIMATE_REQUIRED_SQL} AS phase_owner_estimate_required
     FROM work_logs l
     INNER JOIN users u ON u.id = l.user_id
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
      owner_estimate_items: ownerEstimateItems,
      owner_estimate_pending_count: ownerEstimateItems.filter((item) => item.owner_estimate_hours === null).length,
      demand_risks: [],
      phase_risks: [],
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

