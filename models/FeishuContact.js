const pool = require('../utils/db')

let tableReady = false

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeText(value, maxLength = 0) {
  const text = String(value || '').trim()
  if (!text) return ''
  return maxLength > 0 ? text.slice(0, maxLength) : text
}

function parseJsonText(value, fallback) {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  )
  return Number(rows[0]?.total || 0) > 0
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [tableName, indexName],
  )
  return Number(rows[0]?.total || 0) > 0
}

async function ensureTable() {
  if (tableReady) return

  await pool.query(
    `CREATE TABLE IF NOT EXISTS feishu_user_snapshots (
      id BIGINT NOT NULL AUTO_INCREMENT,
      app_id VARCHAR(128) NOT NULL DEFAULT '',
      tenant_key VARCHAR(128) DEFAULT NULL,
      open_id VARCHAR(191) NOT NULL,
      union_id VARCHAR(191) DEFAULT NULL,
      feishu_user_id VARCHAR(191) DEFAULT NULL,
      name VARCHAR(128) NOT NULL DEFAULT '',
      en_name VARCHAR(128) DEFAULT NULL,
      nickname VARCHAR(128) DEFAULT NULL,
      mobile VARCHAR(64) DEFAULT NULL,
      email VARCHAR(191) DEFAULT NULL,
      enterprise_email VARCHAR(191) DEFAULT NULL,
      employee_no VARCHAR(64) DEFAULT NULL,
      avatar_url VARCHAR(500) DEFAULT NULL,
      department_ids_text LONGTEXT DEFAULT NULL,
      department_names_text LONGTEXT DEFAULT NULL,
      primary_department_id VARCHAR(191) DEFAULT NULL,
      primary_department_name VARCHAR(191) DEFAULT NULL,
      leader_user_id VARCHAR(191) DEFAULT NULL,
      job_title VARCHAR(191) DEFAULT NULL,
      city VARCHAR(128) DEFAULT NULL,
      country VARCHAR(64) DEFAULT NULL,
      work_station VARCHAR(191) DEFAULT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      is_resigned TINYINT(1) NOT NULL DEFAULT 0,
      status_text LONGTEXT DEFAULT NULL,
      raw_payload LONGTEXT DEFAULT NULL,
      sync_batch_id VARCHAR(64) DEFAULT NULL,
      last_synced_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_feishu_open_id (open_id),
      KEY idx_feishu_union_id (union_id),
      KEY idx_feishu_user_id (feishu_user_id),
      KEY idx_feishu_mobile (mobile),
      KEY idx_feishu_email (email),
      KEY idx_feishu_active (is_active, is_resigned),
      KEY idx_feishu_sync_time (last_synced_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  )

  const alterStatements = [
    [
      'app_id',
      "ALTER TABLE feishu_user_snapshots ADD COLUMN app_id VARCHAR(128) NOT NULL DEFAULT '' AFTER id",
    ],
    [
      'tenant_key',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN tenant_key VARCHAR(128) DEFAULT NULL AFTER app_id',
    ],
    [
      'open_id',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN open_id VARCHAR(191) NOT NULL AFTER tenant_key',
    ],
    [
      'union_id',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN union_id VARCHAR(191) DEFAULT NULL AFTER open_id',
    ],
    [
      'feishu_user_id',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN feishu_user_id VARCHAR(191) DEFAULT NULL AFTER union_id',
    ],
    [
      'name',
      "ALTER TABLE feishu_user_snapshots ADD COLUMN name VARCHAR(128) NOT NULL DEFAULT '' AFTER feishu_user_id",
    ],
    [
      'en_name',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN en_name VARCHAR(128) DEFAULT NULL AFTER name',
    ],
    [
      'nickname',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN nickname VARCHAR(128) DEFAULT NULL AFTER en_name',
    ],
    [
      'mobile',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN mobile VARCHAR(64) DEFAULT NULL AFTER nickname',
    ],
    [
      'email',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN email VARCHAR(191) DEFAULT NULL AFTER mobile',
    ],
    [
      'enterprise_email',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN enterprise_email VARCHAR(191) DEFAULT NULL AFTER email',
    ],
    [
      'employee_no',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN employee_no VARCHAR(64) DEFAULT NULL AFTER enterprise_email',
    ],
    [
      'avatar_url',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN avatar_url VARCHAR(500) DEFAULT NULL AFTER employee_no',
    ],
    [
      'department_ids_text',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN department_ids_text LONGTEXT DEFAULT NULL AFTER avatar_url',
    ],
    [
      'department_names_text',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN department_names_text LONGTEXT DEFAULT NULL AFTER department_ids_text',
    ],
    [
      'primary_department_id',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN primary_department_id VARCHAR(191) DEFAULT NULL AFTER department_names_text',
    ],
    [
      'primary_department_name',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN primary_department_name VARCHAR(191) DEFAULT NULL AFTER primary_department_id',
    ],
    [
      'leader_user_id',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN leader_user_id VARCHAR(191) DEFAULT NULL AFTER primary_department_name',
    ],
    [
      'job_title',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN job_title VARCHAR(191) DEFAULT NULL AFTER leader_user_id',
    ],
    [
      'city',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN city VARCHAR(128) DEFAULT NULL AFTER job_title',
    ],
    [
      'country',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN country VARCHAR(64) DEFAULT NULL AFTER city',
    ],
    [
      'work_station',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN work_station VARCHAR(191) DEFAULT NULL AFTER country',
    ],
    [
      'is_active',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER work_station',
    ],
    [
      'is_resigned',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN is_resigned TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active',
    ],
    [
      'status_text',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN status_text LONGTEXT DEFAULT NULL AFTER is_resigned',
    ],
    [
      'raw_payload',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN raw_payload LONGTEXT DEFAULT NULL AFTER status_text',
    ],
    [
      'sync_batch_id',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN sync_batch_id VARCHAR(64) DEFAULT NULL AFTER raw_payload',
    ],
    [
      'last_synced_at',
      'ALTER TABLE feishu_user_snapshots ADD COLUMN last_synced_at DATETIME DEFAULT NULL AFTER sync_batch_id',
    ],
  ]

  for (const [columnName, sql] of alterStatements) {
    if (!(await columnExists('feishu_user_snapshots', columnName))) {
      await pool.query(sql)
    }
  }

  const indexStatements = [
    ['uk_feishu_open_id', 'CREATE UNIQUE INDEX uk_feishu_open_id ON feishu_user_snapshots(open_id)'],
    ['idx_feishu_union_id', 'CREATE INDEX idx_feishu_union_id ON feishu_user_snapshots(union_id)'],
    ['idx_feishu_user_id', 'CREATE INDEX idx_feishu_user_id ON feishu_user_snapshots(feishu_user_id)'],
    ['idx_feishu_mobile', 'CREATE INDEX idx_feishu_mobile ON feishu_user_snapshots(mobile)'],
    ['idx_feishu_email', 'CREATE INDEX idx_feishu_email ON feishu_user_snapshots(email)'],
    ['idx_feishu_active', 'CREATE INDEX idx_feishu_active ON feishu_user_snapshots(is_active, is_resigned)'],
    ['idx_feishu_sync_time', 'CREATE INDEX idx_feishu_sync_time ON feishu_user_snapshots(last_synced_at)'],
  ]

  for (const [indexName, sql] of indexStatements) {
    if (!(await indexExists('feishu_user_snapshots', indexName))) {
      await pool.query(sql)
    }
  }

  tableReady = true
}

function normalizeSnapshotRow(row = {}) {
  return {
    ...row,
    id: Number(row.id || 0),
    is_active: Number(row.is_active) === 1 ? 1 : 0,
    is_resigned: Number(row.is_resigned) === 1 ? 1 : 0,
    department_ids: parseJsonText(row.department_ids_text, []),
    department_names: parseJsonText(row.department_names_text, []),
    status: parseJsonText(row.status_text, {}),
    raw_payload: parseJsonText(row.raw_payload, null),
  }
}

function buildKeywordClause(keyword) {
  const text = normalizeText(keyword, 100)
  if (!text) {
    return {
      clause: '',
      params: [],
    }
  }

  const likeValue = `%${text}%`
  return {
    clause: ` AND (
      name LIKE ?
      OR mobile LIKE ?
      OR email LIKE ?
      OR enterprise_email LIKE ?
      OR open_id LIKE ?
      OR feishu_user_id LIKE ?
      OR employee_no LIKE ?
    )`,
    params: [likeValue, likeValue, likeValue, likeValue, likeValue, likeValue, likeValue],
  }
}

function buildStatusClause(status) {
  const value = normalizeText(status, 32).toUpperCase()
  if (!value || value === 'ALL') {
    return { clause: '', params: [] }
  }
  if (value === 'ACTIVE') {
    return { clause: ' AND is_resigned = 0 AND is_active = 1', params: [] }
  }
  if (value === 'INACTIVE') {
    return { clause: ' AND is_resigned = 0 AND is_active = 0', params: [] }
  }
  if (value === 'RESIGNED') {
    return { clause: ' AND is_resigned = 1', params: [] }
  }
  return { clause: '', params: [] }
}

const FeishuContact = {
  async listSnapshots(options = {}) {
    await ensureTable()

    const page = toPositiveInt(options.page) || 1
    const pageSize = Math.min(toPositiveInt(options.pageSize) || 20, 200)
    const offset = (page - 1) * pageSize
    const keywordClause = buildKeywordClause(options.keyword)
    const statusClause = buildStatusClause(options.status)

    const whereClause = `WHERE 1 = 1${keywordClause.clause}${statusClause.clause}`
    const params = [...keywordClause.params, ...statusClause.params]

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM feishu_user_snapshots
       ${whereClause}`,
      params,
    )

    const [rows] = await pool.query(
      `SELECT
         id,
         app_id,
         tenant_key,
         open_id,
         union_id,
         feishu_user_id,
         name,
         en_name,
         nickname,
         mobile,
         email,
         enterprise_email,
         employee_no,
         avatar_url,
         department_ids_text,
         department_names_text,
         primary_department_id,
         primary_department_name,
         leader_user_id,
         job_title,
         city,
         country,
         work_station,
         is_active,
         is_resigned,
         status_text,
         sync_batch_id,
         last_synced_at,
         created_at,
         updated_at
       FROM feishu_user_snapshots
       ${whereClause}
       ORDER BY last_synced_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )

    return {
      list: rows.map((row) => normalizeSnapshotRow(row)),
      total: Number(countRows[0]?.total || 0),
      page,
      pageSize,
    }
  },

  async getSnapshotById(id) {
    await ensureTable()
    const normalizedId = toPositiveInt(id)
    if (!normalizedId) return null

    const [rows] = await pool.query(
      `SELECT
         id,
         app_id,
         tenant_key,
         open_id,
         union_id,
         feishu_user_id,
         name,
         en_name,
         nickname,
         mobile,
         email,
         enterprise_email,
         employee_no,
         avatar_url,
         department_ids_text,
         department_names_text,
         primary_department_id,
         primary_department_name,
         leader_user_id,
         job_title,
         city,
         country,
         work_station,
         is_active,
         is_resigned,
         status_text,
         raw_payload,
         sync_batch_id,
         last_synced_at,
         created_at,
         updated_at
       FROM feishu_user_snapshots
       WHERE id = ?
       LIMIT 1`,
      [normalizedId],
    )

    return rows[0] ? normalizeSnapshotRow(rows[0]) : null
  },

  async getSummary() {
    await ensureTable()
    const [rows] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN is_resigned = 0 AND is_active = 1 THEN 1 ELSE 0 END) AS active_total,
         SUM(CASE WHEN is_resigned = 0 AND is_active = 0 THEN 1 ELSE 0 END) AS inactive_total,
         SUM(CASE WHEN is_resigned = 1 THEN 1 ELSE 0 END) AS resigned_total,
         MAX(last_synced_at) AS last_synced_at
       FROM feishu_user_snapshots`,
    )

    const row = rows[0] || {}
    return {
      total: Number(row.total || 0),
      active_total: Number(row.active_total || 0),
      inactive_total: Number(row.inactive_total || 0),
      resigned_total: Number(row.resigned_total || 0),
      last_synced_at: row.last_synced_at || null,
    }
  },

  async upsertSnapshots(records = [], options = {}) {
    await ensureTable()
    if (!Array.isArray(records) || records.length === 0) {
      return 0
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      for (const record of records) {
        const departmentIds = Array.isArray(record.department_ids) ? record.department_ids : []
        const departmentNames = Array.isArray(record.department_names) ? record.department_names : []
        const statusPayload =
          record.status && typeof record.status === 'object' && !Array.isArray(record.status)
            ? record.status
            : {}

        await conn.query(
          `INSERT INTO feishu_user_snapshots (
             app_id,
             tenant_key,
             open_id,
             union_id,
             feishu_user_id,
             name,
             en_name,
             nickname,
             mobile,
             email,
             enterprise_email,
             employee_no,
             avatar_url,
             department_ids_text,
             department_names_text,
             primary_department_id,
             primary_department_name,
             leader_user_id,
             job_title,
             city,
             country,
             work_station,
             is_active,
             is_resigned,
             status_text,
             raw_payload,
             sync_batch_id,
             last_synced_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             app_id = VALUES(app_id),
             tenant_key = VALUES(tenant_key),
             union_id = VALUES(union_id),
             feishu_user_id = VALUES(feishu_user_id),
             name = VALUES(name),
             en_name = VALUES(en_name),
             nickname = VALUES(nickname),
             mobile = VALUES(mobile),
             email = VALUES(email),
             enterprise_email = VALUES(enterprise_email),
             employee_no = VALUES(employee_no),
             avatar_url = VALUES(avatar_url),
             department_ids_text = VALUES(department_ids_text),
             department_names_text = VALUES(department_names_text),
             primary_department_id = VALUES(primary_department_id),
             primary_department_name = VALUES(primary_department_name),
             leader_user_id = VALUES(leader_user_id),
             job_title = VALUES(job_title),
             city = VALUES(city),
             country = VALUES(country),
             work_station = VALUES(work_station),
             is_active = VALUES(is_active),
             is_resigned = VALUES(is_resigned),
             status_text = VALUES(status_text),
             raw_payload = VALUES(raw_payload),
             sync_batch_id = VALUES(sync_batch_id),
             last_synced_at = VALUES(last_synced_at)`,
          [
            normalizeText(options.appId, 128),
            normalizeText(options.tenantKey, 128) || null,
            normalizeText(record.open_id, 191),
            normalizeText(record.union_id, 191) || null,
            normalizeText(record.feishu_user_id, 191) || null,
            normalizeText(record.name, 128),
            normalizeText(record.en_name, 128) || null,
            normalizeText(record.nickname, 128) || null,
            normalizeText(record.mobile, 64) || null,
            normalizeText(record.email, 191) || null,
            normalizeText(record.enterprise_email, 191) || null,
            normalizeText(record.employee_no, 64) || null,
            normalizeText(record.avatar_url, 500) || null,
            JSON.stringify(departmentIds),
            JSON.stringify(departmentNames),
            normalizeText(record.primary_department_id, 191) || null,
            normalizeText(record.primary_department_name, 191) || null,
            normalizeText(record.leader_user_id, 191) || null,
            normalizeText(record.job_title, 191) || null,
            normalizeText(record.city, 128) || null,
            normalizeText(record.country, 64) || null,
            normalizeText(record.work_station, 191) || null,
            Number(record.is_active) === 0 ? 0 : 1,
            Number(record.is_resigned) === 1 ? 1 : 0,
            JSON.stringify(statusPayload),
            JSON.stringify(record.raw_payload || {}),
            normalizeText(options.syncBatchId, 64) || null,
            options.syncedAt || null,
          ],
        )
      }

      await conn.commit()
      return records.length
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  },
}

module.exports = FeishuContact
