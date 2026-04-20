const pool = require('../utils/db')

const BUG_STATUS_DICT_KEY = 'bug_status'
const BUG_SEVERITY_DICT_KEY = 'bug_severity'
const BUG_PRIORITY_DICT_KEY = 'bug_priority'
const BUG_TYPE_DICT_KEY = 'bug_type'
const BUG_PRODUCT_DICT_KEY = 'bug_product'
const BUG_STAGE_DICT_KEY = 'bug_stage'
const DEFAULT_PRIORITY_CODE = 'MEDIUM'
const BUG_VIEW_VISIBILITY = Object.freeze({
  PRIVATE: 'PRIVATE',
  SHARED: 'SHARED',
})
const BUG_VIEW_GROUP_FIELD_SET = new Set(['status', 'reporter', 'bug_type', 'assignee'])
const BUG_VIEW_ALLOWED_PAGE_SIZE_SET = new Set([20, 50, 100])
const DEFAULT_WORKFLOW_TRANSITIONS = Object.freeze([
  {
    from_status_code: 'NEW',
    to_status_code: 'PROCESSING',
    action_key: 'start',
    action_name: '开始处理',
    enabled: 1,
    sort_order: 10,
    require_remark: 0,
    require_fix_solution: 0,
    require_verify_result: 0,
  },
  {
    from_status_code: 'REOPENED',
    to_status_code: 'PROCESSING',
    action_key: 'start',
    action_name: '重新处理',
    enabled: 1,
    sort_order: 20,
    require_remark: 0,
    require_fix_solution: 0,
    require_verify_result: 0,
  },
  {
    from_status_code: 'PROCESSING',
    to_status_code: 'FIXED',
    action_key: 'fix',
    action_name: '修复完成',
    enabled: 1,
    sort_order: 30,
    require_remark: 0,
    require_fix_solution: 1,
    require_verify_result: 0,
  },
  {
    from_status_code: 'PROCESSING',
    to_status_code: 'CLOSED',
    action_key: 'reject',
    action_name: '打回并关闭',
    enabled: 1,
    sort_order: 40,
    require_remark: 1,
    require_fix_solution: 0,
    require_verify_result: 0,
  },
  {
    from_status_code: 'FIXED',
    to_status_code: 'CLOSED',
    action_key: 'verify',
    action_name: '验证通过',
    enabled: 1,
    sort_order: 50,
    require_remark: 0,
    require_fix_solution: 0,
    require_verify_result: 0,
  },
  {
    from_status_code: 'FIXED',
    to_status_code: 'REOPENED',
    action_key: 'reopen',
    action_name: '重新打开',
    enabled: 1,
    sort_order: 60,
    require_remark: 1,
    require_fix_solution: 0,
    require_verify_result: 0,
  },
  {
    from_status_code: 'CLOSED',
    to_status_code: 'REOPENED',
    action_key: 'reopen',
    action_name: '重新打开',
    enabled: 1,
    sort_order: 70,
    require_remark: 1,
    require_fix_solution: 0,
    require_verify_result: 0,
  },
])

let bugSavedViewTableReady = false
let bugSavedViewTablePromise = null
let bugWorkflowTableReady = false
let bugWorkflowTablePromise = null
const WORKFLOW_TABLE_UNAVAILABLE_ERROR_CODES = new Set([
  'ER_NO_SUCH_TABLE',
  'ER_TABLEACCESS_DENIED_ERROR',
  'ER_DBACCESS_DENIED_ERROR',
  'ER_ACCESS_DENIED_ERROR',
  'ER_SPECIFIC_ACCESS_DENIED_ERROR',
])

const ALLOWED_TRANSITIONS = Object.freeze({
  NEW: ['PROCESSING'],
  PROCESSING: ['FIXED', 'CLOSED'],
  FIXED: ['CLOSED', 'REOPENED'],
  REOPENED: ['PROCESSING'],
  CLOSED: ['REOPENED'],
})

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizePositiveIntList(values) {
  const source = Array.isArray(values) ? values : [values]
  const dedup = new Set()
  source.forEach((item) => {
    const normalized = toPositiveInt(item)
    if (normalized) dedup.add(normalized)
  })
  return Array.from(dedup)
}

function normalizeText(value, maxLen = 255) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeNullableText(value, maxLen = 255) {
  if (value === undefined) return undefined
  const text = normalizeText(value, maxLen)
  return text || null
}

function normalizeDemandId(value) {
  const normalized = String(value || '').trim().toUpperCase()
  return normalized || null
}

function normalizeCode(value, maxLen = 50) {
  const normalized = String(value || '').trim().toUpperCase()
  return normalized.slice(0, maxLen) || null
}

function normalizeTinyBool(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback ? 1 : 0
  if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return 1
  return 0
}

function normalizeTransitionActionKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .slice(0, 50)
}

function normalizeWorkflowTransitionRow(row = {}, { fallbackSort = 0 } = {}) {
  return {
    id: toPositiveInt(row.id),
    from_status_code: normalizeCode(row.from_status_code) || '',
    to_status_code: normalizeCode(row.to_status_code) || '',
    action_key: normalizeTransitionActionKey(row.action_key),
    action_name: normalizeText(row.action_name, 50),
    enabled: normalizeTinyBool(row.enabled, 1),
    sort_order: Number.isInteger(Number(row.sort_order)) ? Number(row.sort_order) : fallbackSort,
    require_remark: normalizeTinyBool(row.require_remark, 0),
    require_fix_solution: normalizeTinyBool(row.require_fix_solution, 0),
    require_verify_result: normalizeTinyBool(row.require_verify_result, 0),
  }
}

function buildDefaultWorkflowTransitions() {
  return DEFAULT_WORKFLOW_TRANSITIONS.map((item, index) =>
    normalizeWorkflowTransitionRow(item, { fallbackSort: (index + 1) * 10 }),
  )
}

function normalizeDateText(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function normalizeBugViewVisibility(value) {
  const normalized = normalizeCode(value, 16)
  return normalized === BUG_VIEW_VISIBILITY.SHARED
    ? BUG_VIEW_VISIBILITY.SHARED
    : BUG_VIEW_VISIBILITY.PRIVATE
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    return {}
  } catch {
    return {}
  }
}

function sanitizeBugViewConfig(config = {}) {
  const source = config && typeof config === 'object' && !Array.isArray(config) ? config : {}
  const dedupGroupFields = new Set()
  const groupFields = (Array.isArray(source.group_fields) ? source.group_fields : [])
    .map((item) => String(item || '').trim())
    .filter((item) => BUG_VIEW_GROUP_FIELD_SET.has(item))
    .filter((item) => {
      if (dedupGroupFields.has(item)) return false
      dedupGroupFields.add(item)
      return true
    })
    .slice(0, 3)
  const pageSize = Number(source.page_size || 0)

  return {
    keyword: normalizeText(source.keyword, 100),
    status_code: normalizeCode(source.status_code),
    severity_code: normalizeCode(source.severity_code),
    assignee_id: toPositiveInt(source.assignee_id),
    reporter_id: toPositiveInt(source.reporter_id),
    start_date: normalizeDateText(source.start_date),
    end_date: normalizeDateText(source.end_date),
    group_fields: groupFields,
    page_size: BUG_VIEW_ALLOWED_PAGE_SIZE_SET.has(pageSize) ? pageSize : 20,
  }
}

function normalizeBugViewRow(row, { viewerUserId = null } = {}) {
  if (!row) return null
  const creatorId = toPositiveInt(row.created_by)
  const normalizedViewerUserId = toPositiveInt(viewerUserId)
  const isOwner = Boolean(creatorId && normalizedViewerUserId && creatorId === normalizedViewerUserId)
  return {
    id: toPositiveInt(row.id),
    view_name: normalizeText(row.view_name, 100),
    visibility: normalizeBugViewVisibility(row.visibility),
    config: sanitizeBugViewConfig(parseJsonObject(row.view_config)),
    created_by: creatorId,
    creator_name: normalizeText(row.creator_name, 100) || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    is_owner: isOwner,
  }
}

