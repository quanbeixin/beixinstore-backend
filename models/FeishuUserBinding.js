const pool = require('../utils/db')
const FeishuContact = require('./FeishuContact')

let tableReady = false

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
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

function normalizeSnapshotRow(row = {}) {
  return {
    ...row,
    id: Number(row.id || 0),
    is_active: Number(row.is_active) === 1 ? 1 : 0,
    is_resigned: Number(row.is_resigned) === 1 ? 1 : 0,
    department_names: parseJsonText(row.department_names_text, []),
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

function normalizeBindingRow(row = {}) {
  return {
    ...row,
    id: Number(row.id || 0),
    user_id: Number(row.user_id || 0),
    feishu_snapshot_id: row.feishu_snapshot_id ? Number(row.feishu_snapshot_id) : null,
    created_by: row.created_by ? Number(row.created_by) : null,
    updated_by: row.updated_by ? Number(row.updated_by) : null,
    snapshot_is_active: Number(row.snapshot_is_active) === 1 ? 1 : 0,
    snapshot_is_resigned: Number(row.snapshot_is_resigned) === 1 ? 1 : 0,
    snapshot_department_names: parseJsonText(row.snapshot_department_names_text, []),
  }
}

async function ensureTable() {
  if (tableReady) return

  // Ensure the snapshot table exists before any later LEFT JOIN usage.
  await FeishuContact.getSummary()

  await pool.query(
    `CREATE TABLE IF NOT EXISTS feishu_user_bindings (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      feishu_snapshot_id BIGINT DEFAULT NULL,
      open_id VARCHAR(191) NOT NULL,
      union_id VARCHAR(191) DEFAULT NULL,
      feishu_user_id VARCHAR(191) DEFAULT NULL,
      created_by INT DEFAULT NULL,
      updated_by INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_feishu_binding_user_id (user_id),
      UNIQUE KEY uk_feishu_binding_open_id (open_id),
      KEY idx_feishu_binding_snapshot_id (feishu_snapshot_id),
      KEY idx_feishu_binding_union_id (union_id),
      KEY idx_feishu_binding_user_open (feishu_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  )

  const alterStatements = [
    [
      'user_id',
      'ALTER TABLE feishu_user_bindings ADD COLUMN user_id INT NOT NULL AFTER id',
    ],
    [
      'feishu_snapshot_id',
      'ALTER TABLE feishu_user_bindings ADD COLUMN feishu_snapshot_id BIGINT DEFAULT NULL AFTER user_id',
    ],
    [
      'open_id',
      'ALTER TABLE feishu_user_bindings ADD COLUMN open_id VARCHAR(191) NOT NULL AFTER feishu_snapshot_id',
    ],
    [
      'union_id',
      'ALTER TABLE feishu_user_bindings ADD COLUMN union_id VARCHAR(191) DEFAULT NULL AFTER open_id',
    ],
    [
      'feishu_user_id',
      'ALTER TABLE feishu_user_bindings ADD COLUMN feishu_user_id VARCHAR(191) DEFAULT NULL AFTER union_id',
    ],
    [
      'created_by',
      'ALTER TABLE feishu_user_bindings ADD COLUMN created_by INT DEFAULT NULL AFTER feishu_user_id',
    ],
    [
      'updated_by',
      'ALTER TABLE feishu_user_bindings ADD COLUMN updated_by INT DEFAULT NULL AFTER created_by',
    ],
  ]

  for (const [columnName, sql] of alterStatements) {
    if (!(await columnExists('feishu_user_bindings', columnName))) {
      await pool.query(sql)
    }
  }

  const indexStatements = [
    ['uk_feishu_binding_user_id', 'CREATE UNIQUE INDEX uk_feishu_binding_user_id ON feishu_user_bindings(user_id)'],
    ['uk_feishu_binding_open_id', 'CREATE UNIQUE INDEX uk_feishu_binding_open_id ON feishu_user_bindings(open_id)'],
    ['idx_feishu_binding_snapshot_id', 'CREATE INDEX idx_feishu_binding_snapshot_id ON feishu_user_bindings(feishu_snapshot_id)'],
    ['idx_feishu_binding_union_id', 'CREATE INDEX idx_feishu_binding_union_id ON feishu_user_bindings(union_id)'],
    ['idx_feishu_binding_user_open', 'CREATE INDEX idx_feishu_binding_user_open ON feishu_user_bindings(feishu_user_id)'],
  ]

  for (const [indexName, sql] of indexStatements) {
    if (!(await indexExists('feishu_user_bindings', indexName))) {
      await pool.query(sql)
    }
  }

  tableReady = true
}

const FeishuUserBinding = {
  async getSummary() {
    await ensureTable()

    const [[userRow]] = await pool.query('SELECT COUNT(*) AS total FROM users')
    const [[bindingRow]] = await pool.query('SELECT COUNT(*) AS total FROM feishu_user_bindings')

    const totalUsers = Number(userRow?.total || 0)
    const boundTotal = Number(bindingRow?.total || 0)

    return {
      total_users: totalUsers,
      bound_total: boundTotal,
      unbound_total: Math.max(totalUsers - boundTotal, 0),
    }
  },

  async listByUserIds(userIds = []) {
    await ensureTable()

    const normalizedIds = [...new Set((Array.isArray(userIds) ? userIds : []).map(toPositiveInt).filter(Boolean))]
    if (normalizedIds.length === 0) {
      return { list: [], map: {} }
    }

    const placeholders = normalizedIds.map(() => '?').join(', ')
    const [rows] = await pool.query(
      `SELECT
         b.id,
         b.user_id,
         b.feishu_snapshot_id,
         b.open_id,
         b.union_id,
         b.feishu_user_id,
         b.created_by,
         b.updated_by,
         b.created_at,
         b.updated_at,
         s.name AS snapshot_name,
         s.nickname AS snapshot_nickname,
         s.job_title AS snapshot_job_title,
         s.department_names_text AS snapshot_department_names_text,
         s.last_synced_at AS snapshot_last_synced_at,
         s.is_active AS snapshot_is_active,
         s.is_resigned AS snapshot_is_resigned
       FROM feishu_user_bindings b
       LEFT JOIN feishu_user_snapshots s
         ON s.id = b.feishu_snapshot_id
       WHERE b.user_id IN (${placeholders})
       ORDER BY b.updated_at DESC, b.id DESC`,
      normalizedIds,
    )

    const list = rows.map((row) => normalizeBindingRow(row))
    const map = {}

    list.forEach((item) => {
      map[item.user_id] = item
    })

    return { list, map }
  },

  async getByUserId(userId) {
    await ensureTable()

    const normalizedUserId = toPositiveInt(userId)
    if (!normalizedUserId) return null

    const [rows] = await pool.query(
      `SELECT
         b.id,
         b.user_id,
         b.feishu_snapshot_id,
         b.open_id,
         b.union_id,
         b.feishu_user_id,
         b.created_by,
         b.updated_by,
         b.created_at,
         b.updated_at,
         s.name AS snapshot_name,
         s.nickname AS snapshot_nickname,
         s.job_title AS snapshot_job_title,
         s.department_names_text AS snapshot_department_names_text,
         s.last_synced_at AS snapshot_last_synced_at,
         s.is_active AS snapshot_is_active,
         s.is_resigned AS snapshot_is_resigned
       FROM feishu_user_bindings b
       LEFT JOIN feishu_user_snapshots s
         ON s.id = b.feishu_snapshot_id
       WHERE b.user_id = ?
       LIMIT 1`,
      [normalizedUserId],
    )

    return rows[0] ? normalizeBindingRow(rows[0]) : null
  },

  async listAvailableSnapshots() {
    await ensureTable()

    const [rows] = await pool.query(
      `SELECT
         s.id,
         s.open_id,
         s.union_id,
         s.feishu_user_id,
         s.name,
         s.nickname,
         s.job_title,
         s.department_names_text,
         s.last_synced_at,
         s.is_active,
         s.is_resigned
       FROM feishu_user_snapshots s
       LEFT JOIN feishu_user_bindings b
         ON b.open_id = s.open_id
       WHERE b.id IS NULL
       ORDER BY s.last_synced_at DESC, s.id DESC`,
    )

    return rows.map((row) => normalizeSnapshotRow(row))
  },

  async getByOpenId(openId) {
    await ensureTable()

    const normalizedOpenId = String(openId || '').trim()
    if (!normalizedOpenId) return null

    const [rows] = await pool.query(
      `SELECT id, user_id, feishu_snapshot_id, open_id, union_id, feishu_user_id, created_at, updated_at
       FROM feishu_user_bindings
       WHERE open_id = ?
       LIMIT 1`,
      [normalizedOpenId],
    )

    return rows[0] ? normalizeBindingRow(rows[0]) : null
  },

  async upsertBinding({ userId, feishuSnapshotId, openId, unionId, feishuUserId, operatorUserId = null }) {
    await ensureTable()

    const normalizedUserId = toPositiveInt(userId)
    const normalizedSnapshotId = toPositiveInt(feishuSnapshotId)
    const normalizedOpenId = String(openId || '').trim()
    const normalizedUnionId = String(unionId || '').trim() || null
    const normalizedFeishuUserId = String(feishuUserId || '').trim() || null
    const normalizedOperatorId = toPositiveInt(operatorUserId)

    if (!normalizedUserId || !normalizedSnapshotId || !normalizedOpenId) {
      const error = new Error('绑定参数不完整')
      error.code = 'BINDING_PARAM_INVALID'
      throw error
    }

    const existingByOpenId = await this.getByOpenId(normalizedOpenId)
    if (existingByOpenId && existingByOpenId.user_id !== normalizedUserId) {
      const error = new Error('该飞书账号已绑定其他系统用户，请先解绑后重试')
      error.code = 'BINDING_OPEN_ID_CONFLICT'
      throw error
    }

    await pool.query(
      `INSERT INTO feishu_user_bindings (
         user_id,
         feishu_snapshot_id,
         open_id,
         union_id,
         feishu_user_id,
         created_by,
         updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         feishu_snapshot_id = VALUES(feishu_snapshot_id),
         open_id = VALUES(open_id),
         union_id = VALUES(union_id),
         feishu_user_id = VALUES(feishu_user_id),
         updated_by = VALUES(updated_by)`,
      [
        normalizedUserId,
        normalizedSnapshotId,
        normalizedOpenId,
        normalizedUnionId,
        normalizedFeishuUserId,
        normalizedOperatorId,
        normalizedOperatorId,
      ],
    )

    return this.getByUserId(normalizedUserId)
  },

  async removeByUserId(userId) {
    await ensureTable()

    const normalizedUserId = toPositiveInt(userId)
    if (!normalizedUserId) return 0

    const [result] = await pool.query('DELETE FROM feishu_user_bindings WHERE user_id = ?', [normalizedUserId])
    return Number(result?.affectedRows || 0)
  },
}

module.exports = FeishuUserBinding
