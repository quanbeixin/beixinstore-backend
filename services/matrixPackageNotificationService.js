const pool = require('../utils/db')
const ConfigDict = require('../models/ConfigDict')
const MatrixPackage = require('../models/MatrixPackage')
const NotificationEvent = require('../models/NotificationEvent')
const NotificationRule = require('../models/NotificationRule')

const DEFAULT_TIMEZONE = 'Asia/Shanghai'

const SCENE_DEFINITIONS = Object.freeze([
  {
    code: 'matrix_package_status_change',
    name: '矩阵包状态变更通知',
    description: '当矩阵包状态变更为选中的状态时，通知固定飞书群。',
    type: 'STATUS_CHANGE',
  },
  {
    code: 'matrix_package_upcoming_deadline',
    name: '矩阵包即将到期提醒',
    description: '按设定时间扫描，命中预计冷备完成时间即将到期的矩阵包时通知固定飞书群。',
    type: 'UPCOMING',
  },
  {
    code: 'matrix_package_overdue_deadline',
    name: '矩阵包逾期提醒',
    description: '按设定时间扫描，命中预计冷备完成时间已逾期且未完成的矩阵包时通知固定飞书群。',
    type: 'OVERDUE',
  },
  {
    code: 'matrix_package_side_info_deadline',
    name: '各侧信息截止前提醒',
    description: '按设定时间扫描，在统一截止时间前提醒未完成各侧信息 check 的对应负责人。',
    type: 'SIDE_DEADLINE',
  },
])

const SCENE_CODE_SET = new Set(SCENE_DEFINITIONS.map((item) => item.code))
const ACTIVE_PRODUCTION_STATUS_CODES = new Set(['PENDING_DEV', 'IN_DEVELOPMENT'])

function normalizeText(value, maxLength = 255) {
  if (value === undefined || value === null) return ''
  return String(value).trim().slice(0, maxLength)
}

function toPositiveInt(value, fallback = 0) {
  const num = Number.parseInt(value, 10)
  return Number.isFinite(num) && num > 0 ? num : fallback
}

function toNullableInt(value) {
  const num = Number.parseInt(value, 10)
  return Number.isFinite(num) && num > 0 ? num : null
}

