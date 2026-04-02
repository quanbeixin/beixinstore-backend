const pool = require('../utils/db')
const { sendNotification } = require('../utils/notificationSender')

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

function parseJsonArray(value, fallback = []) {
  const parsed = safeJsonParse(value, fallback)
  return Array.isArray(parsed) ? parsed : fallback
}

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
  return evaluateConditionNode(conditionConfig, eventData)
}

function renderTemplateText(template, data) {
  const source = String(template || '')
  return source.replace(/\$\{([a-zA-Z0-9_.]+)\}/g, (_full, keyPath) => {
    const value = getValueByPath(data, keyPath)
    if (value === undefined || value === null) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  })
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

async function listCandidateRules(eventType, businessLineId) {
  const params = [eventType]
  let whereSql = 'WHERE enabled = 1 AND LOWER(event_type) = LOWER(?)'

  if (businessLineId !== null && businessLineId !== undefined) {
    whereSql += ' AND (biz_line_id = 0 OR biz_line_id = ?)'
    params.push(Number(businessLineId))
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
      else roleKeys.push(item)
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
    const dynamicUserId = toNullableInt(getValueByPath(eventData, path || 'operator_id'))
    if (dynamicUserId) userIds.push(dynamicUserId)
  }

  const [usersById, usersByRole, usersByRoleKeys, usersByDept] = await Promise.all([
    getUsersByIds(userIds),
    getUsersByRoleIds(roleIds),
    getUsersByRoleKeys(roleKeys),
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

  const [usersById, usersByRole, usersByRoleKeys, usersByDept] = await Promise.all([
    getUsersByIds(userIds),
    getUsersByRoleIds(roleIds),
    getUsersByRoleKeys(roleKeys),
    getUsersByDepartmentIds(deptIds),
  ])

  const directOpenIdTargets = Array.from(new Set(directOpenIds)).map((openId) => ({
    target_type: 'user',
    target_id: openId,
    target_name: null,
    extra: null,
  }))

  const targets = [
    ...usersById.map(mapUserTarget).filter(Boolean),
    ...usersByRole.map(mapUserTarget).filter(Boolean),
    ...usersByRoleKeys.map(mapUserTarget).filter(Boolean),
    ...usersByDept.map(mapUserTarget).filter(Boolean),
    ...directOpenIdTargets,
    ...collectChatTargets(chatIds),
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
  async processEvent({ eventType, data = {}, operatorUserId = null }) {
    const normalizedEventType = normalizeText(eventType, 64)
    const businessLineId = data?.business_line_id ?? null

    const candidateRules = await listCandidateRules(normalizedEventType, businessLineId)
    const passedRules = candidateRules.filter((rule) => evaluateRuleCondition(rule.condition_config_json, data))

    const results = []

    for (const rule of passedRules) {
      let status = 'success'
      let errorCode = null
      let errorMessage = null

      const renderedTitle = renderTemplateText(rule.message_title || rule.rule_name || '系统通知', data)
      const renderedContent = renderTemplateText(rule.message_content || `事件 ${normalizedEventType} 已触发`, data)
      let sendResponse = {
        message: 'pending',
        operator_user_id: operatorUserId,
      }

      if (!renderedContent) {
        status = 'failed'
        errorCode = 'RULE_MESSAGE_EMPTY'
        errorMessage = '规则未配置可发送文案'
      } else {
        const targets = await resolveTargets(rule, data)
        if (targets.length === 0) {
          status = 'failed'
          errorCode = 'NO_RECEIVERS'
          errorMessage = '未找到可发送接收人（缺少用户 open_id 或接收配置）'
          sendResponse = {
            target_count: 0,
            success_count: 0,
            failure_count: 0,
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
            },
          })

          sendResponse = sendResult.response || {}

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
