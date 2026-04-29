const pool = require('../utils/db')
const { sendNotification } = require('../utils/notificationSender')
const DEFAULT_NOTIFICATION_PUBLIC_BASE_URL = 'http://39.97.253.194'

function normalizeText(value, maxLength = 255) {
  if (value === undefined || value === null) return ''
  return String(value).trim().slice(0, maxLength)
}

function safeJsonParse(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function toJsonString(value, fallback = null) {
  if (value === undefined || value === null) return JSON.stringify(fallback)
  if (typeof value === 'string') {
    try {
      JSON.parse(value)
      return value
    } catch {
      return JSON.stringify(fallback)
    }
  }

  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify(fallback)
  }
}

function toNullableInt(value) {
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  if (!Number.isInteger(num)) return null
  return num
}

function toNullableIntList(value) {
  if (value === undefined || value === null || value === '') return []
  const source = Array.isArray(value) ? value : [value]
  return Array.from(
    new Set(
      source
        .map((item) => toNullableInt(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  )
}

function parseJsonArray(value, fallback = []) {
  const parsed = safeJsonParse(value, fallback)
  return Array.isArray(parsed) ? parsed : fallback
}

function normalizeDemandId(value) {
  const text = normalizeText(value, 64).toUpperCase()
  return text || ''
}

function isLocalHost(hostname = '') {
  const normalized = String(hostname || '').trim().toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0'
}

function normalizePublicBaseUrl(value) {
  const text = normalizeText(value, 1000)
  if (!text) return ''
  try {
    const parsed = new URL(text)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    if (isLocalHost(parsed.hostname)) return ''
    parsed.pathname = parsed.pathname.replace(/\/+$/g, '')
    return parsed.toString().replace(/\/+$/g, '')
  } catch {
    return ''
  }
}

function normalizePortalBaseUrl() {
  const explicitPublic = normalizePublicBaseUrl(process.env.NOTIFICATION_PORTAL_PUBLIC_BASE_URL)
  if (explicitPublic) return explicitPublic

  const configuredBaseUrl = normalizePublicBaseUrl(process.env.NOTIFICATION_PORTAL_BASE_URL)
  if (configuredBaseUrl) return configuredBaseUrl

  const fallbackOrigin = normalizeText(process.env.CLIENT_ORIGIN, 1000)
  const firstNonLocalOrigin = fallbackOrigin
    .split(',')
    .map((item) => String(item || '').trim())
    .map((item) => normalizePublicBaseUrl(item))
    .find(Boolean)
  if (firstNonLocalOrigin) return firstNonLocalOrigin

  return DEFAULT_NOTIFICATION_PUBLIC_BASE_URL
}

function buildPortalUrl(pathname = '', query = {}) {
  const baseUrl = normalizePortalBaseUrl()
  if (!baseUrl) return ''
  const path = String(pathname || '').trim()
  if (!path.startsWith('/')) return ''
  const queryEntries = Object.entries(query || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
  if (queryEntries.length === 0) return `${baseUrl}${path}`
  const search = new URLSearchParams(queryEntries.map(([key, value]) => [key, String(value)])).toString()
  return search ? `${baseUrl}${path}?${search}` : `${baseUrl}${path}`
}

function buildDemandDetailUrlFromEventData(eventData = {}) {
  const demandId = normalizeDemandId(eventData?.demand_id)
  if (!demandId) return ''
  return buildPortalUrl(`/work-demands/${encodeURIComponent(demandId)}`)
}

function buildWorklogPageUrlFromEventData(eventData = {}) {
  const query = {}
  const demandId = normalizeDemandId(eventData?.demand_id)
  const worklogId = toNullableInt(eventData?.worklog_id || eventData?.log_id)
  const taskId = toNullableInt(eventData?.task_id)
  if (demandId) query.demand_id = demandId
  if (worklogId) query.worklog_id = worklogId
  if (taskId) query.task_id = taskId
  return buildPortalUrl('/work-logs', query)
}

function buildDemandScorePageUrlFromEventData(eventData = {}) {
  const demandId = normalizeDemandId(eventData?.demand_id)
  if (!demandId) return ''
  return buildPortalUrl('/demand-scores', {
    demand_id: demandId,
    status: 'PENDING',
  })
}

function buildActionMetaByEventType(eventType, eventData = {}) {
  const normalizedEventType = normalizeText(eventType, 64).toLowerCase()

  const goFillReportEvents = new Set([
    'worklog_create',
    'worklog_assign',
    'worklog_deadline_remind',
    'task_assign',
    'task_deadline',
    'daily_report_notify',
    'demand_score_assign',
  ])

  const viewDemandDetailEvents = new Set([
    'worklog_status_change',
    'task_complete',
    'node_assign',
    'node_reject',
    'node_complete',
  ])

  if (goFillReportEvents.has(normalizedEventType)) {
    const url =
      normalizedEventType === 'demand_score_assign'
        ? buildDemandScorePageUrlFromEventData(eventData)
        : buildWorklogPageUrlFromEventData(eventData)
    const detailActionText = normalizedEventType === 'demand_score_assign' ? '去评分' : '去填报'
    return url ? { detail_url: url, detail_action_text: detailActionText } : null
  }

  if (viewDemandDetailEvents.has(normalizedEventType)) {
    const url = buildDemandDetailUrlFromEventData(eventData)
    return url ? { detail_url: url, detail_action_text: '查看详情' } : null
  }

  return null
}

const BUSINESS_ROLE_RECEIVER_KEYS = new Set([
  'demand_owner',
  'node_owner',
  'node_assignee',
  'bug_assignee',
  'bug_reporter',
  'bug_watcher',
  'daily_report_team_all',
  'daily_report_scheduled',
  'daily_report_filled',
  'daily_report_unfilled',
  'daily_report_unscheduled',
])

function getValueByPath(obj, path) {
  if (!path) return undefined
  const segments = String(path)
    .split('.')
    .map((item) => item.trim())
    .filter(Boolean)

  let current = obj
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = current[segment]
  }

  return current
}

function compareValues(leftValue, operator, rightValue) {
  const op = String(operator || 'eq').toLowerCase()

  if (op === 'is_empty') return leftValue === undefined || leftValue === null || leftValue === ''
  if (op === 'is_not_empty') return leftValue !== undefined && leftValue !== null && leftValue !== ''
  if (op === 'exists') return leftValue !== undefined && leftValue !== null && leftValue !== ''
  if (op === 'not_exists') return leftValue === undefined || leftValue === null || leftValue === ''

  if (op === 'contains') {
    if (Array.isArray(leftValue)) return leftValue.includes(rightValue)
    return String(leftValue || '').includes(String(rightValue || ''))
  }

  if (op === 'in') return Array.isArray(rightValue) && rightValue.includes(leftValue)
  if (op === 'nin') return !Array.isArray(rightValue) || !rightValue.includes(leftValue)

  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    const leftNum = Number(leftValue)
    const rightNum = Number(rightValue)
    if (!Number.isFinite(leftNum) || !Number.isFinite(rightNum)) return false
    if (op === 'gt') return leftNum > rightNum
    if (op === 'gte') return leftNum >= rightNum
    if (op === 'lt') return leftNum < rightNum
    return leftNum <= rightNum
  }

  if (op === 'ne') return leftValue !== rightValue
  return leftValue === rightValue
}

function evaluateConditionNode(node, eventData) {
  if (!node || typeof node !== 'object') return true

  const logic = String(node.logic || 'and').toLowerCase()
  const items = Array.isArray(node.items) ? node.items : []

  if (items.length === 0) {
    const leftValue = getValueByPath(eventData, node.field)
    return compareValues(leftValue, node.operator, node.value)
  }

  if (logic === 'or') return items.some((item) => evaluateConditionNode(item, eventData))
  return items.every((item) => evaluateConditionNode(item, eventData))
}

function evaluateRuleCondition(conditionConfig, eventData) {
  if (!conditionConfig) return true
  if (typeof conditionConfig !== 'object' || Array.isArray(conditionConfig)) return true

  const mode = String(conditionConfig.trigger_mode || conditionConfig.mode || '').trim().toLowerCase()
  if (!mode) return evaluateConditionNode(conditionConfig, eventData)

  const fieldCondition =
    conditionConfig.field_condition && typeof conditionConfig.field_condition === 'object'
      ? conditionConfig.field_condition
      : null

  if (mode === 'event') {
    if (!fieldCondition) return true
    return evaluateConditionNode(fieldCondition, eventData)
  }

  if (mode === 'schedule') {
    if (!eventData?.__schedule_context?.matched) return false
    if (!fieldCondition) return true
    return evaluateConditionNode(fieldCondition, eventData)
  }

  if (mode === 'deadline') {
    if (!eventData?.__deadline_context?.matched) return false
    if (!fieldCondition) return true
    return evaluateConditionNode(fieldCondition, eventData)
  }

  return evaluateConditionNode(conditionConfig, eventData)
}

function renderTemplateText(template, data) {
  const source = String(template || '')
  const renderedByBraces = source.replace(/\$\{([a-zA-Z0-9_.]+)\}/g, (_full, keyPath) => {
    const rawValue = getValueByPath(data, keyPath)
    if (rawValue === undefined || rawValue === null) return ''

    const localizedValue = localizeTemplateValueByKeyPath(keyPath, rawValue)
    if (localizedValue === undefined || localizedValue === null) return ''
    if (typeof localizedValue === 'object') return JSON.stringify(localizedValue)
    return String(localizedValue)
  })

  // 兼容历史模板中遗留的 @field_key 写法（例如 @demand_id）。
  // 未匹配到字段时保留原文，避免误替换普通文本。
  return renderedByBraces.replace(/@([a-zA-Z0-9_.]+)/g, (full, keyPath) => {
    const rawValue = getValueByPath(data, keyPath)
    if (rawValue === undefined || rawValue === null) return full

    const localizedValue = localizeTemplateValueByKeyPath(keyPath, rawValue)
    if (localizedValue === undefined || localizedValue === null) return ''
    if (typeof localizedValue === 'object') return JSON.stringify(localizedValue)
    return String(localizedValue)
  })
}

const STATUS_CN_MAP = Object.freeze({
  TODO: '待处理',
  NOT_STARTED: '未开始',
  IN_PROGRESS: '进行中',
  DONE: '已完成',
  CANCELLED: '已取消',
  RETURNED: '已退回',
  REJECTED: '已驳回',
  TERMINATED: '已终止',
  NEW: '新建',
  OPEN: '待处理',
  PROCESSING: '处理中',
  FIXED: '已修复',
  CLOSED: '已关闭',
  REOPENED: '已重开',
  VERIFIED: '已验证',
  RESOLVED: '已解决',
  BLOCKED: '已阻塞',
  ACTIVE: '活跃',
  PENDING: '待定',
})

const SEVERITY_CN_MAP = Object.freeze({
  CRITICAL: '严重',
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
})

const PRIORITY_CN_MAP = Object.freeze({
  P0: '最高',
  P1: '高',
  P2: '中',
  P3: '低',
  P4: '最低',
  HIGHEST: '最高',
  HIGH: '高',
  MEDIUM: '中',
  LOW: '低',
  LOWEST: '最低',
})

const STATUS_TEMPLATE_KEYS = new Set([
  'status',
  'from_status',
  'to_status',
  'log_status',
  'node_status',
  'task_status',
  'workflow_status',
  'demand_status',
  'bug_status',
])

const SEVERITY_TEMPLATE_KEYS = new Set(['severity', 'severity_code'])
const PRIORITY_TEMPLATE_KEYS = new Set(['priority', 'priority_code'])

function normalizeEnumCode(value) {
  return normalizeText(value, 64).replace(/[\s-]+/g, '_').toUpperCase()
}

function localizeEnumValue(value, map) {
  if (typeof value !== 'string' && typeof value !== 'number') return value
  const text = String(value).trim()
  if (!text) return value

  const exact = map[text]
  if (exact) return exact

  const normalized = normalizeEnumCode(text)
  return map[normalized] || value
}

function localizeTemplateValueByKeyPath(keyPath, value) {
  const leafKey = normalizeText(String(keyPath || '').split('.').pop(), 64).toLowerCase()
  if (!leafKey) return value

  if (STATUS_TEMPLATE_KEYS.has(leafKey)) {
    return localizeEnumValue(value, STATUS_CN_MAP)
  }

  if (SEVERITY_TEMPLATE_KEYS.has(leafKey)) {
    return localizeEnumValue(value, SEVERITY_CN_MAP)
  }

  if (PRIORITY_TEMPLATE_KEYS.has(leafKey)) {
    return localizeEnumValue(value, PRIORITY_CN_MAP)
  }

  return value
}

function extractDailyReportMembers(eventData, groupKey) {
  if (!eventData || !groupKey) return []
  const normalizedKey = String(groupKey || '').trim().toLowerCase()
  const groups = eventData.member_groups
  if (groups && Array.isArray(groups[normalizedKey])) {
    return groups[normalizedKey]
  }

  if (normalizedKey === 'unfilled' || normalizedKey === 'unscheduled') {
    if (String(eventData.category_key || '').toLowerCase() === normalizedKey && Array.isArray(eventData.members)) {
      return eventData.members
    }
  }

  return []
}

function mapRuleRowLegacy(row) {
  const channels = parseJsonArray(row.channels_json, ['FEISHU'])
  const firstChannel = String(channels[0] || 'FEISHU').toLowerCase()
  return {
    id: Number(row.id),
    rule_code: row.rule_code,
    rule_name: row.rule_name,
    business_line_id: row.biz_line_id === null ? null : Number(row.biz_line_id),
    scene_code: row.event_type,
    channel_type: firstChannel,
    receiver_type: 'role',
    receiver_config_json: {},
    message_title: row.message_title || '',
    message_content: row.message_content || '',
    condition_config_json: safeJsonParse(row.trigger_condition_json, null),
    is_enabled: Number(row.enabled) === 1 ? 1 : 0,
    priority: 0,
  }
}

async function listCandidateRules(eventType, businessLineId, { ruleIds = [] } = {}) {
  const params = []
  let whereSql = 'WHERE enabled = 1'

  const normalizedRuleIds = Array.from(
    new Set(
      (ruleIds || [])
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  )

  if (normalizedRuleIds.length > 0) {
    const placeholders = normalizedRuleIds.map(() => '?').join(', ')
    whereSql += ` AND id IN (${placeholders})`
    params.push(...normalizedRuleIds)
  } else {
    whereSql += ' AND LOWER(event_type) = LOWER(?)'
    params.push(eventType)

    if (businessLineId !== null && businessLineId !== undefined) {
      whereSql += ' AND (biz_line_id = 0 OR biz_line_id = ?)'
      params.push(Number(businessLineId))
    }
  }


  const [rows] = await pool.query(
    `SELECT
       id,
       rule_code,
       rule_name,
       biz_line_id,
       event_type,
       template_id,
       message_title,
       message_content,
       channels_json,
       trigger_condition_json,
       enabled
     FROM notification_rules
     ${whereSql}
     ORDER BY id ASC`,
    params,
  )

  return rows.map(mapRuleRowLegacy)
}

function mapUserTarget(row) {
  const openId = normalizeText(row.feishu_open_id, 128)
  if (!openId) return null

  return {
    target_type: 'user',
    target_id: openId,
    target_name: normalizeText(row.real_name || row.username, 128) || null,
    extra: {
      user_id: Number(row.id),
    },
  }
}

async function getUsersByIds(userIds) {
  const ids = Array.from(new Set((userIds || []).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)))
  if (ids.length === 0) return []

  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await pool.query(
    `SELECT id, username, real_name, feishu_open_id
     FROM users
     WHERE id IN (${placeholders})`,
    ids,
  )
  return rows
}

async function getUsersByRoleIds(roleIds) {
  const ids = Array.from(new Set((roleIds || []).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)))
  if (ids.length === 0) return []

  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await pool.query(
    `SELECT DISTINCT u.id, u.username, u.real_name, u.feishu_open_id
     FROM user_roles ur
     INNER JOIN users u ON u.id = ur.user_id
     WHERE ur.role_id IN (${placeholders})`,
    ids,
  )
  return rows
}

async function getUsersByRoleKeys(roleKeys) {
  const keys = Array.from(
    new Set(
      (roleKeys || [])
        .map((item) => normalizeText(item, 64))
        .filter(Boolean),
    ),
  )
  if (keys.length === 0) return []

  const placeholders = keys.map(() => '?').join(', ')
  const [rows] = await pool.query(
    `SELECT DISTINCT u.id, u.username, u.real_name, u.feishu_open_id
     FROM user_roles ur
     INNER JOIN users u ON u.id = ur.user_id
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE r.role_key IN (${placeholders}) OR r.name IN (${placeholders})`,
    [...keys, ...keys],
  )
  return rows
}

async function getUsersByDepartmentIds(departmentIds) {
  const ids = Array.from(new Set((departmentIds || []).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)))
  if (ids.length === 0) return []

  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await pool.query(
    `SELECT id, username, real_name, feishu_open_id
     FROM users
     WHERE department_id IN (${placeholders})`,
    ids,
  )
  return rows
}

