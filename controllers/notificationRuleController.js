const NotificationRule = require('../models/NotificationRule')
const {
  getNotificationSendControl,
  updateNotificationSendControl,
  listFeishuChats,
} = require('../utils/notificationSender')

const ALLOWED_CHANNEL_TYPES = new Set(['feishu'])
const ALLOWED_RECEIVER_TYPES = new Set(['role', 'user', 'field', 'chat', 'demand_group'])

function sendSuccess(res, { status = 200, message = '成功', data = null } = {}) {
  return res.status(status).json({
    success: true,
    message,
    data,
  })
}

function sendError(res, { status = 400, message = '请求错误', code = 'BAD_REQUEST', details = null } = {}) {
  return res.status(status).json({
    success: false,
    message,
    code,
    details,
  })
}

function normalizeText(value, maxLength = 255) {
  if (value === undefined || value === null) return ''
  return String(value).trim().slice(0, maxLength)
}

function toNullableInt(value) {
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  if (!Number.isInteger(num) || num < 0) return null
  return num
}

function normalizeJsonInput(value, defaultValue) {
  if (value === undefined) return defaultValue
  if (value === null || value === '') return defaultValue

  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return undefined
    }
  }

  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return undefined
  }
}

function isValidCode(value) {
  return /^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(value)
}

function generateRuleCode(sceneCode) {
  const scene = normalizeText(sceneCode, 64) || 'event'
  const normalizedScene = scene
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'event'

  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).slice(2, 8)
  return `n_rule_${normalizedScene}_${timestamp}_${randomPart}`.slice(0, 64)
}

function validateRulePayload(body, { requireRuleCode = true } = {}) {
  const ruleCode = normalizeText(body.rule_code, 64)
  const ruleName = normalizeText(body.rule_name, 128)
  const sceneCode = normalizeText(body.scene_code, 64)
  const channelType = normalizeText(body.channel_type, 32).toLowerCase()
  const receiverType = normalizeText(body.receiver_type, 32).toLowerCase()
  const messageTitle = normalizeText(body.message_title, 255)
  const messageContent = normalizeText(body.message_content, 5000)

  if (requireRuleCode) {
    if (!ruleCode) return { message: 'rule_code 不能为空', code: 'VALIDATION_ERROR' }
    if (!isValidCode(ruleCode)) return { message: 'rule_code 格式不正确（示例: node_assign_default）', code: 'VALIDATION_ERROR' }
  } else if (ruleCode && !isValidCode(ruleCode)) {
    return { message: 'rule_code 格式不正确（示例: node_assign_default）', code: 'VALIDATION_ERROR' }
  }

  if (!ruleName) return { message: 'rule_name 不能为空', code: 'VALIDATION_ERROR' }

  if (!sceneCode) return { message: 'scene_code 不能为空', code: 'VALIDATION_ERROR' }
  if (!isValidCode(sceneCode)) return { message: 'scene_code 格式不正确（示例: node_assign）', code: 'VALIDATION_ERROR' }

  if (!channelType) return { message: 'channel_type 不能为空', code: 'VALIDATION_ERROR' }
  if (!ALLOWED_CHANNEL_TYPES.has(channelType)) {
    return { message: `不支持的 channel_type: ${channelType}`, code: 'VALIDATION_ERROR' }
  }

  if (!receiverType) return { message: 'receiver_type 不能为空', code: 'VALIDATION_ERROR' }
  if (!ALLOWED_RECEIVER_TYPES.has(receiverType)) {
    return { message: `不支持的 receiver_type: ${receiverType}`, code: 'VALIDATION_ERROR' }
  }

  const receiverConfig = normalizeJsonInput(body.receiver_config_json, {})
  if (receiverConfig === undefined || receiverConfig === null || typeof receiverConfig !== 'object' || Array.isArray(receiverConfig)) {
    return { message: 'receiver_config_json 必须是 JSON 对象', code: 'VALIDATION_ERROR' }
  }

  const conditionConfig = normalizeJsonInput(body.condition_config_json, null)
  if (conditionConfig === undefined) return { message: 'condition_config_json 必须是合法 JSON', code: 'VALIDATION_ERROR' }
  if (conditionConfig !== null && (typeof conditionConfig !== 'object' || Array.isArray(conditionConfig))) {
    return { message: 'condition_config_json 仅支持 JSON 对象或 null', code: 'VALIDATION_ERROR' }
  }

  const dedupConfig = normalizeJsonInput(body.dedup_config_json, null)
  if (dedupConfig === undefined) return { message: 'dedup_config_json 必须是合法 JSON', code: 'VALIDATION_ERROR' }
  if (dedupConfig !== null && (typeof dedupConfig !== 'object' || Array.isArray(dedupConfig))) {
    return { message: 'dedup_config_json 仅支持 JSON 对象或 null', code: 'VALIDATION_ERROR' }
  }

  if (!messageTitle && !messageContent) {
    return { message: 'message_title 和 message_content 不能同时为空', code: 'VALIDATION_ERROR' }
  }

  const businessLineId = toNullableInt(body.business_line_id)
  if (body.business_line_id !== undefined && body.business_line_id !== null && businessLineId === null) {
    return { message: 'business_line_id 必须是正整数或 null', code: 'VALIDATION_ERROR' }
  }

  const retryCount = toNullableInt(body.retry_count)
  if (retryCount !== null && (retryCount < 0 || retryCount > 10)) {
    return { message: 'retry_count 仅支持 0-10', code: 'VALIDATION_ERROR' }
  }

  const retryIntervalSec = toNullableInt(body.retry_interval_sec)
  if (retryIntervalSec !== null && retryIntervalSec > 86400) {
    return { message: 'retry_interval_sec 仅支持 0-86400', code: 'VALIDATION_ERROR' }
  }

  const priority = toNullableInt(body.priority)
  if (priority !== null && priority > 99999) {
    return { message: 'priority 仅支持 0-99999', code: 'VALIDATION_ERROR' }
  }

  return null
}

