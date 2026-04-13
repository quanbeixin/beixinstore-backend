const NotificationEvent = require('../models/NotificationEvent')
const Work = require('../models/Work')
const pool = require('../utils/db')

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

async function getDailyReportRoleMap(ruleIds = []) {
  const ids = parsePositiveIntArray(ruleIds)
  if (ids.length === 0) return new Map()
  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await pool.query(
    `SELECT rule_id, receiver_value
     FROM notification_rule_receivers
     WHERE enabled = 1
       AND receiver_type = 'DYNAMIC'
       AND rule_id IN (${placeholders})
       AND receiver_value LIKE 'business_role:daily_report_%'`,
    ids,
  )

  const map = new Map()
  for (const row of rows || []) {
    const ruleId = Number(row.rule_id)
    if (!map.has(ruleId)) map.set(ruleId, new Set())
    map.get(ruleId).add(String(row.receiver_value || '').trim().toLowerCase())
  }
  return map
}

function filterDailyEventsByRoleSet(events, roleSet) {
  if (!Array.isArray(events) || events.length === 0) return []
  const normalizedRoleSet = roleSet instanceof Set ? roleSet : new Set()
  const needUnfilled = normalizedRoleSet.has('business_role:daily_report_unfilled')
  const needUnscheduled = normalizedRoleSet.has('business_role:daily_report_unscheduled')
  const needOnlySingleCategory = needUnfilled !== needUnscheduled
  if (!needOnlySingleCategory) return events
  return events.filter((item) => (needUnfilled ? item?.category_key === 'unfilled' : item?.category_key === 'unscheduled'))
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
    const useRealDailyReportData =
      eventType === 'daily_report_notify' && data && typeof data === 'object' && data.__use_real_daily_report === true

    if (useRealDailyReportData) {
      const commonData = { ...data }
      delete commonData.__use_real_daily_report

      const events = await Work.buildDailyReportNotifyEvents(req.user?.id || 0, {
        canViewAll: true,
      })

      if (!Array.isArray(events) || events.length === 0) {
        return sendSuccess(res, {
          message: '事件处理完成',
          data: {
            event_type: eventType,
            candidate_count: 0,
            matched_count: 0,
            processed_count: 0,
            results: [],
          },
        })
      }

      const mergedResults = []
      let candidateCount = 0
      let matchedCount = 0
      let processedCount = 0

      const normalizedRuleIds = parsePositiveIntArray(targetRuleIds)
      const perRuleRoleMap = await getDailyReportRoleMap(normalizedRuleIds)
      const batches =
        normalizedRuleIds.length > 0
          ? normalizedRuleIds.map((ruleId) => ({
            ruleIds: [ruleId],
            events: filterDailyEventsByRoleSet(events, perRuleRoleMap.get(ruleId)),
          }))
          : [{ ruleIds: [], events }]

      for (const batch of batches) {
        for (const eventPayload of batch.events) {
          const result = await NotificationEvent.processEvent({
            eventType,
            data: {
              ...eventPayload,
              ...commonData,
            },
            operatorUserId: req.user?.id || null,
            targetRuleIds: batch.ruleIds,
          })
          candidateCount += Number(result?.candidate_count || 0)
          matchedCount += Number(result?.matched_count || 0)
          processedCount += Number(result?.processed_count || 0)
          if (Array.isArray(result?.results)) mergedResults.push(...result.results)
        }
      }

      return sendSuccess(res, {
        message: '事件处理完成',
        data: {
          event_type: eventType,
          candidate_count: candidateCount,
          matched_count: matchedCount,
          processed_count: processedCount,
          results: mergedResults,
        },
      })
    }

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
