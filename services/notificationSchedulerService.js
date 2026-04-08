const pool = require('../utils/db')
const NotificationEvent = require('../models/NotificationEvent')

const SCHEDULE_EVENT_TYPES = new Set(['schedule_hourly', 'schedule_daily', 'schedule_weekly', 'schedule_monthly'])
const DEADLINE_EVENT_TYPES = new Set(['worklog_deadline_remind'])
const DEFAULT_TIMEZONE = 'Asia/Shanghai'

let timer = null
let running = false

function toInt(value, fallback = 0) {
  const num = Number(value)
  return Number.isInteger(num) ? num : fallback
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

function getNowParts(timeZone = DEFAULT_TIMEZONE) {
  const date = new Date()
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  })
  const parts = formatter.formatToParts(date).reduce((acc, item) => {
    acc[item.type] = item.value
    return acc
  }, {})

  const weekdayMap = {
    '周一': 1,
    '周二': 2,
    '周三': 3,
    '周四': 4,
    '周五': 5,
    '周六': 6,
    '周日': 7,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  }

  return {
    year: toInt(parts.year, 0),
    month: toInt(parts.month, 0),
    day: toInt(parts.day, 0),
    hour: toInt(parts.hour, 0),
    minute: toInt(parts.minute, 0),
    second: toInt(parts.second, 0),
    weekday: weekdayMap[parts.weekday] || 0,
    nowIso: date.toISOString(),
  }
}

function formatDate(date) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function addDays(date, days) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + Number(days || 0))
  return d
}

function getCurrentWeekRange(timeZone = DEFAULT_TIMEZONE) {
  const nowParts = getNowParts(timeZone)
  const localToday = new Date(`${String(nowParts.year).padStart(4, '0')}-${String(nowParts.month).padStart(2, '0')}-${String(nowParts.day).padStart(2, '0')}T00:00:00`)
  const weekday = Number(nowParts.weekday || 1)
  const offsetToMonday = weekday === 0 ? 6 : weekday - 1
  const monday = addDays(localToday, -offsetToMonday)
  return {
    startDate: formatDate(monday || localToday),
    endDate: formatDate(localToday),
  }
}

function getScheduleBucketKey(eventType, nowParts) {
  const y = String(nowParts.year).padStart(4, '0')
  const m = String(nowParts.month).padStart(2, '0')
  const d = String(nowParts.day).padStart(2, '0')
  const h = String(nowParts.hour).padStart(2, '0')
  const mm = String(nowParts.minute).padStart(2, '0')
  if (eventType === 'schedule_hourly') return `${y}${m}${d}${h}${mm}`
  if (eventType === 'schedule_daily') return `${y}${m}${d}`
  if (eventType === 'schedule_weekly') return `${y}${m}${d}-w${nowParts.weekday}`
  return `${y}${m}` // monthly
}

function isScheduleMatched(eventType, scheduleConfig, nowParts) {
  const cfg = scheduleConfig && typeof scheduleConfig === 'object' ? scheduleConfig : {}
  const minute = toInt(cfg.minute, 0)

  if (eventType === 'schedule_hourly') {
    const intervalHours = Math.max(1, toInt(cfg.interval_hours, 1))
    return nowParts.minute === minute && nowParts.hour % intervalHours === 0
  }

  if (eventType === 'schedule_daily') {
    const hour = toInt(cfg.hour, 9)
    return nowParts.hour === hour && nowParts.minute === minute
  }

  if (eventType === 'schedule_weekly') {
    const hour = toInt(cfg.hour, 9)
    const weekdays = Array.isArray(cfg.weekdays) ? cfg.weekdays.map((item) => toInt(item, 0)).filter((item) => item >= 1 && item <= 7) : [1]
    return weekdays.includes(nowParts.weekday) && nowParts.hour === hour && nowParts.minute === minute
  }

  if (eventType === 'schedule_monthly') {
    const hour = toInt(cfg.hour, 9)
    const dayOfMonth = Math.max(1, Math.min(31, toInt(cfg.day_of_month, 1)))
    return nowParts.day === dayOfMonth && nowParts.hour === hour && nowParts.minute === minute
  }

  return false
}

async function ensureTriggerCursorTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS notification_trigger_cursor (
       id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
       rule_id BIGINT UNSIGNED NOT NULL,
       trigger_key VARCHAR(255) NOT NULL,
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       expire_at DATETIME NULL,
       PRIMARY KEY (id),
       UNIQUE KEY uk_rule_trigger_key (rule_id, trigger_key),
       KEY idx_expire_at (expire_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  )
}

async function cleanupExpiredCursor() {
  await pool.query(
    `DELETE FROM notification_trigger_cursor
     WHERE expire_at IS NOT NULL
       AND expire_at < NOW()
     LIMIT 500`,
  )
}