const createRule = async (req, res) => {
  const validationError = validateRulePayload(req.body || {}, { requireRuleCode: false })
  if (validationError) {
    return sendError(res, { status: 400, ...validationError })
  }

  const ruleCode = normalizeText(req.body.rule_code, 64) || generateRuleCode(req.body.scene_code)

  try {
    const existing = await NotificationRule.getByCode(ruleCode)
    if (existing) {
      return sendError(res, { status: 409, message: 'rule_code 已存在', code: 'RULE_CODE_EXISTS' })
    }

    const createdId = await NotificationRule.create({
      ...req.body,
      rule_code: ruleCode,
      channel_type: normalizeText(req.body.channel_type, 32).toLowerCase(),
      receiver_type: normalizeText(req.body.receiver_type, 32).toLowerCase(),
      created_by: req.user?.id || null,
      updated_by: req.user?.id || null,
    })

    const created = await NotificationRule.getById(createdId)
    return sendSuccess(res, { status: 201, message: '创建成功', data: created })
  } catch (err) {
    console.error('创建通知规则失败:', err)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

const getRules = async (req, res) => {
  const isEnabled =
    req.query.is_enabled === undefined || req.query.is_enabled === '' ? undefined : req.query.is_enabled

  try {
    const rows = await NotificationRule.list({
      keyword: req.query.keyword,
      sceneCode: req.query.scene_code,
      businessLineId: toNullableInt(req.query.business_line_id),
      isEnabled,
    })
    return sendSuccess(res, { data: rows, message: '查询成功' })
  } catch (err) {
    console.error('获取通知规则失败:', err)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

const updateRule = async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return sendError(res, { status: 400, message: '无效的规则 ID', code: 'INVALID_ID' })
  }

  const validationError = validateRulePayload(req.body || {}, { requireRuleCode: true })
  if (validationError) {
    return sendError(res, { status: 400, ...validationError })
  }

  const nextCode = normalizeText(req.body.rule_code, 64)

  try {
    const existing = await NotificationRule.getById(id)
    if (!existing) {
      return sendError(res, { status: 404, message: '通知规则不存在', code: 'RULE_NOT_FOUND' })
    }

    const duplicated = await NotificationRule.getByCode(nextCode)
    if (duplicated && Number(duplicated.id) !== id) {
      return sendError(res, { status: 409, message: 'rule_code 已存在', code: 'RULE_CODE_EXISTS' })
    }

    await NotificationRule.update(id, {
      ...req.body,
      rule_code: nextCode,
      channel_type: normalizeText(req.body.channel_type, 32).toLowerCase(),
      receiver_type: normalizeText(req.body.receiver_type, 32).toLowerCase(),
      updated_by: req.user?.id || null,
    })

    const updated = await NotificationRule.getById(id)
    return sendSuccess(res, { message: '更新成功', data: updated })
  } catch (err) {
    console.error('更新通知规则失败:', err)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

const deleteRule = async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return sendError(res, { status: 400, message: '无效的规则 ID', code: 'INVALID_ID' })
  }

  try {
    const affected = await NotificationRule.remove(id)
    if (!affected) {
      return sendError(res, { status: 404, message: '通知规则不存在', code: 'RULE_NOT_FOUND' })
    }

    return sendSuccess(res, { message: '删除成功' })
  } catch (err) {
    console.error('删除通知规则失败:', err)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

const getSendControl = async (_req, res) => {
  try {
    const config = await getNotificationSendControl()
    return sendSuccess(res, { data: config, message: '查询成功' })
  } catch (err) {
    console.error('获取通知发送控制配置失败:', err)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

const updateSendControl = async (req, res) => {
  const mode = normalizeText(req.body?.mode, 32).toLowerCase()
  if (!['shadow', 'whitelist', 'live'].includes(mode)) {
    return sendError(res, { status: 400, message: 'mode 仅支持 shadow / whitelist / live', code: 'VALIDATION_ERROR' })
  }

  try {
    const updated = await updateNotificationSendControl({
      mode,
      whitelist_open_ids: req.body?.whitelist_open_ids,
      whitelist_chat_ids: req.body?.whitelist_chat_ids,
    })
    return sendSuccess(res, { data: updated, message: '更新成功' })
  } catch (err) {
    console.error('更新通知发送控制配置失败:', err)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

const getFeishuChatOptions = async (req, res) => {
  const pageToken = normalizeText(req.query?.page_token, 256)
  const pageSizeRaw = Number(req.query?.page_size || 50)
  const pageSize = Number.isInteger(pageSizeRaw) ? Math.min(Math.max(pageSizeRaw, 1), 100) : 50
  const keyword = normalizeText(req.query?.keyword, 100).toLowerCase()

  try {
    const result = await listFeishuChats({
      pageToken,
      pageSize,
    })

    if (!result?.success) {
      return sendError(res, {
        status: 502,
        message: result?.error_message || '获取飞书群列表失败',
        code: result?.error_code || 'FEISHU_CHAT_LIST_FAILED',
        details: result?.response || null,
      })
    }

    const rows = Array.isArray(result.data) ? result.data : []
    const filteredRows = keyword
      ? rows.filter((item) => {
        const id = String(item?.chat_id || '').toLowerCase()
        const name = String(item?.name || '').toLowerCase()
        return id.includes(keyword) || name.includes(keyword)
      })
      : rows

    return sendSuccess(res, {
      message: '查询成功',
      data: {
        items: filteredRows,
        next_page_token: result.next_page_token || '',
        has_more: Boolean(result.has_more),
      },
    })
  } catch (err) {
    console.error('获取飞书群列表失败:', err)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

module.exports = {
  createRule,
  getRules,
  updateRule,
  deleteRule,
  getSendControl,
  updateSendControl,
  getFeishuChatOptions,
}
