const pool = require('../utils/db')

function normalizeText(value, maxLength = 255) {
  if (value === undefined || value === null) return ''
  return String(value).trim().slice(0, maxLength)
}

function toNullableText(value, maxLength = 255) {
  const text = normalizeText(value, maxLength)
  return text || null
}

function toNullableInt(value) {
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  if (!Number.isInteger(num)) return null
  return num
}

function toTinyInt(value, defaultValue = 1) {
  if (value === undefined || value === null || value === '') return defaultValue
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

function toJsonString(value, fallback = null) {
  if (value === undefined) return JSON.stringify(fallback)
  if (value === null || value === '') return JSON.stringify(fallback)
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

function parseJsonArray(value, fallback = []) {
  const parsed = safeJsonParse(value, fallback)
  return Array.isArray(parsed) ? parsed : fallback
}

function normalizeReceiverConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

function normalizePositiveIntArray(values) {
  if (!Array.isArray(values)) return []
  return Array.from(
    new Set(
      values
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  )
}

async function getRoleLabelMap(roleIds) {
  const ids = normalizePositiveIntArray(roleIds)
  if (ids.length === 0) return new Map()

  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await pool.query(
    `SELECT id, name
     FROM roles
     WHERE id IN (${placeholders})`,
    ids,
  )

  const map = new Map()
  rows.forEach((row) => {
    map.set(Number(row.id), row.name || null)
  })
  return map
}

async function getUserLabelMap(userIds) {
  const ids = normalizePositiveIntArray(userIds)
  if (ids.length === 0) return new Map()

  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await pool.query(
    `SELECT id, username, real_name
     FROM users
     WHERE id IN (${placeholders})`,
    ids,
  )

  const map = new Map()
  rows.forEach((row) => {
    const label = row.real_name ? `${row.real_name} (${row.username || row.id})` : row.username || String(row.id)
    map.set(Number(row.id), label)
  })
  return map
}

async function syncLegacyRuleReceivers(ruleId, receiverConfig) {
  const normalizedConfig = normalizeReceiverConfig(receiverConfig)
  const roleIds = normalizePositiveIntArray(normalizedConfig.roles)
  const userIds = normalizePositiveIntArray(normalizedConfig.user_ids || normalizedConfig.users)

  const roleLabelMap = await getRoleLabelMap(roleIds)
  const userLabelMap = await getUserLabelMap(userIds)

  await pool.query('DELETE FROM notification_rule_receivers WHERE rule_id = ?', [ruleId])
  if (roleIds.length === 0 && userIds.length === 0) return

  const roleValues = roleIds.map((roleId) => [
    Number(ruleId),
    'ROLE',
    String(roleId),
    roleLabelMap.get(roleId) || null,
    1,
  ])

  const userValues = userIds.map((userId) => [
    Number(ruleId),
    'USER',
    String(userId),
    userLabelMap.get(userId) || null,
    1,
  ])

  const values = [...roleValues, ...userValues]
  await pool.query(
    `INSERT INTO notification_rule_receivers (
       rule_id,
       receiver_type,
       receiver_value,
       receiver_label,
       enabled
     ) VALUES ?`,
    [values],
  )
}

async function getLegacyRuleReceiversMap(ruleIds) {
  const ids = normalizePositiveIntArray(ruleIds)
  if (ids.length === 0) return new Map()

  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await pool.query(
    `SELECT
       rule_id,
       receiver_type,
       receiver_value,
       receiver_label
     FROM notification_rule_receivers
     WHERE enabled = 1
       AND rule_id IN (${placeholders})
     ORDER BY id ASC`,
    ids,
  )

  const map = new Map()
  rows.forEach((row) => {
    const ruleId = Number(row.rule_id)
    const current = map.get(ruleId) || {
      roles: [],
      users: [],
      departments: [],
      dynamic: [],
    }

    const receiverType = String(row.receiver_type || '').toUpperCase()
    const rawValue = row.receiver_value
    const numericValue = Number(rawValue)
    const value = Number.isInteger(numericValue) && numericValue > 0 ? numericValue : rawValue

    if (receiverType === 'ROLE') current.roles.push(value)
    else if (receiverType === 'USER') current.users.push(value)
    else if (receiverType === 'DEPT') current.departments.push(value)
    else if (receiverType === 'DYNAMIC') current.dynamic.push(value)

    map.set(ruleId, current)
  })

  return map
}

function inferReceiverType(receiverConfig, fallback = 'role') {
  if (!receiverConfig || typeof receiverConfig !== 'object') return fallback
  if (Array.isArray(receiverConfig.users) && receiverConfig.users.length > 0) return 'user'
  if (Array.isArray(receiverConfig.user_ids) && receiverConfig.user_ids.length > 0) return 'user'
  if (Array.isArray(receiverConfig.roles) && receiverConfig.roles.length > 0) return 'role'
  return fallback
}

function mapRuleRowLegacy(row, receiverConfig = {}) {
  const channels = parseJsonArray(row.channels_json, [])
  const firstChannel = channels[0] || 'FEISHU'
  const receiverType = inferReceiverType(receiverConfig, 'role')

  return {
    id: Number(row.id),
    rule_code: row.rule_code,
    rule_name: row.rule_name,
    business_line_id: row.biz_line_id === null ? null : Number(row.biz_line_id),
    scene_code: row.event_type,
    channel_type: String(firstChannel || 'feishu').toLowerCase(),
    template_id: null,
    receiver_type: receiverType,
    receiver_config_json: receiverConfig,
    message_title: row.message_title || '',
    message_content: row.message_content || '',
    condition_config_json: safeJsonParse(row.trigger_condition_json, null),
    dedup_config_json: null,
    retry_count: 0,
    retry_interval_sec: null,
    is_enabled: Number(row.enabled) === 1 ? 1 : 0,
    priority: 0,
    remark: null,
    created_by: row.created_by === null ? null : Number(row.created_by),
    updated_by: row.updated_by === null ? null : Number(row.updated_by),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

const NotificationRule = {
  async getById(id) {
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
         enabled,
         created_by,
         updated_by,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM notification_rules
       WHERE id = ?
       LIMIT 1`,
      [id],
    )

    if (!rows[0]) return null
    const receiverMap = await getLegacyRuleReceiversMap([Number(id)])
    return mapRuleRowLegacy(rows[0], receiverMap.get(Number(id)) || {})
  },

  async getByCode(ruleCode) {
    const [rows] = await pool.query(
      `SELECT id, rule_code
       FROM notification_rules
       WHERE rule_code = ?
       LIMIT 1`,
      [ruleCode],
    )
    return rows[0] || null
  },

  async list({ keyword = '', sceneCode = '', businessLineId = null, isEnabled } = {}) {
    const whereParts = []
    const params = []

    const normalizedKeyword = normalizeText(keyword, 100)
    const normalizedScene = normalizeText(sceneCode, 64)

    if (normalizedKeyword) {
      whereParts.push('(rule_code LIKE ? OR rule_name LIKE ? OR event_type LIKE ?)')
      const likeKeyword = `%${normalizedKeyword}%`
      params.push(likeKeyword, likeKeyword, likeKeyword)
    }

    if (normalizedScene) {
      whereParts.push('event_type = ?')
      params.push(normalizedScene)
    }

    if (businessLineId !== null && businessLineId !== undefined) {
      whereParts.push('biz_line_id = ?')
      params.push(Number(businessLineId))
    }

    if (isEnabled !== undefined) {
      whereParts.push('enabled = ?')
      params.push(toTinyInt(isEnabled, 1))
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''
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
         enabled,
         created_by,
         updated_by,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM notification_rules
       ${whereSql}
       ORDER BY id DESC`,
      params,
    )

    const mappedRows = rows.map((row) => ({ ...row, id: Number(row.id) }))
    const receiverMap = await getLegacyRuleReceiversMap(mappedRows.map((item) => item.id))
    return mappedRows.map((item) => mapRuleRowLegacy(item, receiverMap.get(item.id) || {}))
  },

  async create(payload) {
    const [result] = await pool.query(
      `INSERT INTO notification_rules (
         rule_code,
         rule_name,
         biz_domain,
         biz_line_id,
         event_type,
         template_id,
         message_title,
         message_content,
         channels_json,
         frequency,
         trigger_condition_type,
         trigger_condition_json,
         enabled,
         created_by,
         updated_by
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, CAST(? AS JSON), ?, ?, ?
       )`,
      [
        normalizeText(payload.rule_code, 64),
        normalizeText(payload.rule_name, 128),
        normalizeText(payload.biz_domain || 'default', 64),
        toNullableInt(payload.business_line_id) ?? 0,
        normalizeText(payload.scene_code, 64),
        null,
        toNullableText(payload.message_title, 255),
        toNullableText(payload.message_content, 5000),
        toJsonString([String(payload.channel_type || 'feishu').toUpperCase()], ['FEISHU']),
        normalizeText(payload.frequency || 'IMMEDIATE', 16).toUpperCase(),
        'ALWAYS',
        toJsonString(payload.condition_config_json, null),
        toTinyInt(payload.is_enabled, 1),
        toNullableInt(payload.created_by) ?? 0,
        toNullableInt(payload.updated_by) ?? 0,
      ],
    )

    await syncLegacyRuleReceivers(result.insertId, payload.receiver_config_json)
    return Number(result.insertId)
  },

  async update(id, payload) {
    const [result] = await pool.query(
      `UPDATE notification_rules
       SET
         rule_code = ?,
         rule_name = ?,
         biz_domain = ?,
         biz_line_id = ?,
         event_type = ?,
         template_id = ?,
         message_title = ?,
         message_content = ?,
         channels_json = CAST(? AS JSON),
         trigger_condition_json = CAST(? AS JSON),
         enabled = ?,
         updated_by = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        normalizeText(payload.rule_code, 64),
        normalizeText(payload.rule_name, 128),
        normalizeText(payload.biz_domain || 'default', 64),
        toNullableInt(payload.business_line_id) ?? 0,
        normalizeText(payload.scene_code, 64),
        null,
        toNullableText(payload.message_title, 255),
        toNullableText(payload.message_content, 5000),
        toJsonString([String(payload.channel_type || 'feishu').toUpperCase()], ['FEISHU']),
        toJsonString(payload.condition_config_json, null),
        toTinyInt(payload.is_enabled, 1),
        toNullableInt(payload.updated_by) ?? 0,
        id,
      ],
    )

    await syncLegacyRuleReceivers(id, payload.receiver_config_json)
    return Number(result.affectedRows || 0)
  },

  async remove(id) {
    await pool.query('DELETE FROM notification_rule_receivers WHERE rule_id = ?', [id])
    const [result] = await pool.query('DELETE FROM notification_rules WHERE id = ?', [id])
    return Number(result.affectedRows || 0)
  },
}

module.exports = NotificationRule
