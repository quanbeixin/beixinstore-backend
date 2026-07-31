const pool = require('../utils/db')

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const SCHEDULE_TYPES = new Set(['ONCE', 'DAILY', 'WEEKLY'])
const LOG_TYPES = new Set(['SCHEDULED', 'TEST'])

let ensureTablesPromise = null
let tablesReady = false

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName],
  )
  return rows.length > 0
}

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function toTinyBool(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 1 || value === '1' || value === 'true') return 1
  if (value === false || value === 0 || value === '0' || value === 'false') return 0
  return fallback
}

function normalizeText(value, maxLength = 0) {
  const text = String(value || '').trim()
  if (!text) return ''
  return maxLength > 0 ? text.slice(0, maxLength) : text
}

function normalizeNullableText(value, maxLength = 0) {
  return normalizeText(value, maxLength) || null
}

function normalizeImageUrls(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim().startsWith('[')
      ? safeJsonParse(value, [])
      : String(value || '').split(/[\n,]/)
  return Array.from(
    new Set(
      (Array.isArray(source) ? source : [])
        .map((item) => normalizeText(item, 1000))
        .filter(Boolean),
    ),
  ).slice(0, 9)
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

function toJsonString(value, fallback = {}) {
  try {
    return JSON.stringify(value === undefined ? fallback : value)
  } catch {
    return JSON.stringify(fallback)
  }
}

function normalizeDateTime(value, fallback = null) {
  if (value === undefined) return fallback
  if (value === null || value === '') return null
  if (value instanceof Date) {
    const parsed = value
    if (Number.isNaN(parsed.getTime())) return fallback
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    const hh = String(parsed.getHours()).padStart(2, '0')
    const mm = String(parsed.getMinutes()).padStart(2, '0')
    const ss = String(parsed.getSeconds()).padStart(2, '0')
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
  }

  const text = String(value).trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(text)) return `${text}:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(text)) return text

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return fallback
  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, '0')
  const d = String(parsed.getDate()).padStart(2, '0')
  const hh = String(parsed.getHours()).padStart(2, '0')
  const mm = String(parsed.getMinutes()).padStart(2, '0')
  const ss = String(parsed.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
}

function escapeLike(value) {
  return String(value || '').trim().replace(/[\\%_]/g, '\\$&')
}

function normalizeWeekdays(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',')
  return Array.from(
    new Set(
      source
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 1 && item <= 7),
    ),
  ).sort((a, b) => a - b)
}

function parseScheduleTime(value) {
  const text = String(value || '').trim()
  const match = text.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function formatDateTimeFromParts(date, hour, minute) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
}

function getLocalNow() {
  return new Date()
}

function parseLocalDateTime(value) {
  const text = normalizeDateTime(value)
  if (!text) return null
  const parsed = new Date(text.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function computeNextRunAt({ scheduleType, scheduleTime, scheduleOnceAt, scheduleWeekdays }, fromDate = getLocalNow()) {
  if (scheduleType === 'ONCE') {
    const onceDate = parseLocalDateTime(scheduleOnceAt)
    if (!onceDate || onceDate.getTime() <= fromDate.getTime()) return null
    return normalizeDateTime(scheduleOnceAt)
  }

  const time = parseScheduleTime(scheduleTime)
  if (!time) return null
  const [hour, minute] = time.split(':').map((item) => Number(item))

  if (scheduleType === 'DAILY') {
    const candidate = new Date(fromDate)
    candidate.setHours(hour, minute, 0, 0)
    if (candidate.getTime() <= fromDate.getTime()) candidate.setDate(candidate.getDate() + 1)
    return formatDateTimeFromParts(candidate, hour, minute)
  }

  if (scheduleType === 'WEEKLY') {
    const weekdays = normalizeWeekdays(scheduleWeekdays)
    if (weekdays.length === 0) return null
    const currentWeekday = fromDate.getDay() === 0 ? 7 : fromDate.getDay()
    for (let offset = 0; offset <= 7; offset += 1) {
      const candidate = new Date(fromDate)
      candidate.setDate(candidate.getDate() + offset)
      candidate.setHours(hour, minute, 0, 0)
      const weekday = ((currentWeekday + offset - 1) % 7) + 1
      if (weekdays.includes(weekday) && candidate.getTime() > fromDate.getTime()) {
        return formatDateTimeFromParts(candidate, hour, minute)
      }
    }
  }

  return null
}

async function ensureTables() {
  if (tablesReady) return
  if (ensureTablesPromise) return ensureTablesPromise

  ensureTablesPromise = (async () => {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS culture_push_configs (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         config_name VARCHAR(128) NOT NULL,
         enabled TINYINT(1) NOT NULL DEFAULT 1,
         target_chat_id VARCHAR(128) NOT NULL,
         target_chat_name VARCHAR(255) NULL,
         schedule_type VARCHAR(32) NOT NULL DEFAULT 'DAILY',
         schedule_time VARCHAR(8) NULL,
         schedule_weekdays_json JSON NULL,
         schedule_once_at DATETIME NULL,
         message_title VARCHAR(255) NOT NULL,
         message_content TEXT NOT NULL,
         image_url VARCHAR(1000) NULL,
         image_urls_json JSON NULL,
         link_text VARCHAR(80) NULL,
         link_url VARCHAR(1000) NULL,
         link_prefix VARCHAR(1000) NULL,
         remark VARCHAR(500) NULL,
         last_sent_at DATETIME NULL,
         next_run_at DATETIME NULL,
         last_status VARCHAR(32) NULL,
         last_error_message VARCHAR(1000) NULL,
         created_by BIGINT UNSIGNED NULL,
         updated_by BIGINT UNSIGNED NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         deleted_at DATETIME NULL,
         PRIMARY KEY (id),
         KEY idx_culture_push_enabled_next (enabled, next_run_at),
         KEY idx_culture_push_deleted (deleted_at)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )

    if (!(await columnExists('culture_push_configs', 'image_urls_json'))) {
      await pool.query('ALTER TABLE culture_push_configs ADD COLUMN image_urls_json JSON NULL AFTER image_url')
    }

    await pool.query(
      `CREATE TABLE IF NOT EXISTS culture_push_logs (
         id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         config_id BIGINT UNSIGNED NOT NULL,
         send_type VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
         scheduled_at DATETIME NULL,
         sent_at DATETIME NULL,
         status VARCHAR(32) NOT NULL,
         error_message VARCHAR(1000) NULL,
         request_payload_json JSON NULL,
         response_payload_json JSON NULL,
         created_by BIGINT UNSIGNED NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         KEY idx_culture_push_logs_config (config_id, created_at),
         KEY idx_culture_push_logs_status (status, created_at)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )

    tablesReady = true
  })()

  try {
    await ensureTablesPromise
  } finally {
    ensureTablesPromise = null
  }
}

