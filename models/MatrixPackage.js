const pool = require('../utils/db')

const STATUS_DICT_KEY = 'matrix_package_status'
const HEALTH_DICT_KEY = 'matrix_package_health'

function toPositiveInt(value) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function normalizeText(value, maxLength = 255) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function normalizeOptionalCode(value) {
  const text = String(value || '').trim().toUpperCase()
  return text || null
}

function mapRow(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    package_name: row.package_name || '',
    platform: row.platform || '',
    owner_name: row.owner_name || '',
    status_code: row.status_code || '',
    status_name: row.status_name || row.status_code || '',
    status_color: row.status_color || '',
    health_code: row.health_code || '',
    health_name: row.health_name || row.health_code || '',
    health_color: row.health_color || '',
    progress: Number(row.progress || 0),
    current_stage: row.current_stage || '',
    risk_note: row.risk_note || '',
    remark: row.remark || '',
    created_by: row.created_by ? Number(row.created_by) : null,
    updated_by: row.updated_by ? Number(row.updated_by) : null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

async function validateDictCode(typeKey, itemCode, { allowNull = false } = {}) {
  const normalized = normalizeOptionalCode(itemCode)
  if (!normalized) return allowNull

  const [rows] = await pool.query(
    `SELECT item_code
     FROM config_dict_items
     WHERE type_key = ? AND item_code = ? AND enabled = 1
     LIMIT 1`,
    [typeKey, normalized],
  )
  return rows.length > 0
}

function buildWhere(filters = {}) {
  const clauses = ['mp.deleted_at IS NULL']
  const params = []

  const keyword = normalizeText(filters.keyword, 100)
  if (keyword) {
    clauses.push('(mp.package_name LIKE ? OR mp.platform LIKE ? OR mp.owner_name LIKE ? OR mp.current_stage LIKE ?)')
    const like = `%${keyword}%`
    params.push(like, like, like, like)
  }

  const statusCode = normalizeOptionalCode(filters.status_code)
  if (statusCode) {
    clauses.push('mp.status_code = ?')
    params.push(statusCode)
  }

  const healthCode = normalizeOptionalCode(filters.health_code)
  if (healthCode) {
    clauses.push('mp.health_code = ?')
    params.push(healthCode)
  }

  const ownerName = normalizeText(filters.owner_name, 80)
  if (ownerName) {
    clauses.push('mp.owner_name LIKE ?')
    params.push(`%${ownerName}%`)
  }

  return {
    whereSql: clauses.join(' AND '),
    params,
  }
}

const MatrixPackage = {
  STATUS_DICT_KEY,
  HEALTH_DICT_KEY,

  async list(filters = {}) {
    const page = Math.max(toPositiveInt(filters.page) || 1, 1)
    const pageSize = Math.min(Math.max(toPositiveInt(filters.pageSize) || 20, 1), 100)
    const offset = (page - 1) * pageSize
    const { whereSql, params } = buildWhere(filters)

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM matrix_packages mp
       WHERE ${whereSql}`,
      params,
    )

    const [summaryRows] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN mp.status_code = 'DELIVERING' THEN 1 ELSE 0 END) AS delivering,
         SUM(CASE WHEN mp.status_code IN ('HOT_STANDBY', 'COLD_STANDBY') THEN 1 ELSE 0 END) AS standby,
         SUM(CASE WHEN mp.status_code = 'BANNED' OR mp.health_code = 'ABNORMAL' THEN 1 ELSE 0 END) AS abnormal
       FROM matrix_packages mp
       WHERE ${whereSql}`,
      params,
    )

    const [rows] = await pool.query(
      `SELECT
         mp.id,
         mp.package_name,
         mp.platform,
         mp.owner_name,
         mp.status_code,
         statusDict.item_name AS status_name,
         statusDict.color AS status_color,
         mp.health_code,
         healthDict.item_name AS health_name,
         healthDict.color AS health_color,
         mp.progress,
         mp.current_stage,
         mp.risk_note,
         mp.remark,
         mp.created_by,
         mp.updated_by,
         DATE_FORMAT(mp.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(mp.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM matrix_packages mp
       LEFT JOIN config_dict_items statusDict
         ON statusDict.type_key = ?
        AND statusDict.item_code = mp.status_code
       LEFT JOIN config_dict_items healthDict
         ON healthDict.type_key = ?
        AND healthDict.item_code = mp.health_code
       WHERE ${whereSql}
       ORDER BY
         CASE mp.status_code
           WHEN 'DELIVERING' THEN 1
           WHEN 'IN_REVIEW' THEN 2
           WHEN 'HOT_STANDBY' THEN 3
           WHEN 'COLD_STANDBY' THEN 4
           WHEN 'BANNED' THEN 5
           WHEN 'ARCHIVED' THEN 6
           ELSE 9
         END ASC,
         CASE mp.health_code
           WHEN 'ABNORMAL' THEN 1
           WHEN 'WATCH' THEN 2
           WHEN 'NORMAL' THEN 3
           ELSE 9
         END ASC,
         mp.updated_at DESC,
         mp.id DESC
       LIMIT ? OFFSET ?`,
      [STATUS_DICT_KEY, HEALTH_DICT_KEY, ...params, pageSize, offset],
    )

    return {
      list: rows.map(mapRow),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
      summary: {
        total: Number(summaryRows[0]?.total || 0),
        delivering: Number(summaryRows[0]?.delivering || 0),
        standby: Number(summaryRows[0]?.standby || 0),
        abnormal: Number(summaryRows[0]?.abnormal || 0),
      },
    }
  },

  async getById(id) {
    const packageId = toPositiveInt(id)
    if (!packageId) return null

    const [rows] = await pool.query(
      `SELECT
         mp.id,
         mp.package_name,
         mp.platform,
         mp.owner_name,
         mp.status_code,
         statusDict.item_name AS status_name,
         statusDict.color AS status_color,
         mp.health_code,
         healthDict.item_name AS health_name,
         healthDict.color AS health_color,
         mp.progress,
         mp.current_stage,
         mp.risk_note,
         mp.remark,
         mp.created_by,
         mp.updated_by,
         DATE_FORMAT(mp.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(mp.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM matrix_packages mp
       LEFT JOIN config_dict_items statusDict
         ON statusDict.type_key = ?
        AND statusDict.item_code = mp.status_code
       LEFT JOIN config_dict_items healthDict
         ON healthDict.type_key = ?
        AND healthDict.item_code = mp.health_code
       WHERE mp.id = ? AND mp.deleted_at IS NULL
       LIMIT 1`,
      [STATUS_DICT_KEY, HEALTH_DICT_KEY, packageId],
    )
    return mapRow(rows[0])
  },

  async create(payload, userId) {
    const normalized = await this.normalizePayload(payload)
    const [result] = await pool.query(
      `INSERT INTO matrix_packages
       (package_name, platform, owner_name, status_code, health_code, progress, current_stage, risk_note, remark, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.package_name,
        normalized.platform,
        normalized.owner_name,
        normalized.status_code,
        normalized.health_code,
        normalized.progress,
        normalized.current_stage,
        normalized.risk_note,
        normalized.remark,
        userId || null,
        userId || null,
      ],
    )
    return this.getById(result.insertId)
  },

  async update(id, payload, userId) {
    const packageId = toPositiveInt(id)
    if (!packageId) return null

    const existing = await this.getById(packageId)
    if (!existing) return null

    const normalized = await this.normalizePayload(payload)
    await pool.query(
      `UPDATE matrix_packages
       SET package_name = ?,
           platform = ?,
           owner_name = ?,
           status_code = ?,
           health_code = ?,
           progress = ?,
           current_stage = ?,
           risk_note = ?,
           remark = ?,
           updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        normalized.package_name,
        normalized.platform,
        normalized.owner_name,
        normalized.status_code,
        normalized.health_code,
        normalized.progress,
        normalized.current_stage,
        normalized.risk_note,
        normalized.remark,
        userId || null,
        packageId,
      ],
    )
    return this.getById(packageId)
  },

  async softDelete(id, userId) {
    const packageId = toPositiveInt(id)
    if (!packageId) return 0
    const [result] = await pool.query(
      `UPDATE matrix_packages
       SET deleted_at = NOW(), updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [userId || null, packageId],
    )
    return result.affectedRows
  },

  async normalizePayload(payload = {}) {
    const packageName = normalizeText(payload.package_name, 120)
    if (!packageName) {
      const err = new Error('package_name_required')
      err.statusCode = 400
      err.message = '矩阵包名称不能为空'
      throw err
    }

    const statusCode = normalizeOptionalCode(payload.status_code)
    if (!(await validateDictCode(STATUS_DICT_KEY, statusCode))) {
      const err = new Error('status_code_invalid')
      err.statusCode = 400
      err.message = '包状态不合法'
      throw err
    }

    const healthCode = statusCode === 'DELIVERING' ? normalizeOptionalCode(payload.health_code) : null
    if (statusCode === 'DELIVERING' && !(await validateDictCode(HEALTH_DICT_KEY, healthCode))) {
      const err = new Error('health_code_invalid')
      err.statusCode = 400
      err.message = '投放中的矩阵包必须选择健康度'
      throw err
    }

    const rawProgress = Number(payload.progress)
    const progress = Number.isFinite(rawProgress) ? Math.min(Math.max(Math.round(rawProgress), 0), 100) : 0

    return {
      package_name: packageName,
      platform: normalizeText(payload.platform, 40),
      owner_name: normalizeText(payload.owner_name, 80),
      status_code: statusCode,
      health_code: healthCode,
      progress,
      current_stage: normalizeText(payload.current_stage, 120),
      risk_note: normalizeText(payload.risk_note, 500),
      remark: normalizeText(payload.remark, 500),
    }
  },
}

module.exports = MatrixPackage