async function ensureBugSavedViewTable() {
  if (bugSavedViewTableReady) return
  if (bugSavedViewTablePromise) {
    await bugSavedViewTablePromise
    return
  }

  bugSavedViewTablePromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bug_saved_views (
        id BIGINT NOT NULL AUTO_INCREMENT,
        view_name VARCHAR(100) NOT NULL COMMENT '视图名称',
        visibility VARCHAR(16) NOT NULL DEFAULT 'PRIVATE' COMMENT 'PRIVATE/SHARED',
        view_config JSON NOT NULL COMMENT '筛选与分组配置JSON',
        created_by BIGINT NOT NULL COMMENT '创建人用户ID',
        updated_by BIGINT NULL COMMENT '最后修改人用户ID',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_bug_saved_views_creator (created_by),
        KEY idx_bug_saved_views_visibility (visibility),
        KEY idx_bug_saved_views_deleted (deleted_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bug列表筛选视图'
    `)
    bugSavedViewTableReady = true
  })().finally(() => {
    bugSavedViewTablePromise = null
  })

  await bugSavedViewTablePromise
}

async function ensureBugWorkflowTable() {
  if (bugWorkflowTableReady) return
  if (bugWorkflowTablePromise) {
    await bugWorkflowTablePromise
    return
  }

  bugWorkflowTablePromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bug_workflow_transitions (
        id BIGINT NOT NULL AUTO_INCREMENT,
        from_status_code VARCHAR(50) NOT NULL COMMENT '来源状态编码',
        to_status_code VARCHAR(50) NOT NULL COMMENT '目标状态编码',
        action_key VARCHAR(50) NOT NULL COMMENT '动作编码',
        action_name VARCHAR(50) NOT NULL COMMENT '动作名称',
        enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
        sort_order INT NOT NULL DEFAULT 100 COMMENT '排序',
        require_remark TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否要求备注',
        require_fix_solution TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否要求修复方案',
        require_verify_result TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否要求验证结果',
        created_by BIGINT NULL COMMENT '创建人',
        updated_by BIGINT NULL COMMENT '更新人',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at DATETIME NULL DEFAULT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_bug_workflow_transition (from_status_code, action_key, to_status_code),
        KEY idx_bug_workflow_from_status (from_status_code, enabled, sort_order),
        KEY idx_bug_workflow_deleted (deleted_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Bug流程流转配置'
    `)
    bugWorkflowTableReady = true
  })().finally(() => {
    bugWorkflowTablePromise = null
  })

  await bugWorkflowTablePromise
}

function isWorkflowTableUnavailableError(error) {
  const code = String(error?.code || '').trim().toUpperCase()
  return WORKFLOW_TABLE_UNAVAILABLE_ERROR_CODES.has(code)
}

function createWorkflowConfigUnavailableError(error) {
  const wrapped = new Error(
    'Bug流程配置中心未初始化，请先执行 backend/docs/migrations/apply-bug-workflow-config.sh',
  )
  wrapped.code = 'BUG_WORKFLOW_CONFIG_UNAVAILABLE'
  if (error) wrapped.cause = error
  return wrapped
}

function normalizeBugNo(id) {
  const numericId = toPositiveInt(id)
  if (!numericId) return null
  return `BUG${String(numericId).padStart(4, '0')}`
}