function mapRow(row) {
  if (!row) return null
  const scheduleWeekdays = normalizeWeekdays(safeJsonParse(row.schedule_weekdays_json, []))
  const imageUrls = normalizeImageUrls(safeJsonParse(row.image_urls_json, []))
  const fallbackImageUrl = normalizeText(row.image_url, 1000)
  const finalImageUrls = imageUrls.length > 0 ? imageUrls : normalizeImageUrls(fallbackImageUrl)
  return {
    id: Number(row.id),
    config_name: row.config_name || '',
    enabled: Boolean(row.enabled),
    target_chat_id: row.target_chat_id || '',
    target_chat_name: row.target_chat_name || '',
    schedule_type: row.schedule_type || 'DAILY',
    schedule_time: row.schedule_time || '',
    schedule_weekdays: scheduleWeekdays,
    schedule_once_at: row.schedule_once_at || null,
    message_title: row.message_title || '',
    message_content: row.message_content || '',
    image_url: finalImageUrls[0] || '',
    image_urls: finalImageUrls,
    link_text: row.link_text || '',
    link_url: row.link_url || '',
    link_prefix: row.link_prefix || '',
    remark: row.remark || '',
    last_sent_at: row.last_sent_at || null,
    next_run_at: row.next_run_at || null,
    last_status: row.last_status || '',
    last_error_message: row.last_error_message || '',
    created_by: row.created_by ? Number(row.created_by) : null,
    updated_by: row.updated_by ? Number(row.updated_by) : null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

function mapLogRow(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    config_id: Number(row.config_id),
    send_type: row.send_type || 'SCHEDULED',
    scheduled_at: row.scheduled_at || null,
    sent_at: row.sent_at || null,
    status: row.status || '',
    error_message: row.error_message || '',
    request_payload: safeJsonParse(row.request_payload_json, {}),
    response_payload: safeJsonParse(row.response_payload_json, {}),
    created_by: row.created_by ? Number(row.created_by) : null,
    created_at: row.created_at || null,
  }
}

function validatePayload(payload = {}, existing = {}) {
  const configName = normalizeText(payload.config_name, 128)
  if (!configName) {
    const err = new Error('config_name_required')
    err.statusCode = 400
    err.message = '配置名称不能为空'
    throw err
  }

  const targetChatId = normalizeText(payload.target_chat_id, 128)
  if (!targetChatId) {
    const err = new Error('target_chat_required')
    err.statusCode = 400
    err.message = '请选择飞书群'
    throw err
  }

  const scheduleType = normalizeText(payload.schedule_type || existing.schedule_type || 'DAILY', 32).toUpperCase()
  if (!SCHEDULE_TYPES.has(scheduleType)) {
    const err = new Error('schedule_type_invalid')
    err.statusCode = 400
    err.message = '发送频率不合法'
    throw err
  }

  const scheduleTime = scheduleType === 'ONCE' ? null : parseScheduleTime(payload.schedule_time || existing.schedule_time)
  if (scheduleType !== 'ONCE' && !scheduleTime) {
    const err = new Error('schedule_time_required')
    err.statusCode = 400
    err.message = '请选择发送时间'
    throw err
  }

  const scheduleWeekdays = scheduleType === 'WEEKLY' ? normalizeWeekdays(payload.schedule_weekdays) : []
  if (scheduleType === 'WEEKLY' && scheduleWeekdays.length === 0) {
    const err = new Error('schedule_weekdays_required')
    err.statusCode = 400
    err.message = '请选择每周发送日期'
    throw err
  }

  const scheduleOnceAt = scheduleType === 'ONCE' ? normalizeDateTime(payload.schedule_once_at) : null
  if (scheduleType === 'ONCE' && !scheduleOnceAt) {
    const err = new Error('schedule_once_at_required')
    err.statusCode = 400
    err.message = '请选择一次性发送时间'
    throw err
  }

  const title = normalizeText(payload.message_title, 255)
  const content = normalizeText(payload.message_content, 10000)
  if (!title || !content) {
    const err = new Error('message_required')
    err.statusCode = 400
    err.message = '标题和主内容不能为空'
    throw err
  }

  const enabled = toTinyBool(payload.enabled, existing.enabled === undefined ? 1 : Number(existing.enabled || 0))
  const nextRunAt = enabled
    ? computeNextRunAt({ scheduleType, scheduleTime, scheduleOnceAt, scheduleWeekdays })
    : null
  if (enabled && !nextRunAt) {
    const err = new Error('next_run_at_invalid')
    err.statusCode = 400
    err.message = '下次发送时间需晚于当前时间'
    throw err
  }

  return {
    config_name: configName,
    enabled,
    target_chat_id: targetChatId,
    target_chat_name: normalizeNullableText(payload.target_chat_name, 255),
    schedule_type: scheduleType,
    schedule_time: scheduleTime,
    schedule_weekdays: scheduleWeekdays,
    schedule_once_at: scheduleOnceAt,
    message_title: title,
    message_content: content,
    image_urls: normalizeImageUrls(payload.image_urls || payload.image_url),
    image_url: normalizeImageUrls(payload.image_urls || payload.image_url)[0] || null,
    link_text: normalizeNullableText(payload.link_text, 80),
    link_url: normalizeNullableText(payload.link_url, 1000),
    link_prefix: null,
    remark: normalizeNullableText(payload.remark, 500),
    next_run_at: nextRunAt,
  }
}

const CulturePushConfig = {
  async ensureTables() {
    await ensureTables()
  },

  computeNextRunAt,

  async list(filters = {}) {
    await ensureTables()
    const page = Math.max(1, Number(filters.page || 1))
    const pageSize = Math.min(Math.max(1, Number(filters.pageSize || DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)
    const offset = (page - 1) * pageSize
    const keyword = normalizeText(filters.keyword, 100)
    const enabled = filters.enabled === undefined || filters.enabled === '' ? null : toTinyBool(filters.enabled, 0)
    const where = ['deleted_at IS NULL']
    const params = []

    if (keyword) {
      where.push('(config_name LIKE ? OR message_title LIKE ? OR target_chat_name LIKE ?)')
      const like = `%${escapeLike(keyword)}%`
      params.push(like, like, like)
    }
    if (enabled !== null) {
      where.push('enabled = ?')
      params.push(enabled)
    }

    const whereSql = `WHERE ${where.join(' AND ')}`
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM culture_push_configs ${whereSql}`, params)
    const [rows] = await pool.query(
      `SELECT * FROM culture_push_configs
       ${whereSql}
       ORDER BY updated_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )

    return {
      list: rows.map(mapRow),
      pagination: {
        page,
        pageSize,
        total: Number(countRows?.[0]?.total || 0),
      },
    }
  },

  async getById(id) {
    await ensureTables()
    const configId = toPositiveInt(id)
    if (!configId) return null
    const [rows] = await pool.query('SELECT * FROM culture_push_configs WHERE id = ? AND deleted_at IS NULL LIMIT 1', [configId])
    return mapRow(rows?.[0])
  },

  async create(payload, userId) {
    await ensureTables()
    const normalized = validatePayload(payload)
    const [result] = await pool.query(
      `INSERT INTO culture_push_configs (
         config_name, enabled, target_chat_id, target_chat_name, schedule_type, schedule_time,
         schedule_weekdays_json, schedule_once_at, message_title, message_content, image_url, image_urls_json,
         link_text, link_url, link_prefix, remark, next_run_at, created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.config_name,
        normalized.enabled,
        normalized.target_chat_id,
        normalized.target_chat_name,
        normalized.schedule_type,
        normalized.schedule_time,
        toJsonString(normalized.schedule_weekdays, []),
        normalized.schedule_once_at,
        normalized.message_title,
        normalized.message_content,
        normalized.image_url,
        toJsonString(normalized.image_urls, []),
        normalized.link_text,
        normalized.link_url,
        normalized.link_prefix,
        normalized.remark,
        normalized.next_run_at,
        userId || null,
        userId || null,
      ],
    )
    return this.getById(result.insertId)
  },

  async update(id, payload, userId) {
    await ensureTables()
    const configId = toPositiveInt(id)
    if (!configId) return null
    const existing = await this.getById(configId)
    if (!existing) return null
    const normalized = validatePayload(payload, existing)
    await pool.query(
      `UPDATE culture_push_configs
       SET config_name = ?, enabled = ?, target_chat_id = ?, target_chat_name = ?,
           schedule_type = ?, schedule_time = ?, schedule_weekdays_json = CAST(? AS JSON),
           schedule_once_at = ?, message_title = ?, message_content = ?, image_url = ?, image_urls_json = CAST(? AS JSON),
           link_text = ?, link_url = ?, link_prefix = ?, remark = ?, next_run_at = ?, updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        normalized.config_name,
        normalized.enabled,
        normalized.target_chat_id,
        normalized.target_chat_name,
        normalized.schedule_type,
        normalized.schedule_time,
        toJsonString(normalized.schedule_weekdays, []),
        normalized.schedule_once_at,
        normalized.message_title,
        normalized.message_content,
        normalized.image_url,
        toJsonString(normalized.image_urls, []),
        normalized.link_text,
        normalized.link_url,
        normalized.link_prefix,
        normalized.remark,
        normalized.next_run_at,
        userId || null,
        configId,
      ],
    )
    return this.getById(configId)
  },

  async updateEnabled(id, enabled, userId) {
    await ensureTables()
    const config = await this.getById(id)
    if (!config) return null
    const nextEnabled = toTinyBool(enabled, config.enabled ? 1 : 0)
    const nextRunAt = nextEnabled
      ? computeNextRunAt({
          scheduleType: config.schedule_type,
          scheduleTime: config.schedule_time,
          scheduleOnceAt: config.schedule_once_at,
          scheduleWeekdays: config.schedule_weekdays,
        })
      : null
    await pool.query(
      `UPDATE culture_push_configs
       SET enabled = ?, next_run_at = ?, updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [nextEnabled, nextRunAt, userId || null, Number(config.id)],
    )
    return this.getById(config.id)
  },

  async remove(id, userId) {
    await ensureTables()
    const configId = toPositiveInt(id)
    if (!configId) return 0
    const [result] = await pool.query(
      `UPDATE culture_push_configs
       SET deleted_at = NOW(), enabled = 0, next_run_at = NULL, updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [userId || null, configId],
    )
    return Number(result?.affectedRows || 0)
  },

  async listDue(limit = 20) {
    await ensureTables()
    const [rows] = await pool.query(
      `SELECT * FROM culture_push_configs
       WHERE deleted_at IS NULL
         AND enabled = 1
         AND next_run_at IS NOT NULL
         AND next_run_at <= NOW()
       ORDER BY next_run_at ASC, id ASC
       LIMIT ?`,
      [Math.min(Math.max(1, Number(limit || 20)), 100)],
    )
    return rows.map(mapRow)
  },

  async markSent(config, result = {}, { sendType = 'SCHEDULED', scheduledAt = null, requestPayload = {}, operatorUserId = null } = {}) {
    await ensureTables()
    const normalizedSendType = LOG_TYPES.has(sendType) ? sendType : 'SCHEDULED'
    const shouldAdvanceSchedule = normalizedSendType !== 'TEST'
    const status = result?.success ? (result?.skipped ? 'SKIPPED' : 'SUCCESS') : 'FAILED'
    const errorMessage = result?.error_message || null
    const sentAt = normalizeDateTime(new Date())
    const nextRunAt = shouldAdvanceSchedule
      ? computeNextRunAt({
          scheduleType: config.schedule_type,
          scheduleTime: config.schedule_time,
          scheduleOnceAt: config.schedule_once_at,
          scheduleWeekdays: config.schedule_weekdays,
        }, new Date())
      : config.next_run_at
    const nextEnabled = shouldAdvanceSchedule && config.schedule_type === 'ONCE' ? 0 : Number(config.enabled ? 1 : 0)

    await pool.query(
      `INSERT INTO culture_push_logs (
         config_id, send_type, scheduled_at, sent_at, status, error_message,
         request_payload_json, response_payload_json, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)`,
      [
        Number(config.id),
        normalizedSendType,
        scheduledAt || config.next_run_at || null,
        sentAt,
        status,
        errorMessage,
        toJsonString(requestPayload, {}),
        toJsonString(result, {}),
        operatorUserId || null,
      ],
    )

    await pool.query(
      `UPDATE culture_push_configs
       SET last_sent_at = ?, last_status = ?, last_error_message = ?, next_run_at = ?, enabled = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [sentAt, status, errorMessage, nextRunAt, nextEnabled, Number(config.id)],
    )

    return this.getById(config.id)
  },

  async listLogs(configId, filters = {}) {
    await ensureTables()
    const id = toPositiveInt(configId)
    if (!id) return { list: [], pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 } }
    const page = Math.max(1, Number(filters.page || 1))
    const pageSize = Math.min(Math.max(1, Number(filters.pageSize || DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)
    const offset = (page - 1) * pageSize
    const [countRows] = await pool.query('SELECT COUNT(*) AS total FROM culture_push_logs WHERE config_id = ?', [id])
    const [rows] = await pool.query(
      `SELECT * FROM culture_push_logs
       WHERE config_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [id, pageSize, offset],
    )
    return {
      list: rows.map(mapLogRow),
      pagination: {
        page,
        pageSize,
        total: Number(countRows?.[0]?.total || 0),
      },
    }
  },
}

module.exports = CulturePushConfig