function collectChatTargets(chatIds) {
  return Array.from(new Set((chatIds || []).map((item) => normalizeText(item, 128)).filter(Boolean))).map((chatId) => ({
    target_type: 'chat',
    target_id: chatId,
    target_name: null,
    extra: null,
  }))
}

function dedupeTargets(targets) {
  const map = new Map()
  for (const target of targets) {
    if (!target || !target.target_type || !target.target_id) continue
    const key = `${target.target_type}:${target.target_id}`
    if (!map.has(key)) map.set(key, target)
  }
  return Array.from(map.values())
}

async function resolveUserOpenId(userId) {
  const normalizedUserId = toNullableInt(userId)
  if (!normalizedUserId || normalizedUserId <= 0) return ''

  try {
    const [rows] = await pool.query(
      `SELECT feishu_open_id
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [normalizedUserId],
    )
    return normalizeText(rows?.[0]?.feishu_open_id, 128)
  } catch {
    return ''
  }
}

function excludeOperatorSelfTargets(targets, operatorContext, { allowSelfTargets = false } = {}) {
  const inputTargets = Array.isArray(targets) ? targets : []
  if (allowSelfTargets) {
    return {
      targets: inputTargets,
      removed_count: 0,
    }
  }
  const operatorUserId = toNullableInt(operatorContext?.user_id)
  const operatorOpenId = normalizeText(operatorContext?.open_id, 128)

  if (!operatorUserId && !operatorOpenId) {
    return {
      targets: inputTargets,
      removed_count: 0,
    }
  }

  const keptTargets = []
  let removedCount = 0

  for (const target of inputTargets) {
    if (!target || target.target_type !== 'user') {
      keptTargets.push(target)
      continue
    }

    const targetUserId = toNullableInt(target?.extra?.user_id)
    const targetOpenId = normalizeText(target?.target_id, 128)
    const isOperatorSelfByUserId = operatorUserId && targetUserId && Number(targetUserId) === Number(operatorUserId)
    const isOperatorSelfByOpenId = operatorOpenId && targetOpenId && targetOpenId === operatorOpenId

    if (isOperatorSelfByUserId || isOperatorSelfByOpenId) {
      removedCount += 1
      continue
    }

    keptTargets.push(target)
  }

  return {
    targets: keptTargets,
    removed_count: removedCount,
  }
}

async function resolveDemandIdFromEventData(eventData) {
  const directDemandId = normalizeDemandId(eventData?.demand_id)
  if (directDemandId) return directDemandId

  const bugId = toNullableInt(eventData?.bug_id)
  if (!bugId) return ''

  try {
    const [rows] = await pool.query(
      `SELECT demand_id
       FROM bugs
       WHERE id = ?
       LIMIT 1`,
      [bugId],
    )
    return normalizeDemandId(rows?.[0]?.demand_id)
  } catch {
    return ''
  }
}

async function resolveDemandBoundChatTargets(eventData) {
  const demandId = await resolveDemandIdFromEventData(eventData)
  if (!demandId) return []

  try {
    const [rows] = await pool.query(
      `SELECT id, name, group_chat_mode, group_chat_id
       FROM work_demands
       WHERE id = ?
       LIMIT 1`,
      [demandId],
    )
    const row = rows?.[0] || null
    if (!row) return []
    const mode = normalizeText(row.group_chat_mode, 20).toLowerCase()
    const chatId = normalizeText(row.group_chat_id, 128)
    if ((mode !== 'bind' && mode !== 'auto') || !chatId) return []

    return [{
      target_type: 'chat',
      target_id: chatId,
      target_name: normalizeText(row.name, 128) || `需求群(${demandId})`,
      extra: {
        demand_id: demandId,
      },
    }]
  } catch {
    return []
  }
}

async function resolveDemandOwnerUserIdByDemandId(demandId) {
  const normalizedDemandId = normalizeDemandId(demandId)
  if (!normalizedDemandId) return null

  try {
    const [rows] = await pool.query(
      `SELECT owner_user_id
       FROM work_demands
       WHERE id = ?
       LIMIT 1`,
      [normalizedDemandId],
    )
    return toNullableInt(rows?.[0]?.owner_user_id)
  } catch {
    return null
  }
}

async function resolveBusinessRoleUserIds(roleKeys, eventData) {
  const keys = Array.from(
    new Set(
      (Array.isArray(roleKeys) ? roleKeys : [])
        .map((item) => normalizeText(item, 64).toLowerCase())
        .filter((item) => BUSINESS_ROLE_RECEIVER_KEYS.has(item)),
    ),
  )
  if (keys.length === 0) return []

  const userIds = []
  let demandOwnerUserIdResolved = false
  let demandOwnerUserId = null

  for (const key of keys) {
    if (key === 'demand_owner') {
      const directDemandOwner =
        toNullableInt(getValueByPath(eventData, 'to_owner_user_id')) ||
        toNullableInt(getValueByPath(eventData, 'owner_user_id')) ||
        toNullableInt(getValueByPath(eventData, 'demand_owner_user_id'))
      if (directDemandOwner) {
        userIds.push(directDemandOwner)
        continue
      }

      if (!demandOwnerUserIdResolved) {
        const demandId = await resolveDemandIdFromEventData(eventData)
        demandOwnerUserId = demandId ? await resolveDemandOwnerUserIdByDemandId(demandId) : null
        demandOwnerUserIdResolved = true
      }
      if (demandOwnerUserId) {
        userIds.push(demandOwnerUserId)
      }
      continue
    }

    if (key === 'node_owner' || key === 'node_assignee') {
      const dynamicAssigneeIds = [
        ...toNullableIntList(getValueByPath(eventData, 'assignee_ids')),
        ...toNullableIntList(getValueByPath(eventData, 'to_assignee_ids')),
      ]
      if (dynamicAssigneeIds.length > 0) {
        userIds.push(...dynamicAssigneeIds)
        continue
      }

      const nodeOwnerUserId =
        toNullableInt(getValueByPath(eventData, 'assignee_id')) ||
        toNullableInt(getValueByPath(eventData, 'to_assignee_id')) ||
        toNullableInt(getValueByPath(eventData, 'task_assignee_id'))
      if (nodeOwnerUserId) userIds.push(nodeOwnerUserId)
      continue
    }

    if (key === 'bug_assignee') {
      const bugAssigneeIds = [
        ...toNullableIntList(getValueByPath(eventData, 'to_assignee_ids')),
        ...toNullableIntList(getValueByPath(eventData, 'assignee_ids')),
      ]
      if (bugAssigneeIds.length > 0) {
        userIds.push(...bugAssigneeIds)
        continue
      }

      const bugAssigneeId =
        toNullableInt(getValueByPath(eventData, 'to_assignee_id')) ||
        toNullableInt(getValueByPath(eventData, 'assignee_id'))
      if (bugAssigneeId) userIds.push(bugAssigneeId)
      continue
    }

    if (key === 'bug_reporter') {
      const reporterId = toNullableInt(getValueByPath(eventData, 'reporter_id'))
      if (reporterId) userIds.push(reporterId)
      continue
    }

    if (key === 'bug_watcher') {
      const watcherIds = [
        ...toNullableIntList(getValueByPath(eventData, 'watcher_ids')),
        ...toNullableIntList(getValueByPath(eventData, 'to_watcher_ids')),
      ]
      if (watcherIds.length > 0) {
        userIds.push(...watcherIds)
        continue
      }

      const watcherId =
        toNullableInt(getValueByPath(eventData, 'watcher_id')) ||
        toNullableInt(getValueByPath(eventData, 'to_watcher_id'))
      if (watcherId) userIds.push(watcherId)
      continue
    }

    if (key.startsWith('daily_report_')) {
      const dailyKey = key.replace('daily_report_', '')
      const dailyMembers = extractDailyReportMembers(eventData, dailyKey)
      dailyMembers.forEach((member) => {
        const memberUserId =
          toNullableInt(member?.user_id) ||
          toNullableInt(member?.userId) ||
          toNullableInt(member?.id)
        if (memberUserId) {
          userIds.push(memberUserId)
        }
      })
      continue
    }
  }

  return Array.from(new Set(userIds))
}

async function resolveTargetsFromRuleConfig(rule, eventData) {
  const config = rule.receiver_config_json && typeof rule.receiver_config_json === 'object' ? rule.receiver_config_json : {}

  const userIds = []
  const roleIds = []
  const roleKeys = []
  const deptIds = []
  const chatIds = []

  if (Array.isArray(config.user_ids)) userIds.push(...config.user_ids)
  if (Array.isArray(config.roles)) {
    config.roles.forEach((item) => {
      const numeric = toNullableInt(item)
      if (numeric) roleIds.push(numeric)
      else {
        const key = normalizeText(item, 64).toLowerCase()
        if (BUSINESS_ROLE_RECEIVER_KEYS.has(key)) roleKeys.push(key)
        else roleKeys.push(item)
      }
    })
  }
  if (Array.isArray(config.business_roles)) {
    config.business_roles.forEach((item) => {
      const key = normalizeText(item, 64).toLowerCase()
      if (BUSINESS_ROLE_RECEIVER_KEYS.has(key)) roleKeys.push(key)
    })
  }
  if (Array.isArray(config.role_ids)) roleIds.push(...config.role_ids)
  if (Array.isArray(config.department_ids)) deptIds.push(...config.department_ids)
  if (Array.isArray(config.chat_ids)) chatIds.push(...config.chat_ids)

  if (rule.receiver_type === 'user' && Array.isArray(config.users)) userIds.push(...config.users)
  if (rule.receiver_type === 'role' && Array.isArray(config.receivers)) {
    config.receivers.forEach((item) => {
      const numeric = toNullableInt(item)
      if (numeric) roleIds.push(numeric)
      else roleKeys.push(item)
    })
  }

  if (rule.receiver_type === 'field') {
    const path = normalizeText(config.user_id_field, 128)
    const dynamicValue = getValueByPath(eventData, path || 'operator_id')
    const dynamicUserIds = toNullableIntList(dynamicValue)
    if (dynamicUserIds.length > 0) userIds.push(...dynamicUserIds)
  }

  const businessRoleUserIds = await resolveBusinessRoleUserIds(roleKeys, eventData)
  if (businessRoleUserIds.length > 0) {
    userIds.push(...businessRoleUserIds)
  }
  const pureRoleKeys = roleKeys.filter((item) => !BUSINESS_ROLE_RECEIVER_KEYS.has(normalizeText(item, 64).toLowerCase()))

  if (rule.receiver_type === 'demand_group' || config.use_demand_bound_chat === true) {
    const demandChatTargets = await resolveDemandBoundChatTargets(eventData)
    chatIds.push(...demandChatTargets.map((item) => item.target_id))
  }

  const [usersById, usersByRole, usersByRoleKeys, usersByDept] = await Promise.all([
    getUsersByIds(userIds),
    getUsersByRoleIds(roleIds),
    getUsersByRoleKeys(pureRoleKeys),
    getUsersByDepartmentIds(deptIds),
  ])

  const targets = [
    ...usersById.map(mapUserTarget).filter(Boolean),
    ...usersByRole.map(mapUserTarget).filter(Boolean),
    ...usersByRoleKeys.map(mapUserTarget).filter(Boolean),
    ...usersByDept.map(mapUserTarget).filter(Boolean),
    ...collectChatTargets(chatIds),
  ]

  return dedupeTargets(targets)
}

async function resolveTargetsFromLegacyReceivers(ruleId, eventData) {
  const [receiverRows] = await pool.query(
    `SELECT id, rule_id, receiver_type, receiver_value, receiver_label
     FROM notification_rule_receivers
     WHERE rule_id = ? AND enabled = 1
     ORDER BY id ASC`,
    [ruleId],
  )

  const userIds = []
  const roleIds = []
  const roleKeys = []
  const deptIds = []
  const chatIds = []
  const directOpenIds = []
  let useDemandBoundChat = false

  for (const receiver of receiverRows) {
    const receiverType = normalizeText(receiver.receiver_type, 16).toUpperCase()
    const receiverValueRaw = normalizeText(receiver.receiver_value, 128)

    if (!receiverType || !receiverValueRaw) continue

    if (receiverType === 'USER') {
      const userId = toNullableInt(receiverValueRaw)
      if (userId) userIds.push(userId)
      continue
    }

    if (receiverType === 'ROLE') {
      const roleId = toNullableInt(receiverValueRaw)
      if (roleId) roleIds.push(roleId)
      else roleKeys.push(receiverValueRaw)
      continue
    }

    if (receiverType === 'DEPT') {
      const deptId = toNullableInt(receiverValueRaw)
      if (deptId) deptIds.push(deptId)
      continue
    }

    if (receiverType === 'DYNAMIC') {
      if (receiverValueRaw === '__demand_bound_chat__') {
        useDemandBoundChat = true
        continue
      }

      if (receiverValueRaw.startsWith('business_role:')) {
        const roleKey = receiverValueRaw.slice('business_role:'.length)
        const normalizedRoleKey = normalizeText(roleKey, 64).toLowerCase()
        if (normalizedRoleKey) roleKeys.push(normalizedRoleKey)
        continue
      }

      if (receiverValueRaw.startsWith('chat_id:')) {
        const chatId = receiverValueRaw.slice('chat_id:'.length)
        if (chatId) chatIds.push(chatId)
        continue
      }

      if (receiverValueRaw.startsWith('open_id:')) {
        const openId = receiverValueRaw.slice('open_id:'.length)
        if (openId) directOpenIds.push(openId)
        continue
      }

      const dynamicValue = getValueByPath(eventData, receiverValueRaw)
      const dynamicUserId = toNullableInt(dynamicValue)
      if (dynamicUserId) {
        userIds.push(dynamicUserId)
        continue
      }

      const dynamicText = normalizeText(dynamicValue, 128)
      if (dynamicText.startsWith('ou_')) {
        directOpenIds.push(dynamicText)
      } else if (dynamicText.startsWith('oc_')) {
        chatIds.push(dynamicText)
      }
    }
  }

  const businessRoleUserIds = await resolveBusinessRoleUserIds(roleKeys, eventData)
  if (businessRoleUserIds.length > 0) {
    userIds.push(...businessRoleUserIds)
  }
  const pureRoleKeys = roleKeys.filter((item) => !BUSINESS_ROLE_RECEIVER_KEYS.has(normalizeText(item, 64).toLowerCase()))

  const [usersById, usersByRole, usersByRoleKeys, usersByDept] = await Promise.all([
    getUsersByIds(userIds),
    getUsersByRoleIds(roleIds),
    getUsersByRoleKeys(pureRoleKeys),
    getUsersByDepartmentIds(deptIds),
  ])

  const directOpenIdTargets = Array.from(new Set(directOpenIds)).map((openId) => ({
    target_type: 'user',
    target_id: openId,
    target_name: null,
    extra: null,
  }))

  const demandBoundChatTargets = useDemandBoundChat ? await resolveDemandBoundChatTargets(eventData) : []

  const targets = [
    ...usersById.map(mapUserTarget).filter(Boolean),
    ...usersByRole.map(mapUserTarget).filter(Boolean),
    ...usersByRoleKeys.map(mapUserTarget).filter(Boolean),
    ...usersByDept.map(mapUserTarget).filter(Boolean),
    ...directOpenIdTargets,
    ...collectChatTargets(chatIds),
    ...demandBoundChatTargets,
  ]

  return dedupeTargets(targets)
}

async function resolveTargets(rule, eventData) {
  const legacyTargets = await resolveTargetsFromLegacyReceivers(rule.id, eventData)
  if (legacyTargets.length > 0) return legacyTargets

  const fallbackTargets = await resolveTargetsFromRuleConfig(rule, eventData)
  return dedupeTargets(fallbackTargets)
}

async function createNotificationLog(payload) {
  await pool.query(
    `INSERT INTO notification_logs (
       notification_id,
       receiver_id,
       channel,
       attempt_no,
       status,
       error_message,
       request_payload,
       response_payload
     ) VALUES (
       ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON)
     )`,
    [
      Number(payload.rule_id || 0),
      Number(payload.receiver_id || 0),
      String(payload.channel_type || 'FEISHU').toUpperCase() === 'IN_APP' ? 'IN_APP' : 'FEISHU',
      Number(payload.retry_times || 1),
      payload.status === 'success' ? 'SUCCESS' : payload.status === 'skipped' ? 'SKIPPED' : 'FAILED',
      payload.error_message ? normalizeText(payload.error_message, 1000) : null,
      toJsonString(payload.request_payload_json, {}),
      toJsonString(payload.response_payload_json, {}),
    ],
  )
}

const NotificationEvent = {
  async processEvent({ eventType, data = {}, operatorUserId = null, targetRuleIds = [] }) {
    const normalizedEventType = normalizeText(eventType, 64)
    const businessLineId = data?.business_line_id ?? null
    const normalizedOperatorUserId = toNullableInt(operatorUserId)
    const operatorOpenId = normalizedOperatorUserId ? await resolveUserOpenId(normalizedOperatorUserId) : ''
    const operatorContext = {
      user_id: normalizedOperatorUserId,
      open_id: operatorOpenId,
    }

    const candidateRules = await listCandidateRules(normalizedEventType, businessLineId, {
      ruleIds: targetRuleIds,
    })
    const passedRules = candidateRules.filter((rule) => evaluateRuleCondition(rule.condition_config_json, data))

    const results = []

    for (const rule of passedRules) {
      let status = 'success'
      let errorCode = null
      let errorMessage = null

      const renderedTitle = renderTemplateText(rule.message_title || rule.rule_name || '系统通知', data)
      const renderedContent = renderTemplateText(rule.message_content || `事件 ${normalizedEventType} 已触发`, data)
      const derivedActionMeta = buildActionMetaByEventType(normalizedEventType, data) || {}
      const metadataDetailUrl =
        normalizeText(data?.detail_url, 2000) ||
        normalizeText(derivedActionMeta?.detail_url, 2000) ||
        null
      const metadataDetailActionText =
        normalizeText(data?.detail_action_text, 20) ||
        normalizeText(derivedActionMeta?.detail_action_text, 20) ||
        '查看详情'
      let sendResponse = {
        message: 'pending',
        operator_user_id: operatorUserId,
      }

      if (!renderedContent) {
        status = 'failed'
        errorCode = 'RULE_MESSAGE_EMPTY'
        errorMessage = '规则未配置可发送文案'
      } else {
        const resolvedTargets = await resolveTargets(rule, data)
        const filteredTargetsResult = excludeOperatorSelfTargets(resolvedTargets, operatorContext, {
          allowSelfTargets: normalizedEventType.startsWith('bug_') || normalizedEventType === 'demand_score_assign',
        })
        const targets = filteredTargetsResult.targets
        const removedSelfCount = Number(filteredTargetsResult.removed_count || 0)

        if (targets.length === 0) {
          if (removedSelfCount > 0) {
            status = 'skipped'
            errorCode = 'ONLY_SELF_RECEIVER'
            errorMessage = '接收人仅包含触发者本人，已跳过发送'
          } else if (normalizedEventType === 'daily_report_notify') {
            status = 'skipped'
            errorCode = 'NO_RECEIVERS_FOR_CATEGORY'
            errorMessage = '当前提醒分类下无匹配接收人'
          } else {
            status = 'failed'
            errorCode = 'NO_RECEIVERS'
            errorMessage = '未找到可发送接收人（缺少用户 open_id 或接收配置）'
          }
          sendResponse = {
            target_count: 0,
            success_count: 0,
            failure_count: 0,
            removed_self_count: removedSelfCount,
            results: [],
          }
        } else {
          const sendResult = await sendNotification({
            channelType: rule.channel_type,
            title: renderedTitle,
            content: renderedContent,
            targets,
            metadata: {
              rule_id: rule.id,
              rule_code: rule.rule_code,
              event_type: normalizedEventType,
              detail_url: metadataDetailUrl,
              detail_action_text: metadataDetailActionText,
            },
          })

          sendResponse = sendResult.response || {}
          if (removedSelfCount > 0 && sendResponse && typeof sendResponse === 'object') {
            sendResponse.removed_self_count = removedSelfCount
          }

          if (sendResult.skipped) {
            status = 'skipped'
            errorCode = sendResult.error_code || 'SEND_SKIPPED_BY_MODE'
            errorMessage = sendResult.error_message || '发送被策略跳过'
          } else if (!sendResult.success) {
            status = 'failed'
            errorCode = sendResult.error_code || 'SEND_FAILED'
            errorMessage = sendResult.error_message || '发送失败'
          } else if (sendResult.partial_success) {
            status = 'partial_success'
            if (sendResult.partial_failed) {
              errorCode = 'PARTIAL_SUCCESS'
              errorMessage = '部分接收人发送失败'
            } else if (sendResult.partial_skipped) {
              errorCode = 'PARTIAL_SKIPPED'
              errorMessage = '部分接收人被发送策略跳过'
            } else {
              errorCode = 'PARTIAL_SUCCESS'
              errorMessage = '部分接收人未发送成功'
            }
          }
        }
      }

      const perTargetResults = Array.isArray(sendResponse?.results) ? sendResponse.results : []
      if (perTargetResults.length > 0) {
        for (const item of perTargetResults) {
          const logStatus = item.skipped ? 'skipped' : item.success ? 'success' : 'failed'
          const receiverNumericId = Number(item?.extra?.user_id || 0)
          await createNotificationLog({
            rule_id: rule.id,
            channel_type: rule.channel_type,
            receiver_id: receiverNumericId,
            request_payload_json: {
              event_type: normalizedEventType,
              data,
              target: {
                target_type: item.target_type,
                target_id: item.target_id,
                target_name: item.target_name || null,
              },
            },
            response_payload_json: item.response || {},
            status: logStatus,
            error_code: item.error_code || null,
            error_message: item.error_message || null,
            retry_times: 1,
          })
        }
      } else {
        await createNotificationLog({
          rule_id: rule.id,
          channel_type: rule.channel_type,
          receiver_id: 0,
          request_payload_json: {
            event_type: normalizedEventType,
            data,
            receiver: toJsonString(rule.receiver_config_json, {}),
          },
          response_payload_json: sendResponse || {},
          status: status === 'partial_success' ? 'failed' : status,
          error_code: errorCode,
          error_message: errorMessage,
          retry_times: 1,
        })
      }

      results.push({
        rule_id: rule.id,
        rule_code: rule.rule_code,
        template_id: null,
        status,
        error_code: errorCode,
        error_message: errorMessage,
        target_count: Number(sendResponse?.target_count || 0),
        success_count: Number(sendResponse?.success_count || 0),
      })
    }

    return {
      event_type: normalizedEventType,
      candidate_count: candidateRules.length,
      matched_count: passedRules.length,
      processed_count: results.length,
      results,
    }
  },
}

module.exports = NotificationEvent
