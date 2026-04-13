const pool = require('../utils/db')

const BUG_STATUS_DICT_KEY = 'bug_status'
const BUG_SEVERITY_DICT_KEY = 'bug_severity'
const BUG_PRIORITY_DICT_KEY = 'bug_priority'
const BUG_TYPE_DICT_KEY = 'bug_type'
const BUG_PRODUCT_DICT_KEY = 'bug_product'
const BUG_STAGE_DICT_KEY = 'bug_stage'
const DEFAULT_PRIORITY_CODE = 'MEDIUM'

const ALLOWED_TRANSITIONS = Object.freeze({
  NEW: ['PROCESSING'],
  PROCESSING: ['FIXED', 'REOPENED'],
  FIXED: ['CLOSED', 'REOPENED'],
  REOPENED: ['PROCESSING'],
  CLOSED: [],
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
         COALESCE(NULLIF(u.real_name, ''), u.username) AS operator_name,
         l.remark,
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

  async getBugDetail(bugId) {
    const bug = await this.findBugById(bugId)
    if (!bug) return null
    const [logs, attachments] = await Promise.all([
      this.listBugStatusLogs(bugId),
      this.listBugAttachments(bugId),
    ])
    return {
      ...bug,
      status_logs: logs,
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
      verifyResult,
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
           verify_result = ?,
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
          normalizeNullableText(verifyResult, 20000),
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

  async transitionBug(bugId, { toStatusCode, operatorId, remark = null, fixSolution, verifyResult } = {}) {
    const normalizedBugId = toPositiveInt(bugId)
    const normalizedOperatorId = toPositiveInt(operatorId)
    const normalizedToStatus = normalizeCode(toStatusCode)
    if (!normalizedBugId || !normalizedOperatorId || !normalizedToStatus) return { ok: false, reason: 'invalid_input' }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [rows] = await conn.query(
        `SELECT id, status_code, fix_solution, verify_result
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
      const allowedTargets = ALLOWED_TRANSITIONS[fromStatus] || []
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
        patchFields.push('verify_result = ?')
        patchParams.push(normalizeNullableText(verifyResult, 20000))
        patchFields.push('closed_at = NOW()')
      } else if (normalizedToStatus !== 'CLOSED') {
        patchFields.push('closed_at = NULL')
      }
      if (normalizedToStatus === 'REOPENED' && verifyResult !== undefined) {
        patchFields.push('verify_result = ?')
        patchParams.push(normalizeNullableText(verifyResult, 20000))
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

  async findAttachmentById(attachmentId) {
    const normalizedAttachmentId = toPositiveInt(attachmentId)
    if (!normalizedAttachmentId) return null
    const [rows] = await pool.query(
      `SELECT
         id,
         bug_id,
         file_name,
         file_ext,
         file_size,
         mime_type,
         storage_provider,
         bucket_name,
         object_key,
         object_url,
         uploaded_by,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM bug_attachments
       WHERE id = ?
       LIMIT 1`,
      [normalizedAttachmentId],
    )
    return rows[0] || null
  },
}

module.exports = Bug
