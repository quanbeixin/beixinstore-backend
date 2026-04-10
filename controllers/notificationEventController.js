const NotificationEvent = require('../models/NotificationEvent')

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

function isValidCode(value) {
  return /^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(value)
}

function toNullablePositiveInt(value) {
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  if (!Number.isInteger(num) || num <= 0) return null
  return num
}

function parsePositiveIntArray(values) {
  if (!Array.isArray(values)) return []
  return Array.from(
    new Set(
      values
        .map((item) => toNullablePositiveInt(item))
        .filter(Boolean),
    ),
  )
}

const receiveEvent = async (req, res) => {
  const eventType = normalizeText(req.body?.eventType, 64)
  const data = req.body?.data
  const targetRuleIds = parsePositiveIntArray(req.body?.targetRuleIds)

  if (!eventType) {
    return sendError(res, { status: 400, message: 'eventType 不能为空', code: 'VALIDATION_ERROR' })
  }
  if (!isValidCode(eventType)) {
    return sendError(res, {
      status: 400,
      message: 'eventType 格式不正确（示例: node_assign）',
      code: 'VALIDATION_ERROR',
    })
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return sendError(res, { status: 400, message: 'data 必须是 JSON 对象', code: 'VALIDATION_ERROR' })
  }
  if (data.business_line_id !== undefined && data.business_line_id !== null) {
    const businessLineId = toNullablePositiveInt(data.business_line_id)
    if (businessLineId === null) {
      return sendError(res, {
        status: 400,
        message: 'data.business_line_id 必须是正整数',
        code: 'VALIDATION_ERROR',
      })
    }
  }

  try {
    const result = await NotificationEvent.processEvent({
      eventType,
      data,
      operatorUserId: req.user?.id || null,
      targetRuleIds,
    })

    return sendSuccess(res, { message: '事件处理完成', data: result })
  } catch (err) {
    console.error('处理通知事件失败:', err)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

module.exports = {
  receiveEvent,
}