async function acquireTriggerCursor(ruleId, triggerKey, { expireHours = 72 } = {}) {
  const [result] = await pool.query(
    `INSERT IGNORE INTO notification_trigger_cursor (
       rule_id,
       trigger_key,
       expire_at
     ) VALUES (
       ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR)
     )`,
    [Number(ruleId), String(triggerKey), Math.max(1, toInt(expireHours, 72))],
  )
  return Number(result?.affectedRows || 0) > 0
}

async function listEnabledRulesForScheduler() {
  const [rows] = await pool.query(
    `SELECT
       id,
       biz_line_id,
       event_type,
       trigger_condition_json
     FROM notification_rules
     WHERE enabled = 1
       AND LOWER(event_type) IN (
         'schedule_hourly',
         'schedule_daily',
         'schedule_weekly',
         'schedule_monthly',
         'worklog_deadline_remind'
       )`,
  )
  return rows || []
}

async function dispatchScheduleRules(rules) {
  for (const rule of rules) {
    const scheduleSceneCode = String(rule?.event_type || '').toLowerCase()
    if (!SCHEDULE_EVENT_TYPES.has(scheduleSceneCode)) continue

    const conditionConfig = safeJsonParse(rule?.trigger_condition_json, null) || {}
    const triggerMode = String(conditionConfig?.trigger_mode || '').toLowerCase()
    if (triggerMode !== 'schedule') continue

    const scheduleConfig = conditionConfig?.schedule && typeof conditionConfig.schedule === 'object' ? conditionConfig.schedule : {}
    const dispatchEventType = String(scheduleConfig.event_type || scheduleSceneCode).trim().toLowerCase() || scheduleSceneCode
    const timeZone = String(scheduleConfig.timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE
    const nowParts = getNowParts(timeZone)

    if (!isScheduleMatched(scheduleSceneCode, scheduleConfig, nowParts)) continue

    const bucketKey = getScheduleBucketKey(scheduleSceneCode, nowParts)
    const triggerKey = `schedule:${scheduleSceneCode}:${bucketKey}`
    const acquired = await acquireTriggerCursor(rule.id, triggerKey, { expireHours: 240 })
    if (!acquired) continue

    const weeklyRange = getCurrentWeekRange(timeZone)
    const weekRangeText = `${weeklyRange.startDate} ~ ${weeklyRange.endDate}`

    await NotificationEvent.processEvent({
      eventType: dispatchEventType,
      data: {
        business_line_id: Number(rule?.biz_line_id || 0) || null,
        schedule_timezone: timeZone,
        schedule_bucket: bucketKey,
        week_range: weekRangeText,
        weekly_summary_text: `【定时周报】${weekRangeText}\n本次为系统定时触发，请在模板中按需补充业务字段。`,
        __schedule_context: {
          matched: true,
          trigger_key: triggerKey,
          trigger_time: nowParts.nowIso,
        },
      },
      operatorUserId: null,
      targetRuleIds: [Number(rule.id)],
    })
  }
}

function normalizeWorklogDueAt(dateText) {
  const normalized = String(dateText || '').trim()
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null
  const date = new Date(`${normalized}T23:59:59+08:00`)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function parseDeadlineConfig(conditionConfig) {
  const config = conditionConfig && typeof conditionConfig === 'object' ? conditionConfig : {}
  const deadline = config.deadline && typeof config.deadline === 'object' ? config.deadline : {}
  const offsetType = String(deadline.offset_type || 'before').toLowerCase() === 'after' ? 'after' : 'before'
  const offsetUnit = String(deadline.offset_unit || 'hour').toLowerCase() === 'day' ? 'day' : 'hour'
  const offsetValue = Math.max(0, toInt(deadline.offset_value, 2))
  const windowMinutes = Math.max(1, toInt(deadline.window_minutes, 5))

  return {
    target: String(deadline.target || 'worklog').toLowerCase(),
    offsetType,
    offsetUnit,
    offsetValue,
    windowMinutes,
  }
}

function computeDeadlineTriggerAtMs(dueAtMs, config) {
  const unitMs = config.offsetUnit === 'day' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000
  const delta = config.offsetValue * unitMs
  return config.offsetType === 'after' ? dueAtMs + delta : dueAtMs - delta
}

async function listCandidateWorklogsForDeadline() {
  const [rows] = await pool.query(
    `SELECT
       l.id,
       l.user_id,
       l.assigned_by_user_id,
       l.item_type_id,
       l.description,
       COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
       l.demand_id,
       l.phase_key,
       DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
       d.name AS demand_name,
       bg.id AS business_line_id,
       bg.item_name AS business_line_name,
       COALESCE(NULLIF(u.real_name, ''), u.username) AS user_name,
       COALESCE(NULLIF(au.real_name, ''), au.username) AS assigned_by_name
     FROM work_logs l
     LEFT JOIN users u ON u.id = l.user_id
     LEFT JOIN users au ON au.id = l.assigned_by_user_id
     LEFT JOIN work_demands d ON d.id = l.demand_id
     LEFT JOIN config_dict_items bg
       ON bg.type_key = 'business_group'
      AND bg.item_code = d.business_group_code
     WHERE l.expected_completion_date IS NOT NULL
       AND COALESCE(l.log_status, 'IN_PROGRESS') IN ('TODO', 'IN_PROGRESS')
       AND l.expected_completion_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND DATE_ADD(CURDATE(), INTERVAL 60 DAY)`,
  )
  return rows || []
}

async function dispatchDeadlineRules(rules) {
  const nowMs = Date.now()
  const worklogs = await listCandidateWorklogsForDeadline()
  if (worklogs.length === 0) return

  for (const rule of rules) {
    const eventType = String(rule?.event_type || '').toLowerCase()
    if (!DEADLINE_EVENT_TYPES.has(eventType)) continue

    const conditionConfig = safeJsonParse(rule?.trigger_condition_json, null) || {}
    const triggerMode = String(conditionConfig?.trigger_mode || '').toLowerCase()
    if (triggerMode !== 'deadline') continue

    const deadlineConfig = parseDeadlineConfig(conditionConfig)
    if (deadlineConfig.target !== 'worklog') continue

    for (const log of worklogs) {
      const dueAt = normalizeWorklogDueAt(log.expected_completion_date)
      if (!dueAt) continue

      const triggerAtMs = computeDeadlineTriggerAtMs(dueAt.getTime(), deadlineConfig)
      const windowEndMs = triggerAtMs + deadlineConfig.windowMinutes * 60 * 1000
      if (nowMs < triggerAtMs || nowMs > windowEndMs) continue

      const triggerKey = `deadline:${eventType}:log:${Number(log.id)}:${String(triggerAtMs)}`
      const acquired = await acquireTriggerCursor(rule.id, triggerKey, { expireHours: 240 })
      if (!acquired) continue

      const hoursToDeadline = Number(((dueAt.getTime() - nowMs) / (60 * 60 * 1000)).toFixed(1))

      await NotificationEvent.processEvent({
        eventType,
        data: {
          business_line_id: Number(log?.business_line_id || 0) || null,
          business_line_name: String(log?.business_line_name || ''),
          worklog_id: Number(log?.id || 0) || null,
          log_id: Number(log?.id || 0) || null,
          task_title: String(log?.description || ''),
          task_content: String(log?.description || ''),
          status: String(log?.log_status || ''),
          assignee_id: Number(log?.user_id || 0) || null,
          assignee_name: String(log?.user_name || ''),
          user_id: Number(log?.user_id || 0) || null,
          user_name: String(log?.user_name || ''),
          assigned_by_user_id: Number(log?.assigned_by_user_id || 0) || null,
          assigned_by_name: String(log?.assigned_by_name || ''),
          demand_id: String(log?.demand_id || ''),
          demand_name: String(log?.demand_name || ''),
          phase_key: String(log?.phase_key || ''),
          expected_completion_date: String(log?.expected_completion_date || ''),
          hours_to_deadline: hoursToDeadline,
          __deadline_context: {
            matched: true,
            trigger_key: triggerKey,
            trigger_time: new Date(nowMs).toISOString(),
            due_at: dueAt.toISOString(),
            offset_type: deadlineConfig.offsetType,
            offset_unit: deadlineConfig.offsetUnit,
            offset_value: deadlineConfig.offsetValue,
          },
        },
        operatorUserId: null,
        targetRuleIds: [Number(rule.id)],
      })
    }
  }
}

async function runTick() {
  if (running) return
  running = true
  try {
    await ensureTriggerCursorTable()
    await cleanupExpiredCursor()
    const rules = await listEnabledRulesForScheduler()
    if (rules.length === 0) return

    await dispatchScheduleRules(rules)
    await dispatchDeadlineRules(rules)
  } catch (error) {
    console.error('通知调度执行失败:', error)
  } finally {
    running = false
  }
}

function start() {
  if (timer) return
  const intervalMs = Math.max(30000, toInt(process.env.NOTIFICATION_SCHEDULER_INTERVAL_MS, 60000))
  timer = setInterval(() => {
    runTick()
  }, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
  runTick()
  console.log(`通知调度器已启动，扫描间隔 ${intervalMs}ms`)
}

function stop() {
  if (!timer) return
  clearInterval(timer)
  timer = null
  console.log('通知调度器已停止')
}

module.exports = {
  start,
  stop,
}