function toBooleanInt(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback
  return value === true || value === 'true' || value === 1 || value === '1' ? 1 : 0
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

function normalizeCode(value) {
  return String(value || '').trim().toLowerCase()
}

function isValidRuleCode(value) {
  return /^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(String(value || ''))
}

function getSceneDefinition(sceneCode) {
  return SCENE_DEFINITIONS.find((item) => item.code === normalizeCode(sceneCode)) || null
}

function getSceneType(sceneCode) {
  return getSceneDefinition(sceneCode)?.type || ''
}

function normalizeStatusCodeArray(values) {
  if (!Array.isArray(values)) return []
  return Array.from(
    new Set(
      values
        .map((item) => String(item || '').trim().toUpperCase())
        .filter(Boolean),
    ),
  )
}

function normalizeTransitionItem(item) {
  if (!item || typeof item !== 'object') return null
  const fromStatus = String(item.from_status || '').trim().toUpperCase()
  const toStatus = String(item.to_status || '').trim().toUpperCase()
  if (!toStatus) return null
  return {
    from_status: fromStatus === '*' ? '*' : fromStatus,
    to_status: toStatus,
  }
}

function normalizeStatusTransitions(values) {
  if (!Array.isArray(values)) return []
  const deduped = new Map()
  values.forEach((item) => {
    const normalized = normalizeTransitionItem(item)
    if (!normalized) return
    deduped.set(`${normalized.from_status || '*'}->${normalized.to_status}`, normalized)
  })
  return Array.from(deduped.values())
}

function normalizeScheduleConfig(input = {}) {
  const hour = Math.min(23, Math.max(0, Number.parseInt(input.hour, 10) || 9))
  const minute = Math.min(59, Math.max(0, Number.parseInt(input.minute, 10) || 0))
  const timezone = normalizeText(input.timezone, 64) || DEFAULT_TIMEZONE
  return { hour, minute, timezone }
}

function normalizeReminderConfig(input = {}) {
  const unit = String(input.offset_unit || '').trim().toLowerCase() === 'day' ? 'day' : 'hour'
  const value = Math.max(1, Number.parseInt(input.offset_value, 10) || 24)
  return {
    offset_unit: unit,
    offset_value: value,
  }
}

function buildRuleCode(sceneCode) {
  const scene = String(sceneCode || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'matrix_package_rule'
  return `matrix_pkg_${scene}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`.slice(0, 64)
}

function buildDefaultTemplate(sceneCode) {
  const type = getSceneType(sceneCode)
  if (type === 'STATUS_CHANGE') {
    return {
      title: '矩阵包状态变更通知',
      content: [
        '**${rule_name}**',
        '矩阵包：${package_name}',
        '当前状态：${to_status_name}',
        '负责人：${owner_name}',
        '开发者账号：${developer_account_name}',
        '预计冷备完成时间：${expected_cold_ready_date}',
        '域名：${domain_info}',
        '包ID：${app_id}',
      ].join('\n'),
    }
  }

  if (type === 'UPCOMING') {
    return {
      title: '矩阵包即将到期提醒',
      content: [
        '**${rule_name}**',
        '矩阵包：${package_name}',
        '当前状态：${status_name}',
        '负责人：${owner_name}',
        '开发者账号：${developer_account_name}',
        '预计冷备完成时间：${expected_cold_ready_date}',
        '距离到期：${deadline_distance_text}',
        '域名：${domain_info}',
        '包ID：${app_id}',
      ].join('\n'),
    }
  }

  if (type === 'SIDE_DEADLINE') {
    return {
      title: '矩阵包各侧信息截止提醒',
      content: [
        '**${rule_name}**',
        '矩阵包：${package_name}',
        '信息侧别：${side_name}',
        '当前状态：未完成',
        '负责人：${side_owner_name}',
        '统一截止时间：${expected_cold_ready_date}',
        '距离截止：${deadline_distance_text}',
        '域名：${domain_info}',
        '包ID：${app_id}',
      ].join('\n'),
    }
  }

  return {
    title: '矩阵包逾期提醒',
    content: [
      '**${rule_name}**',
      '矩阵包：${package_name}',
      '当前状态：${status_name}',
      '负责人：${owner_name}',
      '开发者账号：${developer_account_name}',
      '预计冷备完成时间：${expected_cold_ready_date}',
      '已逾期：${overdue_duration_text}',
      '域名：${domain_info}',
      '包ID：${app_id}',
    ].join('\n'),
  }
}

function buildConditionConfig(payload = {}) {
  const sceneCode = normalizeCode(payload.scene_code)
  const sceneType = getSceneType(sceneCode)
  if (sceneType === 'STATUS_CHANGE') {
    const transitions = normalizeStatusTransitions(payload.status_transitions)
    return {
      trigger_mode: 'event',
      field_condition: {
        logic: 'or',
        items: transitions.map((item) => ({
          logic: 'and',
          items: [
            ...(item.from_status && item.from_status !== '*'
              ? [{ field: 'from_status', operator: 'eq', value: item.from_status }]
              : []),
            { field: 'to_status', operator: 'eq', value: item.to_status },
          ],
        })),
      },
      matrix_package: {
        status_transitions: transitions,
      },
    }
  }

  const schedule = normalizeScheduleConfig(payload.schedule || {})
  if (sceneType === 'UPCOMING') {
    const reminder = normalizeReminderConfig(payload.reminder || {})
    return {
      trigger_mode: 'schedule',
      schedule,
      matrix_package: {
        reminder_kind: 'upcoming',
        ...reminder,
      },
    }
  }

  if (sceneType === 'SIDE_DEADLINE') {
    const reminder = normalizeReminderConfig(payload.reminder || {})
    return {
      trigger_mode: 'schedule',
      schedule,
      matrix_package: {
        reminder_kind: 'side_deadline',
        ...reminder,
      },
    }
  }

  return {
    trigger_mode: 'schedule',
    schedule,
    matrix_package: {
      reminder_kind: 'overdue',
    },
  }
}

function parseManagedConditionConfig(sceneCode, conditionConfig) {
  const cfg = conditionConfig && typeof conditionConfig === 'object' ? conditionConfig : {}
  const sceneType = getSceneType(sceneCode)
  if (sceneType === 'STATUS_CHANGE') {
    const transitions = normalizeStatusTransitions(
      cfg?.matrix_package?.status_transitions || [],
    )

    if (transitions.length > 0) {
      return { status_transitions: transitions }
    }

    const legacyStatusCodes = normalizeStatusCodeArray(
      cfg?.matrix_package?.selected_status_codes || cfg?.field_condition?.value || [],
    )
    return {
      status_transitions: legacyStatusCodes.map((code) => ({
        from_status: '*',
        to_status: code,
      })),
    }
  }

  const schedule = normalizeScheduleConfig(cfg?.schedule || {})
  if (sceneType === 'UPCOMING') {
    const reminder = normalizeReminderConfig(cfg?.matrix_package || {})
    return {
      schedule,
      reminder,
    }
  }

  if (sceneType === 'SIDE_DEADLINE') {
    const reminder = normalizeReminderConfig(cfg?.matrix_package || {})
    return {
      schedule,
      reminder,
    }
  }

  return {
    schedule,
  }
}

function buildTriggerSummary(sceneCode, parsedCondition, statusNameMap = new Map()) {
  const sceneType = getSceneType(sceneCode)
  if (sceneType === 'STATUS_CHANGE') {
    const transitions = parsedCondition?.status_transitions || []
    const text = transitions.map((item) => {
      const fromName = !item.from_status || item.from_status === '*' ? '任意状态' : statusNameMap.get(item.from_status) || item.from_status
      const toName = statusNameMap.get(item.to_status) || item.to_status
      return `${fromName} -> ${toName}`
    })
    return text.length > 0 ? `命中流转：${text.join('；')}` : '命中流转：未配置'
  }

  const schedule = parsedCondition?.schedule || {}
  const hh = String(schedule.hour ?? 9).padStart(2, '0')
  const mm = String(schedule.minute ?? 0).padStart(2, '0')
  if (sceneType === 'UPCOMING') {
    const reminder = parsedCondition?.reminder || {}
    const unitText = reminder.offset_unit === 'day' ? '天' : '小时'
    return `每日 ${hh}:${mm} 扫描，提前 ${reminder.offset_value || 24}${unitText} 提醒`
  }

  if (sceneType === 'SIDE_DEADLINE') {
    const reminder = parsedCondition?.reminder || {}
    const unitText = reminder.offset_unit === 'day' ? '天' : '小时'
    return `每日 ${hh}:${mm} 扫描，提前 ${reminder.offset_value || 24}${unitText} 提醒未完成侧负责人`
  }

  return `每日 ${hh}:${mm} 扫描，命中逾期包提醒`
}

async function listRuleReceiverLabels(ruleIds = []) {
  const ids = Array.from(new Set((Array.isArray(ruleIds) ? ruleIds : []).map((item) => Number(item)).filter((item) => item > 0)))
  if (ids.length === 0) return new Map()

  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await pool.query(
    `SELECT rule_id, receiver_value, receiver_label
     FROM notification_rule_receivers
     WHERE rule_id IN (${placeholders})
       AND receiver_type = 'DYNAMIC'
       AND receiver_value LIKE 'chat_id:%'`,
    ids,
  )

  const map = new Map()
  for (const row of rows || []) {
    map.set(Number(row.rule_id), {
      receiver_label: row.receiver_label || String(row.receiver_value || '').slice('chat_id:'.length),
      chat_id: String(row.receiver_value || '').slice('chat_id:'.length),
      chat_name: row.receiver_label || String(row.receiver_value || '').slice('chat_id:'.length),
    })
  }
  return map
}

async function syncChatReceiverLabel(ruleId, chatId, chatName) {
  const normalizedChatId = normalizeText(chatId, 128)
  if (!normalizedChatId) return
  const normalizedChatName = normalizeText(chatName, 255) || normalizedChatId
  await pool.query(
    `UPDATE notification_rule_receivers
     SET receiver_label = ?
     WHERE rule_id = ?
       AND receiver_type = 'DYNAMIC'
       AND receiver_value = ?`,
    [normalizedChatName, Number(ruleId), `chat_id:${normalizedChatId}`],
  )
}

async function listManagedRuleRows() {
  const sceneCodes = SCENE_DEFINITIONS.map((item) => item.code)
  const placeholders = sceneCodes.map(() => '?').join(', ')
  const [rows] = await pool.query(
    `SELECT
       id,
       rule_code,
       rule_name,
       biz_domain,
       event_type,
       message_title,
       message_content,
       trigger_condition_json,
       enabled,
       created_by,
       updated_by,
       DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
       DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM notification_rules
     WHERE biz_domain = 'matrix_package'
       AND event_type IN (${placeholders})
     ORDER BY id DESC`,
    sceneCodes,
  )
  return rows || []
}

async function getManagedRuleRowById(ruleId) {
  const id = toPositiveInt(ruleId)
  if (!id) return null
  const [rows] = await pool.query(
    `SELECT
       id,
       rule_code,
       rule_name,
       biz_domain,
       event_type,
       message_title,
       message_content,
       trigger_condition_json,
       enabled,
       created_by,
       updated_by,
       DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
       DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM notification_rules
     WHERE id = ?
       AND biz_domain = 'matrix_package'
     LIMIT 1`,
    [id],
  )
  return rows[0] || null
}

async function loadStatusNameMap() {
  const items = await ConfigDict.listItems(MatrixPackage.STATUS_DICT_KEY, { enabledOnly: true })
  const map = new Map()
  ;(items || []).forEach((item) => {
    map.set(String(item.item_code || '').trim().toUpperCase(), item.item_name || item.item_code || '')
  })
  return map
}

function mapManagedRule(row, receiverInfo, statusNameMap) {
  const sceneCode = normalizeCode(row.event_type)
  const sceneDef = getSceneDefinition(sceneCode)
  const conditionConfig = safeJsonParse(row.trigger_condition_json, null)
  const parsedCondition = parseManagedConditionConfig(sceneCode, conditionConfig)
  return {
    id: Number(row.id),
    rule_code: row.rule_code || '',
    rule_name: row.rule_name || '',
    scene_code: sceneCode,
    scene_name: sceneDef?.name || sceneCode,
    scene_type: sceneDef?.type || '',
    trigger_summary: buildTriggerSummary(sceneCode, parsedCondition, statusNameMap),
    receiver_label:
      sceneDef?.type === 'SIDE_DEADLINE'
        ? '各侧负责人'
        : receiverInfo?.receiver_label || receiverInfo?.chat_name || '',
    chat_id: receiverInfo?.chat_id || '',
    chat_name: receiverInfo?.chat_name || '',
    status_transitions: parsedCondition?.status_transitions || [],
    schedule: parsedCondition?.schedule || null,
    reminder: parsedCondition?.reminder || null,
    is_enabled: Number(row.enabled) === 1 ? 1 : 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

function buildStatusChangeEventData(beforePackage, afterPackage) {
  return {
    package_id: Number(afterPackage?.id || 0) || null,
    package_name: String(afterPackage?.package_name || ''),
    app_id: String(afterPackage?.app_id || ''),
    domain_info: String(afterPackage?.domain_info || ''),
    owner_name: String(afterPackage?.owner_name || ''),
    owner_user_id: Number(afterPackage?.owner_user_id || 0) || null,
    developer_account_id: Number(afterPackage?.developer_account_id || 0) || null,
    developer_account_name: String(afterPackage?.developer_account_name || ''),
    expected_cold_ready_date: String(afterPackage?.expected_cold_ready_date || ''),
    from_status: String(beforePackage?.status_code || '').trim().toUpperCase(),
    from_status_name: String(beforePackage?.status_name || beforePackage?.status_code || ''),
    to_status: String(afterPackage?.status_code || '').trim().toUpperCase(),
    to_status_name: String(afterPackage?.status_name || afterPackage?.status_code || ''),
    status_name: String(afterPackage?.status_name || afterPackage?.status_code || ''),
  }
}

function isScheduleMatched(scheduleConfig = {}, now = new Date()) {
  const hour = Number(scheduleConfig.hour)
  const minute = Number(scheduleConfig.minute)
  const targetHour = Number.isInteger(hour) ? hour : 9
  const targetMinute = Number.isInteger(minute) ? minute : 0
  return now.getHours() === targetHour && now.getMinutes() === targetMinute
}

function normalizeDueDateEnd(dateText) {
  const normalized = String(dateText || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  const date = new Date(`${normalized}T23:59:59+08:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function buildDeadlineDistanceText(diffHours) {
  if (!Number.isFinite(diffHours)) return ''
  if (Math.abs(diffHours) >= 24) {
    return `${(diffHours / 24).toFixed(1)}天`
  }
  return `${diffHours.toFixed(1)}小时`
}

async function acquireTriggerCursor(ruleId, triggerKey, expireHours = 240) {
  const [result] = await pool.query(
    `INSERT IGNORE INTO notification_trigger_cursor (
       rule_id,
       trigger_key,
       expire_at
     ) VALUES (
       ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR)
     )`,
    [Number(ruleId), String(triggerKey), Math.max(1, toPositiveInt(expireHours, 240))],
  )
  return Number(result?.affectedRows || 0) > 0
}

async function listCandidateMatrixPackages() {
  const [rows] = await pool.query(
    `SELECT
       mp.id,
       mp.package_name,
       mp.app_id,
       mp.domain_info,
       mp.developer_account_id,
       da.account_name AS developer_account_name,
       mp.owner_user_id,
       COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username, mp.owner_name, '') AS owner_name,
       mp.status_code,
       statusDict.item_name AS status_name,
       DATE_FORMAT(mp.expected_cold_ready_date, '%Y-%m-%d') AS expected_cold_ready_date
     FROM matrix_packages mp
     LEFT JOIN developer_accounts da
       ON da.id = mp.developer_account_id
      AND da.deleted_at IS NULL
     LEFT JOIN users ownerUser
       ON ownerUser.id = mp.owner_user_id
     LEFT JOIN config_dict_items statusDict
       ON statusDict.type_key = ?
      AND statusDict.item_code = mp.status_code
     WHERE mp.deleted_at IS NULL
       AND mp.expected_cold_ready_date IS NOT NULL`,
    [MatrixPackage.STATUS_DICT_KEY],
  )
  return (rows || []).map((row) => ({
    id: Number(row.id),
    package_name: row.package_name || '',
    app_id: row.app_id || '',
    domain_info: row.domain_info || '',
    developer_account_id: row.developer_account_id ? Number(row.developer_account_id) : null,
    developer_account_name: row.developer_account_name || '',
    owner_user_id: row.owner_user_id ? Number(row.owner_user_id) : null,
    owner_name: row.owner_name || '',
    status_code: String(row.status_code || '').trim().toUpperCase(),
    status_name: row.status_name || row.status_code || '',
    expected_cold_ready_date: row.expected_cold_ready_date || '',
  }))
}

function shouldParticipateInDeadlineScan(pkg) {
  return ACTIVE_PRODUCTION_STATUS_CODES.has(String(pkg?.status_code || '').trim().toUpperCase())
}

async function listPendingSideDeadlineNotes() {
  const [rows] = await pool.query(
    `SELECT
       mp.id AS package_id,
       mp.package_name,
       mp.app_id,
       mp.domain_info,
       mp.owner_user_id,
       COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username, mp.owner_name, '') AS owner_name,
       mp.developer_account_id,
       da.account_name AS developer_account_name,
       mp.status_code,
       statusDict.item_name AS status_name,
       DATE_FORMAT(mp.expected_cold_ready_date, '%Y-%m-%d') AS expected_cold_ready_date,
       mpn.note_type AS side_type,
       mpn.owner_user_id AS side_owner_user_id,
       COALESCE(NULLIF(noteOwner.real_name, ''), noteOwner.username, mpn.owner_name, '') AS side_owner_name,
       CASE
         WHEN COALESCE(TRIM(mpn.content), '') <> ''
          AND COALESCE(mpn.content, '') = COALESCE(mpn.confirmed_content, '')
         THEN 1
         ELSE 0
       END AS is_confirmed
     FROM matrix_package_side_notes mpn
     INNER JOIN matrix_packages mp
       ON mp.id = mpn.package_id
      AND mp.deleted_at IS NULL
     LEFT JOIN developer_accounts da
       ON da.id = mp.developer_account_id
      AND da.deleted_at IS NULL
     LEFT JOIN users ownerUser
       ON ownerUser.id = mp.owner_user_id
     LEFT JOIN users noteOwner
       ON noteOwner.id = mpn.owner_user_id
     LEFT JOIN config_dict_items statusDict
       ON statusDict.type_key = ?
      AND statusDict.item_code = mp.status_code
     WHERE mp.expected_cold_ready_date IS NOT NULL
       AND mpn.owner_user_id IS NOT NULL`,
    [MatrixPackage.STATUS_DICT_KEY],
  )

  return (rows || []).map((row) => ({
    package_id: Number(row.package_id),
    package_name: row.package_name || '',
    app_id: row.app_id || '',
    domain_info: row.domain_info || '',
    owner_user_id: row.owner_user_id ? Number(row.owner_user_id) : null,
    owner_name: row.owner_name || '',
    developer_account_id: row.developer_account_id ? Number(row.developer_account_id) : null,
    developer_account_name: row.developer_account_name || '',
    status_code: String(row.status_code || '').trim().toUpperCase(),
    status_name: row.status_name || row.status_code || '',
    expected_cold_ready_date: row.expected_cold_ready_date || '',
    side_type: String(row.side_type || '').trim().toUpperCase(),
    side_owner_user_id: row.side_owner_user_id ? Number(row.side_owner_user_id) : null,
    side_owner_name: row.side_owner_name || '',
    is_confirmed: Number(row.is_confirmed || 0) === 1,
  }))
}

function getSideTypeDisplayName(sideType) {
  const map = {
    DELIVERY: 'PUSH信息补充',
    DESIGN: '设计侧补充',
    OPERATION: '运营侧补充',
    FRONTEND: '前端补充',
    BACKEND: 'GP初始化配置信息',
    DEVOPS: '运维补充',
    REQUIREMENT: '需求侧补充',
    DEVELOPMENT: '研发侧补充',
  }
  return map[String(sideType || '').trim().toUpperCase()] || sideType || ''
}

const MatrixPackageNotificationService = {
  SCENE_DEFINITIONS,

  async getMeta() {
    const statusItems = await ConfigDict.listItems(MatrixPackage.STATUS_DICT_KEY, { enabledOnly: true })
    return {
      scenes: SCENE_DEFINITIONS.map((item) => ({
        code: item.code,
        name: item.name,
        description: item.description,
        type: item.type,
      })),
      statuses: (statusItems || []).map((item) => ({
        code: String(item.item_code || '').trim().toUpperCase(),
        name: item.item_name || item.item_code || '',
        color: item.color || '',
      })),
    }
  },

  async listRules() {
    const rows = await listManagedRuleRows()
    const receiverMap = await listRuleReceiverLabels(rows.map((item) => Number(item.id)))
    const statusNameMap = await loadStatusNameMap()
    return rows.map((row) => mapManagedRule(row, receiverMap.get(Number(row.id)) || null, statusNameMap))
  },

  async getRuleById(ruleId) {
    const row = await getManagedRuleRowById(ruleId)
    if (!row) return null
    const receiverMap = await listRuleReceiverLabels([Number(ruleId)])
    const statusNameMap = await loadStatusNameMap()
    return mapManagedRule(row, receiverMap.get(Number(ruleId)) || null, statusNameMap)
  },

  async createRule(payload = {}, userId = null) {
    const sceneCode = normalizeCode(payload.scene_code)
    if (!SCENE_CODE_SET.has(sceneCode)) {
      const err = new Error('matrix_package_notification_scene_invalid')
      err.statusCode = 400
      err.message = '通知场景不合法'
      throw err
    }

    const ruleName = normalizeText(payload.rule_name, 128)
    if (!ruleName) {
      const err = new Error('matrix_package_notification_rule_name_required')
      err.statusCode = 400
      err.message = '规则名称不能为空'
      throw err
    }

    const sceneType = getSceneType(sceneCode)
    const chatId = normalizeText(payload.chat_id, 128)
    if (sceneType !== 'SIDE_DEADLINE' && !chatId) {
      const err = new Error('matrix_package_notification_chat_required')
      err.statusCode = 400
      err.message = '飞书群不能为空'
      throw err
    }

    const conditionConfig = buildConditionConfig(payload)
    if (getSceneType(sceneCode) === 'STATUS_CHANGE' && conditionConfig.matrix_package.status_transitions.length === 0) {
      const err = new Error('matrix_package_notification_status_required')
      err.statusCode = 400
      err.message = '请至少配置一条状态流转'
      throw err
    }

    const template = buildDefaultTemplate(sceneCode)
    const createdId = await NotificationRule.create({
      rule_code: isValidRuleCode(payload.rule_code) ? payload.rule_code : buildRuleCode(sceneCode),
      rule_name: ruleName,
      scene_code: sceneCode,
      biz_domain: 'matrix_package',
      channel_type: 'feishu',
      receiver_type: sceneType === 'SIDE_DEADLINE' ? 'field' : 'chat',
      receiver_config_json:
        sceneType === 'SIDE_DEADLINE'
          ? { user_id_field: 'side_owner_user_id' }
          : {
            chat_ids: [chatId],
          },
      message_title: template.title,
      message_content: template.content,
      condition_config_json: conditionConfig,
      is_enabled: toBooleanInt(payload.is_enabled, 1),
      created_by: userId,
      updated_by: userId,
    })
    if (sceneType !== 'SIDE_DEADLINE') {
      await syncChatReceiverLabel(createdId, chatId, payload.chat_name)
    }
    return this.getRuleById(createdId)
  },

  async updateRule(ruleId, payload = {}, userId = null) {
    const existing = await getManagedRuleRowById(ruleId)
    if (!existing) return null

    const sceneCode = normalizeCode(payload.scene_code)
    if (!SCENE_CODE_SET.has(sceneCode)) {
      const err = new Error('matrix_package_notification_scene_invalid')
      err.statusCode = 400
      err.message = '通知场景不合法'
      throw err
    }

    const ruleName = normalizeText(payload.rule_name, 128)
    if (!ruleName) {
      const err = new Error('matrix_package_notification_rule_name_required')
      err.statusCode = 400
      err.message = '规则名称不能为空'
      throw err
    }

    const sceneType = getSceneType(sceneCode)
    const chatId = normalizeText(payload.chat_id, 128)
    if (sceneType !== 'SIDE_DEADLINE' && !chatId) {
      const err = new Error('matrix_package_notification_chat_required')
      err.statusCode = 400
      err.message = '飞书群不能为空'
      throw err
    }

    const conditionConfig = buildConditionConfig(payload)
    if (getSceneType(sceneCode) === 'STATUS_CHANGE' && conditionConfig.matrix_package.status_transitions.length === 0) {
      const err = new Error('matrix_package_notification_status_required')
      err.statusCode = 400
      err.message = '请至少配置一条状态流转'
      throw err
    }

    const template = buildDefaultTemplate(sceneCode)
    await NotificationRule.update(Number(ruleId), {
      rule_code: existing.rule_code,
      rule_name: ruleName,
      scene_code: sceneCode,
      biz_domain: 'matrix_package',
      channel_type: 'feishu',
      receiver_type: sceneType === 'SIDE_DEADLINE' ? 'field' : 'chat',
      receiver_config_json:
        sceneType === 'SIDE_DEADLINE'
          ? { user_id_field: 'side_owner_user_id' }
          : {
            chat_ids: [chatId],
          },
      message_title: template.title,
      message_content: template.content,
      condition_config_json: conditionConfig,
      is_enabled: toBooleanInt(payload.is_enabled, Number(existing.enabled) === 1 ? 1 : 0),
      updated_by: userId,
    })
    if (sceneType !== 'SIDE_DEADLINE') {
      await syncChatReceiverLabel(Number(ruleId), chatId, payload.chat_name)
    }
    return this.getRuleById(ruleId)
  },

  async deleteRule(ruleId) {
    const existing = await getManagedRuleRowById(ruleId)
    if (!existing) return 0
    return NotificationRule.remove(Number(ruleId))
  },

  async triggerStatusChangeNotifications({ beforePackage, afterPackage, operatorUserId = null } = {}) {
    if (!beforePackage || !afterPackage) return
    const beforeStatus = String(beforePackage.status_code || '').trim().toUpperCase()
    const afterStatus = String(afterPackage.status_code || '').trim().toUpperCase()
    if (!afterStatus || beforeStatus === afterStatus) return

    await NotificationEvent.processEvent({
      eventType: 'matrix_package_status_change',
      data: buildStatusChangeEventData(beforePackage, afterPackage),
      operatorUserId,
    })
  },

  async dispatchScheduledNotifications() {
    const now = new Date()
    const rows = await listManagedRuleRows()
    const enabledRules = rows.filter((item) => Number(item.enabled) === 1)
    if (enabledRules.length === 0) return

    const packages = await listCandidateMatrixPackages()

    for (const row of enabledRules) {
      const sceneCode = normalizeCode(row.event_type)
      if (
        sceneCode !== 'matrix_package_upcoming_deadline' &&
        sceneCode !== 'matrix_package_overdue_deadline' &&
        sceneCode !== 'matrix_package_side_info_deadline'
      ) continue

      const conditionConfig = safeJsonParse(row.trigger_condition_json, null) || {}
      const parsed = parseManagedConditionConfig(sceneCode, conditionConfig)
      const schedule = parsed.schedule || {}
      if (!isScheduleMatched(schedule, now)) continue

      if (sceneCode === 'matrix_package_side_info_deadline') {
        const reminder = parsed.reminder || { offset_unit: 'hour', offset_value: 24 }
        const thresholdHours = reminder.offset_unit === 'day'
          ? Number(reminder.offset_value || 1) * 24
          : Number(reminder.offset_value || 1)
        const sideNotes = await listPendingSideDeadlineNotes()

        for (const note of sideNotes) {
          if (!shouldParticipateInDeadlineScan(note)) continue
          if (note.is_confirmed || !note.side_owner_user_id) continue
          const dueAt = normalizeDueDateEnd(note.expected_cold_ready_date)
          if (!dueAt) continue

          const diffHours = Number(((dueAt.getTime() - now.getTime()) / (60 * 60 * 1000)).toFixed(1))
          if (!(diffHours >= 0 && diffHours <= thresholdHours)) continue

          const triggerKey = `matrix_package_side_deadline:${Number(row.id)}:${Number(note.package_id)}:${note.side_type}:${note.expected_cold_ready_date}:${thresholdHours}`
          const acquired = await acquireTriggerCursor(Number(row.id), triggerKey, 240)
          if (!acquired) continue

          await NotificationEvent.processEvent({
            eventType: sceneCode,
            data: {
              package_id: note.package_id,
              package_name: note.package_name,
              app_id: note.app_id,
              domain_info: note.domain_info,
              owner_user_id: note.owner_user_id,
              owner_name: note.owner_name,
              developer_account_id: note.developer_account_id,
              developer_account_name: note.developer_account_name,
              status_code: note.status_code,
              status_name: note.status_name,
              expected_cold_ready_date: note.expected_cold_ready_date,
              side_type: note.side_type,
              side_name: getSideTypeDisplayName(note.side_type),
              side_owner_user_id: note.side_owner_user_id,
              side_owner_name: note.side_owner_name,
              deadline_distance_hours: diffHours,
              deadline_distance_text: buildDeadlineDistanceText(diffHours),
              __schedule_context: {
                matched: true,
                trigger_key: triggerKey,
                trigger_time: now.toISOString(),
              },
            },
            operatorUserId: null,
            targetRuleIds: [Number(row.id)],
          })
        }
        continue
      }

      for (const pkg of packages) {
        if (!shouldParticipateInDeadlineScan(pkg)) continue
        const dueAt = normalizeDueDateEnd(pkg.expected_cold_ready_date)
        if (!dueAt) continue

        const diffHours = Number(((dueAt.getTime() - now.getTime()) / (60 * 60 * 1000)).toFixed(1))
        if (sceneCode === 'matrix_package_upcoming_deadline') {
          const reminder = parsed.reminder || { offset_unit: 'hour', offset_value: 24 }
          const thresholdHours = reminder.offset_unit === 'day'
            ? Number(reminder.offset_value || 1) * 24
            : Number(reminder.offset_value || 1)
          if (!(diffHours >= 0 && diffHours <= thresholdHours)) continue

          const triggerKey = `matrix_package_upcoming:${Number(row.id)}:${Number(pkg.id)}:${pkg.expected_cold_ready_date}:${thresholdHours}`
          const acquired = await acquireTriggerCursor(Number(row.id), triggerKey, 240)
          if (!acquired) continue

          await NotificationEvent.processEvent({
            eventType: sceneCode,
            data: {
              package_id: pkg.id,
              package_name: pkg.package_name,
              app_id: pkg.app_id,
              domain_info: pkg.domain_info,
              owner_user_id: pkg.owner_user_id,
              owner_name: pkg.owner_name,
              developer_account_id: pkg.developer_account_id,
              developer_account_name: pkg.developer_account_name,
              status_code: pkg.status_code,
              status_name: pkg.status_name,
              expected_cold_ready_date: pkg.expected_cold_ready_date,
              deadline_distance_hours: diffHours,
              deadline_distance_text: buildDeadlineDistanceText(diffHours),
              __schedule_context: {
                matched: true,
                trigger_key: triggerKey,
                trigger_time: now.toISOString(),
              },
            },
            operatorUserId: null,
            targetRuleIds: [Number(row.id)],
          })
          continue
        }

        if (diffHours >= 0) continue
        const triggerKey = `matrix_package_overdue:${Number(row.id)}:${Number(pkg.id)}:${now.toISOString().slice(0, 10)}`
        const acquired = await acquireTriggerCursor(Number(row.id), triggerKey, 48)
        if (!acquired) continue

        await NotificationEvent.processEvent({
          eventType: sceneCode,
          data: {
            package_id: pkg.id,
            package_name: pkg.package_name,
            app_id: pkg.app_id,
            domain_info: pkg.domain_info,
            owner_user_id: pkg.owner_user_id,
            owner_name: pkg.owner_name,
            developer_account_id: pkg.developer_account_id,
            developer_account_name: pkg.developer_account_name,
            status_code: pkg.status_code,
            status_name: pkg.status_name,
            expected_cold_ready_date: pkg.expected_cold_ready_date,
            overdue_hours: Math.abs(diffHours),
            overdue_duration_text: buildDeadlineDistanceText(Math.abs(diffHours)),
            __schedule_context: {
              matched: true,
              trigger_key: triggerKey,
              trigger_time: now.toISOString(),
            },
          },
          operatorUserId: null,
          targetRuleIds: [Number(row.id)],
        })
      }
    }
  },
}

module.exports = MatrixPackageNotificationService
