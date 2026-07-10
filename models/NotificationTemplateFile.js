const pool = require('../utils/db')

const DEFAULT_TEMPLATE_ROWS = [
  {
    template_key: 'data_safety_file',
    template_name: '报名-数据安全文件',
    description: '用于维护报名-数据安全文件模板',
    sort_order: 1,
  },
  {
    template_key: 'product_config_link',
    template_name: '商品信息配置链接',
    description: '用于维护固定的商品信息配置链接地址',
    sort_order: 2,
  },
]

let tableReady = false

function normalizeText(value, maxLength = 255) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function normalizeTemplateKey(value) {
  const text = String(value || '').trim().toLowerCase()
  return text ? text.replace(/[^a-z0-9_-]+/g, '_').slice(0, 64) : ''
}

function normalizeOptionalInt(value, fallback = 0) {
  const num = Number.parseInt(value, 10)
  return Number.isFinite(num) ? num : fallback
}

function normalizeOptionalNullableText(value, maxLength = 1000) {
  const text = normalizeText(value, maxLength)
  return text || null
}

function mapRow(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    template_key: row.template_key || '',
    template_name: row.template_name || '',
    description: row.description || '',
    sort_order: Number(row.sort_order || 0),
    file_name: row.file_name || '',
    mime_type: row.mime_type || '',
    storage_provider: row.storage_provider || '',
    bucket_name: row.bucket_name || '',
    object_key: row.object_key || '',
    object_url: row.object_url || '',
    created_by: row.created_by ? Number(row.created_by) : null,
    updated_by: row.updated_by ? Number(row.updated_by) : null,
    updated_by_name: row.updated_by_name || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

async function ensureTable() {
  if (tableReady) return

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_template_files (
      id BIGINT NOT NULL AUTO_INCREMENT,
      template_key VARCHAR(64) NOT NULL,
      template_name VARCHAR(100) NOT NULL,
      description VARCHAR(255) DEFAULT NULL,
      sort_order INT NOT NULL DEFAULT 100,
      file_name VARCHAR(255) DEFAULT NULL,
      mime_type VARCHAR(100) DEFAULT NULL,
      storage_provider VARCHAR(32) DEFAULT NULL,
      bucket_name VARCHAR(100) DEFAULT NULL,
      object_key VARCHAR(500) DEFAULT NULL,
      object_url VARCHAR(1000) DEFAULT NULL,
      created_by BIGINT DEFAULT NULL,
      updated_by BIGINT DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_notification_template_files_key (template_key),
      KEY idx_notification_template_files_sort (sort_order, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  for (const row of DEFAULT_TEMPLATE_ROWS) {
    await pool.query(
      `INSERT IGNORE INTO notification_template_files
       (template_key, template_name, description, sort_order)
       VALUES (?, ?, ?, ?)`,
      [row.template_key, row.template_name, row.description, row.sort_order],
    )
  }

  tableReady = true
}

const NotificationTemplateFile = {
  async list() {
    await ensureTable()
    const [rows] = await pool.query(
      `SELECT
         ntf.id,
         ntf.template_key,
         ntf.template_name,
         ntf.description,
         ntf.sort_order,
         ntf.file_name,
         ntf.mime_type,
         ntf.storage_provider,
         ntf.bucket_name,
         ntf.object_key,
         ntf.object_url,
         ntf.created_by,
         ntf.updated_by,
         COALESCE(NULLIF(user.real_name, ''), user.username) AS updated_by_name,
         DATE_FORMAT(ntf.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(ntf.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM notification_template_files ntf
       LEFT JOIN users user
         ON user.id = ntf.updated_by
       ORDER BY ntf.sort_order ASC, ntf.id ASC`,
    )
    return rows.map(mapRow)
  },

  async getByKey(templateKey) {
    await ensureTable()
    const normalizedKey = normalizeTemplateKey(templateKey)
    if (!normalizedKey) return null

    const [rows] = await pool.query(
      `SELECT
         ntf.id,
         ntf.template_key,
         ntf.template_name,
         ntf.description,
         ntf.sort_order,
         ntf.file_name,
         ntf.mime_type,
         ntf.storage_provider,
         ntf.bucket_name,
         ntf.object_key,
         ntf.object_url,
         ntf.created_by,
         ntf.updated_by,
         COALESCE(NULLIF(user.real_name, ''), user.username) AS updated_by_name,
         DATE_FORMAT(ntf.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(ntf.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM notification_template_files ntf
       LEFT JOIN users user
         ON user.id = ntf.updated_by
       WHERE ntf.template_key = ?
       LIMIT 1`,
      [normalizedKey],
    )
    return mapRow(rows[0])
  },

  async upsert(templateKey, payload = {}, userId = null) {
    await ensureTable()
    const normalizedKey = normalizeTemplateKey(templateKey)
    if (!normalizedKey) {
      const error = new Error('template_key_invalid')
      error.statusCode = 400
      error.message = '模板编码不合法'
      throw error
    }

    const templateName = normalizeText(payload.template_name, 100)
    if (!templateName) {
      const error = new Error('template_name_required')
      error.statusCode = 400
      error.message = '模板名称不能为空'
      throw error
    }

    const sortOrder = normalizeOptionalInt(payload.sort_order, 100)
    const description = normalizeOptionalNullableText(payload.description, 255)
    const fileName = normalizeOptionalNullableText(payload.file_name, 255)
    const mimeType = normalizeOptionalNullableText(payload.mime_type, 100)
    const storageProvider = normalizeOptionalNullableText(payload.storage_provider, 32)
    const bucketName = normalizeOptionalNullableText(payload.bucket_name, 100)
    const objectKey = normalizeOptionalNullableText(payload.object_key, 500)
    const objectUrl = normalizeOptionalNullableText(payload.object_url, 1000)

    await pool.query(
      `INSERT INTO notification_template_files (
         template_key,
         template_name,
         description,
         sort_order,
         file_name,
         mime_type,
         storage_provider,
         bucket_name,
         object_key,
         object_url,
         created_by,
         updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         template_name = VALUES(template_name),
         description = VALUES(description),
         sort_order = VALUES(sort_order),
         file_name = VALUES(file_name),
         mime_type = VALUES(mime_type),
         storage_provider = VALUES(storage_provider),
         bucket_name = VALUES(bucket_name),
         object_key = VALUES(object_key),
         object_url = VALUES(object_url),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [
        normalizedKey,
        templateName,
        description,
        sortOrder,
        fileName,
        mimeType,
        storageProvider,
        bucketName,
        objectKey,
        objectUrl,
        userId || null,
        userId || null,
      ],
    )

    return this.getByKey(normalizedKey)
  },

  async deleteByKey(templateKey) {
    await ensureTable()
    const normalizedKey = normalizeTemplateKey(templateKey)
    if (!normalizedKey) return 0

    const [result] = await pool.query('DELETE FROM notification_template_files WHERE template_key = ?', [normalizedKey])
    return Number(result?.affectedRows || 0)
  },
}

module.exports = NotificationTemplateFile