function buildBugListWhere({
  keyword = '',
  statusCode = '',
  severityCode = '',
  priorityCode = '',
  bugTypeCode = '',
  productCode = '',
  issueStage = '',
  demandId = '',
  assigneeId = null,
  reporterId = null,
  startDate = '',
  endDate = '',
} = {}) {
  const conditions = ['b.deleted_at IS NULL']
  const params = []

  if (keyword) {
    conditions.push('(b.bug_no LIKE ? OR b.title LIKE ? OR b.description LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }

  if (statusCode) {
    conditions.push('b.status_code = ?')
    params.push(statusCode)
  }

  if (severityCode) {
    conditions.push('b.severity_code = ?')
    params.push(severityCode)
  }

  if (priorityCode) {
    conditions.push('b.priority_code = ?')
    params.push(priorityCode)
  }

  if (bugTypeCode) {
    conditions.push('b.bug_type_code = ?')
    params.push(bugTypeCode)
  }

  if (productCode) {
    conditions.push('b.product_code = ?')
    params.push(productCode)
  }

  if (issueStage) {
    conditions.push('b.issue_stage = ?')
    params.push(issueStage)
  }

  if (demandId) {
    conditions.push('b.demand_id = ?')
    params.push(demandId)
  }

  if (assigneeId) {
    conditions.push(
      `(b.assignee_id = ? OR EXISTS (
        SELECT 1
        FROM bug_assignees ba_filter
        WHERE ba_filter.bug_id = b.id
          AND ba_filter.user_id = ?
      ))`,
    )
    params.push(assigneeId, assigneeId)
  }

  if (reporterId) {
    conditions.push('b.reporter_id = ?')
    params.push(reporterId)
  }

  if (startDate) {
    conditions.push('DATE(b.created_at) >= ?')
    params.push(startDate)
  }

  if (endDate) {
    conditions.push('DATE(b.created_at) <= ?')
    params.push(endDate)
  }

  return {
    whereSql: conditions.join(' AND '),
    params,
  }
}

const DETAIL_SELECT_SQL = `
  SELECT
    b.id,
    b.bug_no,
    b.title,
    b.description,
    b.severity_code,
    severity.item_name AS severity_name,
    severity.color AS severity_color,
    b.priority_code,
    priority.item_name AS priority_name,
    priority.color AS priority_color,
    b.bug_type_code,
    bugType.item_name AS bug_type_name,
    bugType.color AS bug_type_color,
    b.status_code,
    statusDict.item_name AS status_name,
    statusDict.color AS status_color,
    b.product_code,
    product.item_name AS product_name,
    product.color AS product_color,
    b.issue_stage,
    stageDict.item_name AS issue_stage_name,
    stageDict.color AS issue_stage_color,
    b.reproduce_steps,
    b.expected_result,
    b.actual_result,
    b.environment_info,
    b.demand_id,
    d.name AS demand_name,
    d.owner_user_id AS demand_owner_user_id,
    d.project_manager AS demand_project_manager_id,
    COALESCE(NULLIF(owner.real_name, ''), owner.username) AS demand_owner_name,
    COALESCE(NULLIF(pm.real_name, ''), pm.username) AS demand_project_manager_name,
    b.reporter_id,
    COALESCE(NULLIF(reporter.real_name, ''), reporter.username) AS reporter_name,
    b.assignee_id,
    COALESCE(NULLIF(assignee.real_name, ''), assignee.username) AS assignee_name,
    b.fix_solution,
    b.verify_result,
    DATE_FORMAT(b.closed_at, '%Y-%m-%d %H:%i:%s') AS closed_at,
    DATE_FORMAT(b.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
    DATE_FORMAT(b.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
    (
      SELECT COUNT(1)
      FROM bug_attachments ba_count
      WHERE ba_count.bug_id = b.id
    ) AS attachment_count
  FROM bugs b
  LEFT JOIN config_dict_items severity
    ON severity.type_key = '${BUG_SEVERITY_DICT_KEY}'
   AND severity.item_code = b.severity_code
  LEFT JOIN config_dict_items priority
    ON priority.type_key = '${BUG_PRIORITY_DICT_KEY}'
   AND priority.item_code = b.priority_code
  LEFT JOIN config_dict_items bugType
    ON bugType.type_key = '${BUG_TYPE_DICT_KEY}'
   AND bugType.item_code = b.bug_type_code
  LEFT JOIN config_dict_items statusDict
    ON statusDict.type_key = '${BUG_STATUS_DICT_KEY}'
   AND statusDict.item_code = b.status_code
  LEFT JOIN config_dict_items product
    ON product.type_key = '${BUG_PRODUCT_DICT_KEY}'
   AND product.item_code = b.product_code
  LEFT JOIN config_dict_items stageDict
    ON stageDict.type_key = '${BUG_STAGE_DICT_KEY}'
   AND stageDict.item_code = b.issue_stage
  LEFT JOIN work_demands d ON d.id = b.demand_id
  LEFT JOIN users owner ON owner.id = d.owner_user_id
  LEFT JOIN users pm ON pm.id = d.project_manager
  LEFT JOIN users reporter ON reporter.id = b.reporter_id
  LEFT JOIN users assignee ON assignee.id = b.assignee_id
`

const Bug = {
  ALLOWED_TRANSITIONS,

  async findEnabledDictItem(typeKey, itemCode) {
    const [rows] = await pool.query(
      `SELECT
         i.id,
         i.type_key,
         i.item_code,
         i.item_name,
         i.color,
         i.enabled
       FROM config_dict_items i
       INNER JOIN config_dict_types t ON t.type_key = i.type_key
       WHERE i.type_key = ?
         AND i.item_code = ?
         AND i.enabled = 1
         AND t.enabled = 1
       LIMIT 1`,
      [typeKey, itemCode],
    )
    return rows[0] || null
  },

  async validateDictCode(typeKey, itemCode, { allowNull = false } = {}) {
    const normalizedCode = normalizeCode(itemCode)
    if (!normalizedCode) return allowNull
    const item = await this.findEnabledDictItem(typeKey, normalizedCode)
    return Boolean(item)
  },

  async listAssignees({ demandId = null, keyword = '' } = {}) {
    const normalizedDemandId = normalizeDemandId(demandId)
    const keywordText = normalizeText(keyword, 64)

    let memberIds = []
    if (normalizedDemandId) {
      const [demandRows] = await pool.query(
        `SELECT id, owner_user_id, project_manager
         FROM work_demands
         WHERE id = ?
         LIMIT 1`,
        [normalizedDemandId],
      )
      const demand = demandRows[0] || null

      const [memberRows] = await pool.query(
        `SELECT user_id
         FROM project_members
         WHERE demand_id = ?`,
        [normalizedDemandId],
      )

      memberIds = [
        ...new Set(
          [demand?.owner_user_id, demand?.project_manager, ...memberRows.map((item) => item.user_id)]
            .map((item) => toPositiveInt(item))
            .filter((item) => Number.isInteger(item) && item > 0),
        ),
      ]
    }

    const conditions = ['1 = 1']
    const params = []
    if (memberIds.length > 0) {
      conditions.push(`u.id IN (${memberIds.map(() => '?').join(', ')})`)
      params.push(...memberIds)
    }
    if (keywordText) {
      conditions.push("(u.username LIKE ? OR COALESCE(u.real_name, '') LIKE ?)")
      params.push(`%${keywordText}%`, `%${keywordText}%`)
    }

    const [rows] = await pool.query(
      `SELECT
         u.id,
         u.username,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS name
       FROM users u
       WHERE ${conditions.join(' AND ')}
       ORDER BY COALESCE(NULLIF(u.real_name, ''), u.username) ASC, u.id ASC
       LIMIT 100`,
      params,
    )

    return (rows || []).map((row) => ({
      id: Number(row.id),
      username: row.username || '',
      name: row.name || row.username || `用户${row.id}`,
    }))
  },

  async listBugAssigneeMembers(bugIds = [], conn = pool) {
    const normalizedBugIds = Array.from(
      new Set(
        (bugIds || [])
          .map((item) => toPositiveInt(item))
          .filter((item) => Number.isInteger(item) && item > 0),
      ),
    )
    if (normalizedBugIds.length === 0) return new Map()

    let rows = []
    try {
      const [queryRows] = await conn.query(
        `SELECT
           ba.bug_id,
           ba.user_id,
           ba.is_primary,
           COALESCE(NULLIF(u.real_name, ''), u.username) AS user_name
         FROM bug_assignees ba
         LEFT JOIN users u ON u.id = ba.user_id
         WHERE ba.bug_id IN (${normalizedBugIds.map(() => '?').join(', ')})
         ORDER BY ba.bug_id ASC, ba.is_primary DESC, ba.id ASC`,
        normalizedBugIds,
      )
      rows = queryRows || []
    } catch (error) {
      if (error?.code !== 'ER_NO_SUCH_TABLE') throw error
      return new Map()
    }

    const assigneeMap = new Map()
    ;(rows || []).forEach((row) => {
      const bugId = toPositiveInt(row?.bug_id)
      const userId = toPositiveInt(row?.user_id)
      if (!bugId || !userId) return
      if (!assigneeMap.has(bugId)) assigneeMap.set(bugId, [])
      assigneeMap.get(bugId).push({
        id: userId,
        name: row?.user_name || `用户${userId}`,
        is_primary: Number(row?.is_primary || 0) === 1,
      })
    })

    return assigneeMap
  },

  async listBugWatcherMembers(bugIds = [], conn = pool) {
    const normalizedBugIds = Array.from(
      new Set(
        (bugIds || [])
          .map((item) => toPositiveInt(item))
          .filter((item) => Number.isInteger(item) && item > 0),
      ),
    )
    if (normalizedBugIds.length === 0) return new Map()

    let rows = []
    try {
      const [queryRows] = await conn.query(
        `SELECT
           bw.bug_id,
           bw.user_id,
           COALESCE(NULLIF(u.real_name, ''), u.username) AS user_name
         FROM bug_watchers bw
         LEFT JOIN users u ON u.id = bw.user_id
         WHERE bw.bug_id IN (${normalizedBugIds.map(() => '?').join(', ')})
         ORDER BY bw.bug_id ASC, bw.id ASC`,
        normalizedBugIds,
      )
      rows = queryRows || []
    } catch (error) {
      if (error?.code !== 'ER_NO_SUCH_TABLE') throw error
      return new Map()
    }

    const watcherMap = new Map()
    ;(rows || []).forEach((row) => {
      const bugId = toPositiveInt(row?.bug_id)
      const userId = toPositiveInt(row?.user_id)
      if (!bugId || !userId) return
      if (!watcherMap.has(bugId)) watcherMap.set(bugId, [])
      watcherMap.get(bugId).push({
        id: userId,
        name: row?.user_name || `用户${userId}`,
      })
    })

    return watcherMap
  },

  decorateBugRowsWithAssignees(rows = [], assigneeMap = new Map()) {
    return (rows || []).map((row) => {
      const bugId = toPositiveInt(row?.id)
      const members = (bugId && assigneeMap.get(bugId)) || []
      const uniqueMembers = []
      const seenUserIds = new Set()
      members.forEach((item) => {
        const userId = toPositiveInt(item?.id)
        if (!userId || seenUserIds.has(userId)) return
        seenUserIds.add(userId)
        uniqueMembers.push({
          id: userId,
          name: item?.name || `用户${userId}`,
          is_primary: Number(item?.is_primary || 0) === 1,
        })
      })

      let assigneeIds = uniqueMembers.map((item) => item.id)
      let assigneeList = uniqueMembers

      const legacyAssigneeId = toPositiveInt(row?.assignee_id)
      const legacyAssigneeName = row?.assignee_name || (legacyAssigneeId ? `用户${legacyAssigneeId}` : '')
      if (assigneeIds.length === 0 && legacyAssigneeId) {
        assigneeIds = [legacyAssigneeId]
        assigneeList = [
          {
            id: legacyAssigneeId,
            name: legacyAssigneeName || `用户${legacyAssigneeId}`,
            is_primary: true,
          },
        ]
      }

      const assigneeNames = assigneeList.map((item) => item.name).filter(Boolean)
      const primaryAssignee =
        assigneeList.find((item) => item.is_primary) ||
        assigneeList.find((item) => item.id === legacyAssigneeId) ||
        assigneeList[0] ||
        null

      return {
        ...row,
        assignee_id: primaryAssignee?.id || legacyAssigneeId || null,
        assignee_name: primaryAssignee?.name || legacyAssigneeName || '',
        assignee_ids: assigneeIds,
        assignee_names: assigneeNames.join('、'),
        assignees: assigneeList,
      }
    })
  },

  decorateBugRowsWithWatchers(rows = [], watcherMap = new Map()) {
    return (rows || []).map((row) => {
      const bugId = toPositiveInt(row?.id)
      const members = (bugId && watcherMap.get(bugId)) || []
      const uniqueMembers = []
      const seenUserIds = new Set()
      members.forEach((item) => {
        const userId = toPositiveInt(item?.id)
        if (!userId || seenUserIds.has(userId)) return
        seenUserIds.add(userId)
        uniqueMembers.push({
          id: userId,
          name: item?.name || `用户${userId}`,
        })
      })

      const watcherIds = uniqueMembers.map((item) => item.id)
      const watcherNames = uniqueMembers.map((item) => item.name).filter(Boolean)

      return {
        ...row,
        watcher_ids: watcherIds,
        watcher_names: watcherNames.join('、'),
        watchers: uniqueMembers,
      }
    })
  },

  async syncBugAssignees(conn, bugId, assigneeIds = []) {
    const normalizedBugId = toPositiveInt(bugId)
    const normalizedAssigneeIds = normalizePositiveIntList(assigneeIds)
    if (!normalizedBugId || normalizedAssigneeIds.length === 0) {
      throw new Error('同步Bug处理人失败：处理人不能为空')
    }

    try {
      await conn.query('DELETE FROM bug_assignees WHERE bug_id = ?', [normalizedBugId])
      for (let i = 0; i < normalizedAssigneeIds.length; i += 1) {
        const userId = normalizedAssigneeIds[i]
        await conn.query(
          `INSERT INTO bug_assignees (bug_id, user_id, is_primary)
           VALUES (?, ?, ?)`,
          [normalizedBugId, userId, i === 0 ? 1 : 0],
        )
      }
    } catch (error) {
      if (error?.code !== 'ER_NO_SUCH_TABLE') throw error
      throw new Error('请先执行 bug_multi_assignees 数据库迁移后再使用多人处理人')
    }
  },

  async syncBugWatchers(conn, bugId, watcherIds = []) {
    const normalizedBugId = toPositiveInt(bugId)
    if (!normalizedBugId) {
      throw new Error('同步Bug关注人失败：参数无效')
    }
    const normalizedWatcherIds = normalizePositiveIntList(watcherIds)

    try {
      await conn.query('DELETE FROM bug_watchers WHERE bug_id = ?', [normalizedBugId])
      for (const userId of normalizedWatcherIds) {
        await conn.query(
          `INSERT INTO bug_watchers (bug_id, user_id)
           VALUES (?, ?)`,
          [normalizedBugId, userId],
        )
      }
    } catch (error) {
      if (error?.code !== 'ER_NO_SUCH_TABLE') throw error
      throw new Error('请先执行 bug_watchers 数据库迁移后再使用关注人（数据库迁移）')
    }
  },

  async isBugAssignee(bugId, userId) {
    const normalizedBugId = toPositiveInt(bugId)
    const normalizedUserId = toPositiveInt(userId)
    if (!normalizedBugId || !normalizedUserId) return false

    try {
      const [[relationRow]] = await pool.query(
        `SELECT 1 AS hit
         FROM bug_assignees
         WHERE bug_id = ?
           AND user_id = ?
         LIMIT 1`,
        [normalizedBugId, normalizedUserId],
      )
      if (relationRow?.hit) return true
    } catch (error) {
      if (error?.code !== 'ER_NO_SUCH_TABLE') throw error
    }

    const [[legacyRow]] = await pool.query(
      `SELECT 1 AS hit
       FROM bugs
       WHERE id = ?
         AND assignee_id = ?
         AND deleted_at IS NULL
       LIMIT 1`,
      [normalizedBugId, normalizedUserId],
    )
    return Boolean(legacyRow?.hit)
  },

  sanitizeBugViewConfig(config = {}) {
    return sanitizeBugViewConfig(config)
  },

  normalizeBugViewVisibility(value) {
    return normalizeBugViewVisibility(value)
  },

  async listBugViews({ viewerUserId } = {}) {
    const normalizedViewerUserId = toPositiveInt(viewerUserId)
    if (!normalizedViewerUserId) return []
    await ensureBugSavedViewTable()

    const [rows] = await pool.query(
      `SELECT
         v.id,
         v.view_name,
         v.visibility,
         v.view_config,
         v.created_by,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS creator_name,
         DATE_FORMAT(v.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(v.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM bug_saved_views v
       LEFT JOIN users u ON u.id = v.created_by
       WHERE v.deleted_at IS NULL
         AND (v.created_by = ? OR v.visibility = 'SHARED')
       ORDER BY
         CASE WHEN v.created_by = ? THEN 0 ELSE 1 END ASC,
         v.updated_at DESC,
         v.id DESC`,
      [normalizedViewerUserId, normalizedViewerUserId],
    )

    return (rows || []).map((item) =>
      normalizeBugViewRow(item, { viewerUserId: normalizedViewerUserId }),
    )
  },

  async getBugViewById(viewId, { viewerUserId = null, bypassScope = false } = {}) {
    const normalizedViewId = toPositiveInt(viewId)
    if (!normalizedViewId) return null
    await ensureBugSavedViewTable()

    const normalizedViewerUserId = toPositiveInt(viewerUserId)
    let visibilityCondition = ''
    const params = [normalizedViewId]

    if (!bypassScope) {
      if (!normalizedViewerUserId) return null
      visibilityCondition = ' AND (v.created_by = ? OR v.visibility = ?)'
      params.push(normalizedViewerUserId, BUG_VIEW_VISIBILITY.SHARED)
    }

    const [rows] = await pool.query(
      `SELECT
         v.id,
         v.view_name,
         v.visibility,
         v.view_config,
         v.created_by,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS creator_name,
         DATE_FORMAT(v.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(v.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM bug_saved_views v
       LEFT JOIN users u ON u.id = v.created_by
       WHERE v.id = ?
         AND v.deleted_at IS NULL
         ${visibilityCondition}
       LIMIT 1`,
      params,
    )

    return normalizeBugViewRow(rows?.[0], { viewerUserId: normalizedViewerUserId })
  },

  async createBugView({
    viewName,
    visibility = BUG_VIEW_VISIBILITY.PRIVATE,
    config = {},
    createdBy,
    updatedBy = null,
  } = {}) {
    const normalizedCreatedBy = toPositiveInt(createdBy)
    if (!normalizedCreatedBy) return null
    await ensureBugSavedViewTable()

    const normalizedViewName = normalizeText(viewName, 100)
    if (!normalizedViewName) return null
    const normalizedVisibility = normalizeBugViewVisibility(visibility)
    const normalizedConfig = sanitizeBugViewConfig(config)
    const normalizedUpdatedBy = toPositiveInt(updatedBy) || normalizedCreatedBy

    const [result] = await pool.query(
      `INSERT INTO bug_saved_views (
         view_name,
         visibility,
         view_config,
         created_by,
         updated_by
       ) VALUES (?, ?, CAST(? AS JSON), ?, ?)`,
      [
        normalizedViewName,
        normalizedVisibility,
        JSON.stringify(normalizedConfig),
        normalizedCreatedBy,
        normalizedUpdatedBy,
      ],
    )
    return toPositiveInt(result?.insertId)
  },

  async updateBugView(
    viewId,
    { viewName, visibility = BUG_VIEW_VISIBILITY.PRIVATE, config = {}, updatedBy } = {},
  ) {
    const normalizedViewId = toPositiveInt(viewId)
    const normalizedUpdatedBy = toPositiveInt(updatedBy)
    if (!normalizedViewId || !normalizedUpdatedBy) return 0
    await ensureBugSavedViewTable()

    const normalizedViewName = normalizeText(viewName, 100)
    if (!normalizedViewName) return 0
    const normalizedVisibility = normalizeBugViewVisibility(visibility)
    const normalizedConfig = sanitizeBugViewConfig(config)

    const [result] = await pool.query(
      `UPDATE bug_saved_views
       SET view_name = ?,
           visibility = ?,
           view_config = CAST(? AS JSON),
           updated_by = ?
       WHERE id = ?
         AND deleted_at IS NULL`,
      [
        normalizedViewName,
        normalizedVisibility,
        JSON.stringify(normalizedConfig),
        normalizedUpdatedBy,
        normalizedViewId,
      ],
    )

    return Number(result?.affectedRows || 0)
  },

  async deleteBugView(viewId, { updatedBy } = {}) {
    const normalizedViewId = toPositiveInt(viewId)
    const normalizedUpdatedBy = toPositiveInt(updatedBy)
    if (!normalizedViewId || !normalizedUpdatedBy) return 0
    await ensureBugSavedViewTable()

    const [result] = await pool.query(
      `UPDATE bug_saved_views
       SET deleted_at = NOW(),
           updated_by = ?
       WHERE id = ?
         AND deleted_at IS NULL`,
      [normalizedUpdatedBy, normalizedViewId],
    )
    return Number(result?.affectedRows || 0)
  },

  async listBugWorkflowTransitions({ includeDisabled = false } = {}) {
    try {
      await ensureBugWorkflowTable()

      const [rows] = await pool.query(
        `SELECT
           id,
           from_status_code,
           to_status_code,
           action_key,
           action_name,
           enabled,
           sort_order,
           require_remark,
           require_fix_solution,
           require_verify_result
         FROM bug_workflow_transitions
         WHERE deleted_at IS NULL
         ${includeDisabled ? '' : 'AND enabled = 1'}
         ORDER BY sort_order ASC, id ASC`,
      )

      return (rows || [])
        .map((item, index) => normalizeWorkflowTransitionRow(item, { fallbackSort: (index + 1) * 10 }))
        .filter((item) => item.from_status_code && item.to_status_code && item.action_key)
    } catch (error) {
      if (!isWorkflowTableUnavailableError(error)) throw error
      return []
    }
  },

  async getBugStatusOptions({ enabledOnly = true } = {}) {
    let rows = []
    try {
      const [queryRows] = await pool.query(
        `SELECT
           item_code,
           item_name,
           color,
           enabled,
           sort_order
         FROM config_dict_items
         WHERE type_key = ?
           ${enabledOnly ? 'AND enabled = 1' : ''}
         ORDER BY sort_order ASC, id ASC`,
        [BUG_STATUS_DICT_KEY],
      )
      rows = queryRows || []
    } catch (error) {
      if (String(error?.code || '').trim().toUpperCase() !== 'ER_BAD_FIELD_ERROR') {
        throw error
      }

      const [fallbackRows] = await pool.query(
        `SELECT
           item_code,
           item_name,
           color,
           enabled
         FROM config_dict_items
         WHERE type_key = ?
           ${enabledOnly ? 'AND enabled = 1' : ''}
         ORDER BY id ASC`,
        [BUG_STATUS_DICT_KEY],
      )
      rows = fallbackRows || []
    }

    return (rows || [])
      .map((item) => ({
        status_code: normalizeCode(item.item_code) || '',
        status_name: normalizeText(item.item_name, 50) || normalizeCode(item.item_code) || '',
        color: normalizeText(item.color, 20) || null,
        enabled: normalizeTinyBool(item.enabled, 1),
        sort_order: Number.isInteger(Number(item.sort_order)) ? Number(item.sort_order) : 0,
      }))
      .filter((item) => item.status_code)
  },

  async getBugWorkflowConfig({ includeDisabled = false } = {}) {
    const [statusOptions, transitionsFromDb] = await Promise.all([
      this.getBugStatusOptions({ enabledOnly: true }),
      this.listBugWorkflowTransitions({ includeDisabled }),
    ])

    const transitions =
      transitionsFromDb.length > 0
        ? transitionsFromDb
        : buildDefaultWorkflowTransitions().filter((item) => includeDisabled || item.enabled)

    return {
      statuses: statusOptions,
      transitions,
    }
  },

  async getWorkflowTransitionsForStatus(fromStatusCode, { includeDisabled = false } = {}) {
    const fromCode = normalizeCode(fromStatusCode)
    if (!fromCode) return []

    const config = await this.getBugWorkflowConfig({ includeDisabled })
    const matched = (config.transitions || []).filter(
      (item) => normalizeCode(item.from_status_code) === fromCode && (includeDisabled || item.enabled),
    )
    if (matched.length > 0) return matched

    const fallbackTargets = ALLOWED_TRANSITIONS[fromCode] || []
    return buildDefaultWorkflowTransitions().filter(
      (item) =>
        item.from_status_code === fromCode &&
        fallbackTargets.includes(item.to_status_code) &&
        (includeDisabled || item.enabled),
    )
  },

  async getWorkflowTransitionRule({ fromStatusCode, toStatusCode, actionKey = '' } = {}) {
    const fromCode = normalizeCode(fromStatusCode)
    const toCode = normalizeCode(toStatusCode)
    const normalizedActionKey = normalizeTransitionActionKey(actionKey)
    if (!fromCode || !toCode) return null

    const transitions = await this.getWorkflowTransitionsForStatus(fromCode, { includeDisabled: false })
    return (
      transitions.find(
        (item) =>
          item.from_status_code === fromCode &&
          item.to_status_code === toCode &&
          (!normalizedActionKey || item.action_key === normalizedActionKey),
      ) || null
    )
  },

  async replaceBugWorkflowTransitions(transitions = [], { operatorUserId = null } = {}) {
    try {
      await ensureBugWorkflowTable()
    } catch (error) {
      if (isWorkflowTableUnavailableError(error)) {
        throw createWorkflowConfigUnavailableError(error)
      }
      throw error
    }

    const normalizedOperatorId = toPositiveInt(operatorUserId)
    const source = Array.isArray(transitions) ? transitions : []
    const prepared = source
      .map((item, index) =>
        normalizeWorkflowTransitionRow(item, {
          fallbackSort: Number.isInteger(Number(item?.sort_order)) ? Number(item.sort_order) : (index + 1) * 10,
        }),
      )
      .filter((item) => item.from_status_code && item.to_status_code && item.action_key)

    if (prepared.length === 0) {
      return 0
    }

    const dedupMap = new Map()
    prepared.forEach((item, index) => {
      const dedupKey = `${item.from_status_code}|${item.action_key}|${item.to_status_code}`
      if (!dedupMap.has(dedupKey)) {
        dedupMap.set(dedupKey, {
          ...item,
          sort_order: Number.isInteger(Number(item.sort_order)) ? Number(item.sort_order) : (index + 1) * 10,
        })
      }
    })
    const finalRows = Array.from(dedupMap.values())

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      // NOTE:
      // 当前表存在唯一索引 uk_bug_workflow_transition(from_status_code, action_key, to_status_code)。
      // 如果仅做软删除（deleted_at=NOW()）再插入同键记录，会触发唯一键冲突。
      // 这里改为覆盖式硬删除后重建，保证保存流程配置时不会出现 ER_DUP_ENTRY。
      await conn.query('DELETE FROM bug_workflow_transitions')

      for (let index = 0; index < finalRows.length; index += 1) {
        const item = finalRows[index]
        await conn.query(
          `INSERT INTO bug_workflow_transitions (
             from_status_code,
             to_status_code,
             action_key,
             action_name,
             enabled,
             sort_order,
             require_remark,
             require_fix_solution,
             require_verify_result,
             created_by,
             updated_by,
             deleted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          [
            item.from_status_code,
            item.to_status_code,
            item.action_key,
            item.action_name || item.action_key,
            item.enabled,
            Number.isInteger(Number(item.sort_order)) ? Number(item.sort_order) : (index + 1) * 10,
            item.require_remark,
            item.require_fix_solution,
            item.require_verify_result,
            normalizedOperatorId,
            normalizedOperatorId,
          ],
        )
      }

      await conn.commit()
      return finalRows.length
    } catch (error) {
      await conn.rollback()
      if (isWorkflowTableUnavailableError(error)) {
        throw createWorkflowConfigUnavailableError(error)
      }
      throw error
    } finally {
      conn.release()
    }
  },

  async listBugs({
    page = 1,
    pageSize = 20,
    keyword = '',
    statusCode = '',
    severityCode = '',
    priorityCode = '',
    bugTypeCode = '',
    productCode = '',
    issueStage = '',
    demandId = '',
    assigneeId = null,
    reporterId = null,
    startDate = '',
    endDate = '',
  } = {}) {
    const normalizedPage = Math.max(1, Number(page) || 1)
    const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 20))
    const offset = (normalizedPage - 1) * normalizedPageSize
    const { whereSql, params } = buildBugListWhere({
      keyword: normalizeText(keyword, 100),
      statusCode: normalizeCode(statusCode),
      severityCode: normalizeCode(severityCode),
      priorityCode: normalizeCode(priorityCode),
      bugTypeCode: normalizeCode(bugTypeCode),
      productCode: normalizeCode(productCode),
      issueStage: normalizeCode(issueStage),
      demandId: normalizeDemandId(demandId),
      assigneeId: toPositiveInt(assigneeId),
      reporterId: toPositiveInt(reporterId),
      startDate: normalizeText(startDate, 10),
      endDate: normalizeText(endDate, 10),
    })

    const [rows] = await pool.query(
      `${DETAIL_SELECT_SQL}
       WHERE ${whereSql}
       ORDER BY
         CASE b.status_code
           WHEN 'NEW' THEN 0
           WHEN 'REOPENED' THEN 1
           WHEN 'PROCESSING' THEN 2
           WHEN 'FIXED' THEN 3
           WHEN 'CLOSED' THEN 4
           ELSE 9
         END ASC,
         b.created_at DESC,
         b.id DESC
       LIMIT ? OFFSET ?`,
      [...params, normalizedPageSize, offset],
    )

    const rowIds = (rows || []).map((item) => item.id)
    const [assigneeMap, watcherMap] = await Promise.all([
      this.listBugAssigneeMembers(rowIds),
      this.listBugWatcherMembers(rowIds),
    ])
    const rowsWithAssignees = this.decorateBugRowsWithAssignees(rows || [], assigneeMap)
    const decoratedRows = this.decorateBugRowsWithWatchers(rowsWithAssignees, watcherMap)

    const [[totalRow]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM bugs b
       WHERE ${whereSql}`,
      params,
    )

    return {
      rows: decoratedRows,
      total: Number(totalRow?.total || 0),
      page: normalizedPage,
      pageSize: normalizedPageSize,
    }
  },

  async findBugById(id) {
    const bugId = toPositiveInt(id)
    if (!bugId) return null
    const [rows] = await pool.query(
      `${DETAIL_SELECT_SQL}
       WHERE b.id = ?
         AND b.deleted_at IS NULL
       LIMIT 1`,
      [bugId],
    )
    const firstRow = rows[0] || null
    if (!firstRow) return null
    const [assigneeMap, watcherMap] = await Promise.all([
      this.listBugAssigneeMembers([bugId]),
      this.listBugWatcherMembers([bugId]),
    ])
    const withAssignees = this.decorateBugRowsWithAssignees([firstRow], assigneeMap)
    return this.decorateBugRowsWithWatchers(withAssignees, watcherMap)[0] || null
  },

  async listBugStatusLogs(bugId) {
    const normalizedBugId = toPositiveInt(bugId)
    if (!normalizedBugId) return []
    const [rows] = await pool.query(
      `SELECT
         l.id,
         l.bug_id,
         l.from_status_code,
         fromDict.item_name AS from_status_name,
         l.to_status_code,
         toDict.item_name AS to_status_name,
         l.operator_id,
         l.parent_comment_id,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS operator_name,
         l.remark,
         DATE_FORMAT(l.edited_at, '%Y-%m-%d %H:%i:%s') AS edited_at,
         DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM bug_status_logs l
       LEFT JOIN config_dict_items fromDict
         ON fromDict.type_key = '${BUG_STATUS_DICT_KEY}'
        AND fromDict.item_code = l.from_status_code
       LEFT JOIN config_dict_items toDict
         ON toDict.type_key = '${BUG_STATUS_DICT_KEY}'
        AND toDict.item_code = l.to_status_code
       LEFT JOIN users u ON u.id = l.operator_id
       WHERE l.bug_id = ?
       ORDER BY l.id DESC`,
      [normalizedBugId],
    )
    return rows || []
  },

  async listBugAttachments(bugId) {
    const normalizedBugId = toPositiveInt(bugId)
    if (!normalizedBugId) return []
    const [rows] = await pool.query(
      `SELECT
         a.id,
         a.bug_id,
         a.file_name,
         a.file_ext,
         a.file_size,
         a.mime_type,
         a.storage_provider,
         a.bucket_name,
         a.object_key,
         a.object_url,
         a.uploaded_by,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS uploaded_by_name,
         DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM bug_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.bug_id = ?
       ORDER BY a.id DESC`,
      [normalizedBugId],
    )
    return rows || []
  },

  async findCommentLogById(commentLogId, { bugId = null } = {}) {
    const normalizedCommentLogId = toPositiveInt(commentLogId)
    const normalizedBugId = toPositiveInt(bugId)
    if (!normalizedCommentLogId) return null
    const params = [normalizedCommentLogId]
    const bugCondition = normalizedBugId ? ' AND l.bug_id = ?' : ''
    if (normalizedBugId) params.push(normalizedBugId)
    const [rows] = await pool.query(
      `SELECT
         l.id,
         l.bug_id,
         l.from_status_code,
         l.to_status_code,
         l.operator_id,
         l.parent_comment_id,
         l.remark,
         DATE_FORMAT(l.edited_at, '%Y-%m-%d %H:%i:%s') AS edited_at,
         DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM bug_status_logs l
       WHERE l.id = ?${bugCondition}
       LIMIT 1`,
      params,
    )
    return rows[0] || null
  },

  async listBugCommentAttachmentsByCommentIds(commentLogIds = []) {
    const normalizedCommentLogIds = normalizePositiveIntList(commentLogIds)
    if (normalizedCommentLogIds.length === 0) return []
    const [rows] = await pool.query(
      `SELECT
         a.id,
         a.bug_id,
         a.comment_log_id,
         a.file_name,
         a.file_ext,
         a.file_size,
         a.mime_type,
         a.storage_provider,
         a.bucket_name,
         a.object_key,
         a.object_url,
         a.uploaded_by,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS uploaded_by_name,
         DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM bug_comment_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.comment_log_id IN (?)
       ORDER BY a.id ASC`,
      [normalizedCommentLogIds],
    )
    return rows || []
  },

  async getBugDetail(bugId) {
    const bug = await this.findBugById(bugId)
    if (!bug) return null
    const [logs, attachments] = await Promise.all([
      this.listBugStatusLogs(bugId),
      this.listBugAttachments(bugId),
    ])
    const commentLogIds = (logs || []).map((item) => item.id)
    const commentAttachments = await this.listBugCommentAttachmentsByCommentIds(commentLogIds)
    const commentAttachmentMap = new Map()
    commentAttachments.forEach((item) => {
      const commentLogId = Number(item.comment_log_id || 0)
      if (!commentLogId) return
      const list = commentAttachmentMap.get(commentLogId) || []
      list.push(item)
      commentAttachmentMap.set(commentLogId, list)
    })
    return {
      ...bug,
      status_logs: (logs || []).map((item) => ({
        ...item,
        attachments: commentAttachmentMap.get(Number(item.id || 0)) || [],
      })),
      attachments,
    }
  },

  async createBug({
    title,
    description,
    severityCode,
    priorityCode,
    bugTypeCode = null,
    productCode = null,
    issueStage = null,
    reproduceSteps,
    expectedResult,
    actualResult,
    environmentInfo = null,
    demandId = null,
    reporterId,
    assigneeId,
    assigneeIds = [],
    watcherIds = [],
  }) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const normalizedPrimaryAssigneeId = toPositiveInt(assigneeId) || null
      const normalizedAssigneeIds = normalizePositiveIntList(assigneeIds)
      if (normalizedPrimaryAssigneeId && !normalizedAssigneeIds.includes(normalizedPrimaryAssigneeId)) {
        normalizedAssigneeIds.unshift(normalizedPrimaryAssigneeId)
      }
      const finalAssigneeIds = normalizedAssigneeIds.length > 0 ? normalizedAssigneeIds : [normalizedPrimaryAssigneeId]
      if (!toPositiveInt(finalAssigneeIds[0])) {
        throw new Error('处理人不能为空')
      }

      const [result] = await conn.query(
        `INSERT INTO bugs (
           title,
           description,
           severity_code,
           priority_code,
           bug_type_code,
           status_code,
           product_code,
           issue_stage,
           reproduce_steps,
           expected_result,
           actual_result,
           environment_info,
           demand_id,
           reporter_id,
           assignee_id
         ) VALUES (?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalizeText(title, 200),
          normalizeText(description, 20000),
          normalizeCode(severityCode),
          normalizeCode(priorityCode) || DEFAULT_PRIORITY_CODE,
          normalizeCode(bugTypeCode),
          normalizeCode(productCode),
          normalizeCode(issueStage),
          normalizeText(reproduceSteps, 20000),
          normalizeText(expectedResult, 20000),
          normalizeText(actualResult, 20000),
          normalizeNullableText(environmentInfo, 20000),
          normalizeDemandId(demandId),
          toPositiveInt(reporterId),
          toPositiveInt(finalAssigneeIds[0]),
        ],
      )

      const bugId = Number(result.insertId)
      const bugNo = normalizeBugNo(bugId)
      await conn.query('UPDATE bugs SET bug_no = ? WHERE id = ?', [bugNo, bugId])
      await this.syncBugAssignees(conn, bugId, finalAssigneeIds)
      await this.syncBugWatchers(conn, bugId, watcherIds)

      await conn.query(
        `INSERT INTO bug_status_logs (
           bug_id,
           from_status_code,
           to_status_code,
           operator_id,
           remark
         ) VALUES (?, NULL, 'NEW', ?, ?)`,
        [bugId, toPositiveInt(reporterId), '创建Bug'],
      )

      await conn.commit()
      return bugId
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async updateBug(
    bugId,
    {
      title,
      description,
      severityCode,
      priorityCode,
      bugTypeCode = null,
      productCode = null,
      issueStage = null,
      reproduceSteps,
      expectedResult,
      actualResult,
      environmentInfo = null,
      demandId = null,
      assigneeId,
      assigneeIds = [],
      watcherIds = [],
      fixSolution,
    },
  ) {
    const normalizedBugId = toPositiveInt(bugId)
    if (!normalizedBugId) return 0
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const normalizedPrimaryAssigneeId = toPositiveInt(assigneeId) || null
      const normalizedAssigneeIds = normalizePositiveIntList(assigneeIds)
      if (normalizedPrimaryAssigneeId && !normalizedAssigneeIds.includes(normalizedPrimaryAssigneeId)) {
        normalizedAssigneeIds.unshift(normalizedPrimaryAssigneeId)
      }
      const finalAssigneeIds = normalizedAssigneeIds.length > 0 ? normalizedAssigneeIds : [normalizedPrimaryAssigneeId]
      if (!toPositiveInt(finalAssigneeIds[0])) {
        throw new Error('处理人不能为空')
      }

      const [result] = await conn.query(
        `UPDATE bugs
         SET
           title = ?,
           description = ?,
           severity_code = ?,
           priority_code = COALESCE(?, priority_code),
           bug_type_code = ?,
           product_code = ?,
           issue_stage = ?,
           reproduce_steps = ?,
           expected_result = ?,
           actual_result = ?,
           environment_info = ?,
           demand_id = ?,
           assignee_id = ?,
           fix_solution = ?,
           updated_at = NOW()
         WHERE id = ?
           AND deleted_at IS NULL`,
        [
          normalizeText(title, 200),
          normalizeText(description, 20000),
          normalizeCode(severityCode),
          normalizeCode(priorityCode),
          normalizeCode(bugTypeCode),
          normalizeCode(productCode),
          normalizeCode(issueStage),
          normalizeText(reproduceSteps, 20000),
          normalizeText(expectedResult, 20000),
          normalizeText(actualResult, 20000),
          normalizeNullableText(environmentInfo, 20000),
          normalizeDemandId(demandId),
          toPositiveInt(finalAssigneeIds[0]),
          normalizeNullableText(fixSolution, 20000),
          normalizedBugId,
        ],
      )

      const affectedRows = Number(result.affectedRows || 0)
      if (affectedRows <= 0) {
        await conn.rollback()
        return 0
      }

      await this.syncBugAssignees(conn, normalizedBugId, finalAssigneeIds)
      await this.syncBugWatchers(conn, normalizedBugId, watcherIds)
      await conn.commit()
      return affectedRows
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async deleteBug(bugId) {
    const normalizedBugId = toPositiveInt(bugId)
    if (!normalizedBugId) return 0
    const [result] = await pool.query(
      `UPDATE bugs
       SET deleted_at = NOW()
       WHERE id = ?
         AND deleted_at IS NULL`,
      [normalizedBugId],
    )
    return Number(result.affectedRows || 0)
  },

  async transitionBug(bugId, { toStatusCode, operatorId, remark = null, fixSolution } = {}) {
    const normalizedBugId = toPositiveInt(bugId)
    const normalizedOperatorId = toPositiveInt(operatorId)
    const normalizedToStatus = normalizeCode(toStatusCode)
    if (!normalizedBugId || !normalizedOperatorId || !normalizedToStatus) return { ok: false, reason: 'invalid_input' }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [rows] = await conn.query(
        `SELECT id, status_code, fix_solution
         FROM bugs
         WHERE id = ?
           AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [normalizedBugId],
      )
      const existing = rows[0] || null
      if (!existing) {
        await conn.rollback()
        return { ok: false, reason: 'not_found' }
      }

      const fromStatus = normalizeCode(existing.status_code)
      const configuredTransitions = await this.getWorkflowTransitionsForStatus(fromStatus, {
        includeDisabled: false,
      })
      const allowedTargets = configuredTransitions.length > 0
        ? configuredTransitions.map((item) => item.to_status_code)
        : ALLOWED_TRANSITIONS[fromStatus] || []
      if (!allowedTargets.includes(normalizedToStatus)) {
        await conn.rollback()
        return { ok: false, reason: 'transition_not_allowed', fromStatus, toStatus: normalizedToStatus }
      }

      const patchFields = ['status_code = ?', 'updated_at = NOW()']
      const patchParams = [normalizedToStatus]

      if (normalizedToStatus === 'FIXED') {
        patchFields.push('fix_solution = ?')
        patchParams.push(normalizeNullableText(fixSolution, 20000))
      }
      if (normalizedToStatus === 'CLOSED') {
        patchFields.push('closed_at = NOW()')
      } else if (normalizedToStatus !== 'CLOSED') {
        patchFields.push('closed_at = NULL')
      }

      patchParams.push(normalizedBugId)
      await conn.query(
        `UPDATE bugs
         SET ${patchFields.join(', ')}
         WHERE id = ?`,
        patchParams,
      )

      await conn.query(
        `INSERT INTO bug_status_logs (
           bug_id,
           from_status_code,
           to_status_code,
           operator_id,
           remark
         ) VALUES (?, ?, ?, ?, ?)`,
        [normalizedBugId, fromStatus, normalizedToStatus, normalizedOperatorId, normalizeNullableText(remark, 20000)],
      )

      await conn.commit()
      return { ok: true }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async addBugCommentLog(bugId, { operatorId, comment, statusCode = null, parentCommentId = null } = {}) {
    const normalizedBugId = toPositiveInt(bugId)
    const normalizedOperatorId = toPositiveInt(operatorId)
    const normalizedComment = normalizeNullableText(comment, 20000)
    const preferredStatus = normalizeCode(statusCode)
    const normalizedParentCommentId = toPositiveInt(parentCommentId)
    if (!normalizedBugId || !normalizedOperatorId || !normalizedComment) {
      return { ok: false, reason: 'invalid_input' }
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [rows] = await conn.query(
        `SELECT status_code
         FROM bugs
         WHERE id = ?
           AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [normalizedBugId],
      )
      const bug = rows[0] || null
      if (!bug) {
        await conn.rollback()
        return { ok: false, reason: 'not_found' }
      }
      const currentStatus = normalizeCode(bug.status_code) || preferredStatus
      if (!currentStatus) {
        await conn.rollback()
        return { ok: false, reason: 'status_invalid' }
      }

      const [result] = await conn.query(
        `INSERT INTO bug_status_logs (
           bug_id,
           from_status_code,
           to_status_code,
           operator_id,
           remark,
           parent_comment_id
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [normalizedBugId, currentStatus, currentStatus, normalizedOperatorId, normalizedComment, normalizedParentCommentId],
      )

      await conn.commit()
      return { ok: true, statusCode: currentStatus, commentLogId: Number(result.insertId || 0) || null }
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  },

  async getDemandBugStats(demandId) {
    const normalizedDemandId = normalizeDemandId(demandId)
    if (!normalizedDemandId) return []
    const [rows] = await pool.query(
      `SELECT
         b.status_code,
         COUNT(*) AS total
       FROM bugs b
       WHERE b.demand_id = ?
         AND b.deleted_at IS NULL
       GROUP BY b.status_code`,
      [normalizedDemandId],
    )
    const countMap = new Map((rows || []).map((row) => [normalizeCode(row.status_code), Number(row.total || 0)]))
    const [dictRows] = await pool.query(
      `SELECT item_code, item_name, color, sort_order
       FROM config_dict_items
       WHERE type_key = ?
         AND enabled = 1
       ORDER BY sort_order ASC, id ASC`,
      [BUG_STATUS_DICT_KEY],
    )
    return (dictRows || []).map((row) => ({
      status_code: normalizeCode(row.item_code),
      status_name: row.item_name || row.item_code,
      color: row.color || null,
      total: countMap.get(normalizeCode(row.item_code)) || 0,
    }))
  },

  async createAttachment(bugId, {
    fileName,
    fileExt = null,
    fileSize = null,
    mimeType = null,
    storageProvider = 'ALIYUN_OSS',
    bucketName = null,
    objectKey,
    objectUrl = null,
    uploadedBy,
  }) {
    const normalizedBugId = toPositiveInt(bugId)
    const normalizedUploadedBy = toPositiveInt(uploadedBy)
    if (!normalizedBugId || !normalizedUploadedBy) return null
    const [result] = await pool.query(
      `INSERT INTO bug_attachments (
         bug_id,
         file_name,
         file_ext,
         file_size,
         mime_type,
         storage_provider,
         bucket_name,
         object_key,
         object_url,
         uploaded_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedBugId,
        normalizeText(fileName, 255),
        normalizeNullableText(fileExt, 50),
        fileSize === null || fileSize === undefined ? null : Number(fileSize),
        normalizeNullableText(mimeType, 100),
        normalizeText(storageProvider, 50) || 'ALIYUN_OSS',
        normalizeNullableText(bucketName, 100),
        normalizeText(objectKey, 500),
        normalizeNullableText(objectUrl, 1000),
        normalizedUploadedBy,
      ],
    )
    return Number(result.insertId)
  },

  async updateCommentLog(commentLogId, { bugId = null, comment } = {}) {
    const normalizedCommentLogId = toPositiveInt(commentLogId)
    const normalizedBugId = toPositiveInt(bugId)
    const normalizedComment = normalizeNullableText(comment, 20000)
    if (!normalizedCommentLogId || !normalizedComment) return 0
    const params = [normalizedComment, normalizedCommentLogId]
    const bugCondition = normalizedBugId ? ' AND bug_id = ?' : ''
    if (normalizedBugId) params.push(normalizedBugId)
    const [result] = await pool.query(
      `UPDATE bug_status_logs
       SET remark = ?,
           edited_at = NOW()
       WHERE id = ?${bugCondition}`,
      params,
    )
    return Number(result.affectedRows || 0)
  },

  async createCommentAttachment(bugId, {
    commentLogId,
    fileName,
    fileExt = null,
    fileSize = null,
    mimeType = null,
    storageProvider = 'ALIYUN_OSS',
    bucketName = null,
    objectKey,
    objectUrl = null,
    uploadedBy,
  }) {
    const normalizedBugId = toPositiveInt(bugId)
    const normalizedCommentLogId = toPositiveInt(commentLogId)
    const normalizedUploadedBy = toPositiveInt(uploadedBy)
    if (!normalizedBugId || !normalizedCommentLogId || !normalizedUploadedBy) return null
    const [result] = await pool.query(
      `INSERT INTO bug_comment_attachments (
         bug_id,
         comment_log_id,
         file_name,
         file_ext,
         file_size,
         mime_type,
         storage_provider,
         bucket_name,
         object_key,
         object_url,
         uploaded_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedBugId,
        normalizedCommentLogId,
        normalizeText(fileName, 255),
        normalizeNullableText(fileExt, 50),
        fileSize === null || fileSize === undefined ? null : Number(fileSize),
        normalizeNullableText(mimeType, 100),
        normalizeText(storageProvider, 50) || 'ALIYUN_OSS',
        normalizeNullableText(bucketName, 100),
        normalizeText(objectKey, 500),
        normalizeNullableText(objectUrl, 1000),
        normalizedUploadedBy,
      ],
    )
    return Number(result.insertId)
  },

  async deleteAttachment(attachmentId, { bugId = null } = {}) {
    const normalizedAttachmentId = toPositiveInt(attachmentId)
    const normalizedBugId = toPositiveInt(bugId)
    if (!normalizedAttachmentId) return 0
    const params = [normalizedAttachmentId]
    const bugCondition = normalizedBugId ? ' AND bug_id = ?' : ''
    if (normalizedBugId) params.push(normalizedBugId)
    const [result] = await pool.query(
      `DELETE FROM bug_attachments
       WHERE id = ?${bugCondition}`,
      params,
    )
    return Number(result.affectedRows || 0)
  },

  async deleteCommentAttachment(attachmentId, { bugId = null, commentLogId = null } = {}) {
    const normalizedAttachmentId = toPositiveInt(attachmentId)
    const normalizedBugId = toPositiveInt(bugId)
    const normalizedCommentLogId = toPositiveInt(commentLogId)
    if (!normalizedAttachmentId) return 0
    const params = [normalizedAttachmentId]
    const conditions = []
    if (normalizedBugId) {
      conditions.push('bug_id = ?')
      params.push(normalizedBugId)
    }
    if (normalizedCommentLogId) {
      conditions.push('comment_log_id = ?')
      params.push(normalizedCommentLogId)
    }
    const extraWhere = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : ''
    const [result] = await pool.query(
      `DELETE FROM bug_comment_attachments
       WHERE id = ?${extraWhere}`,
      params,
    )
    return Number(result.affectedRows || 0)
  },

  async findAttachmentById(attachmentId) {
    const normalizedAttachmentId = toPositiveInt(attachmentId)
    if (!normalizedAttachmentId) return null
    const [rows] = await pool.query(
      `SELECT
         a.id,
         a.bug_id,
         a.file_name,
         a.file_ext,
         a.file_size,
         a.mime_type,
         a.storage_provider,
         a.bucket_name,
         a.object_key,
         a.object_url,
         a.uploaded_by,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS uploaded_by_name,
         DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM bug_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.id = ?
       LIMIT 1`,
      [normalizedAttachmentId],
    )
    return rows[0] || null
  },

  async findAttachmentByObjectKey(bugId, objectKey) {
    const normalizedBugId = toPositiveInt(bugId)
    const normalizedObjectKey = normalizeText(objectKey, 500)
    if (!normalizedBugId || !normalizedObjectKey) return null
    const [rows] = await pool.query(
      `SELECT
         a.id,
         a.bug_id,
         a.file_name,
         a.file_ext,
         a.file_size,
         a.mime_type,
         a.storage_provider,
         a.bucket_name,
         a.object_key,
         a.object_url,
         a.uploaded_by,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS uploaded_by_name,
         DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM bug_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.bug_id = ?
         AND a.object_key = ?
       ORDER BY a.id DESC
       LIMIT 1`,
      [normalizedBugId, normalizedObjectKey],
    )
    return rows[0] || null
  },

  async findCommentAttachmentById(attachmentId) {
    const normalizedAttachmentId = toPositiveInt(attachmentId)
    if (!normalizedAttachmentId) return null
    const [rows] = await pool.query(
      `SELECT
         a.id,
         a.bug_id,
         a.comment_log_id,
         a.file_name,
         a.file_ext,
         a.file_size,
         a.mime_type,
         a.storage_provider,
         a.bucket_name,
         a.object_key,
         a.object_url,
         a.uploaded_by,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS uploaded_by_name,
         DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM bug_comment_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.id = ?
       LIMIT 1`,
      [normalizedAttachmentId],
    )
    return rows[0] || null
  },

  async findCommentAttachmentByObjectKey(bugId, commentLogId, objectKey) {
    const normalizedBugId = toPositiveInt(bugId)
    const normalizedCommentLogId = toPositiveInt(commentLogId)
    const normalizedObjectKey = normalizeText(objectKey, 500)
    if (!normalizedBugId || !normalizedCommentLogId || !normalizedObjectKey) return null
    const [rows] = await pool.query(
      `SELECT
         a.id,
         a.bug_id,
         a.comment_log_id,
         a.file_name,
         a.file_ext,
         a.file_size,
         a.mime_type,
         a.storage_provider,
         a.bucket_name,
         a.object_key,
         a.object_url,
         a.uploaded_by,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS uploaded_by_name,
         DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM bug_comment_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.bug_id = ?
         AND a.comment_log_id = ?
         AND a.object_key = ?
       ORDER BY a.id DESC
       LIMIT 1`,
      [normalizedBugId, normalizedCommentLogId, normalizedObjectKey],
    )
    return rows[0] || null
  },
}

module.exports = Bug
