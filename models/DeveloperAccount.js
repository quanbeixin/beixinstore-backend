const pool = require('../utils/db')

const STATUS_DICT_KEY = 'developer_account_status'
const COMPANY_DICT_KEY = 'developer_company_subject'

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

function normalizeOptionalId(value) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function mapRow(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    company_name: row.company_name || '',
    account_name: row.account_name || '',
    account_id: row.account_id || '',
    status_code: row.status_code || '',
    status_name: row.status_name || row.status_code || '',
    status_color: row.status_color || '',
    owner_user_id: row.owner_user_id ? Number(row.owner_user_id) : null,
    owner_name: row.owner_display_name || row.owner_name || '',
    package_count: Number(row.package_count || 0),
    created_by: row.created_by ? Number(row.created_by) : null,
    updated_by: row.updated_by ? Number(row.updated_by) : null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

async function validateDictCode(typeKey, itemCode) {
  const normalized = normalizeOptionalCode(itemCode)
  if (!normalized) return false

  const [rows] = await pool.query(
    `SELECT item_code
     FROM config_dict_items
     WHERE type_key = ? AND item_code = ? AND enabled = 1
     LIMIT 1`,
    [typeKey, normalized],
  )
  return rows.length > 0
}

async function validateDictName(typeKey, itemName) {
  const normalized = normalizeText(itemName, 120)
  if (!normalized) return false

  const [rows] = await pool.query(
    `SELECT id
     FROM config_dict_items
     WHERE type_key = ? AND item_name = ? AND enabled = 1
     LIMIT 1`,
    [typeKey, normalized],
  )
  return rows.length > 0
}

function buildWhere(filters = {}) {
  const clauses = ['da.deleted_at IS NULL']
  const params = []

  const keyword = normalizeText(filters.keyword, 100)
  if (keyword) {
    clauses.push('(da.company_name LIKE ? OR da.account_name LIKE ? OR da.account_id LIKE ? OR da.owner_name LIKE ? OR ownerUser.real_name LIKE ? OR ownerUser.username LIKE ?)')
    const like = `%${keyword}%`
    params.push(like, like, like, like, like, like)
  }

  const companyName = normalizeText(filters.company_name, 120)
  if (companyName) {
    clauses.push('da.company_name LIKE ?')
    params.push(`%${companyName}%`)
  }

  const statusCode = normalizeOptionalCode(filters.status_code)
  if (statusCode) {
    clauses.push('da.status_code = ?')
    params.push(statusCode)
  }

  const ownerName = normalizeText(filters.owner_name, 80)
  if (ownerName) {
    clauses.push('(da.owner_name LIKE ? OR ownerUser.real_name LIKE ? OR ownerUser.username LIKE ?)')
    const like = `%${ownerName}%`
    params.push(like, like, like)
  }

  return {
    whereSql: clauses.join(' AND '),
    params,
  }
}

const DeveloperAccount = {
  STATUS_DICT_KEY,
  COMPANY_DICT_KEY,

  async list(filters = {}) {
    const page = Math.max(toPositiveInt(filters.page) || 1, 1)
    const pageSize = Math.min(Math.max(toPositiveInt(filters.pageSize) || 20, 1), 100)
    const offset = (page - 1) * pageSize
    const { whereSql, params } = buildWhere(filters)

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM developer_accounts da
       LEFT JOIN users ownerUser
         ON ownerUser.id = da.owner_user_id
       WHERE ${whereSql}`,
      params,
    )

    const [rows] = await pool.query(
      `SELECT
         da.id,
         da.company_name,
         da.account_name,
         da.account_id,
         da.status_code,
         statusDict.item_name AS status_name,
         statusDict.color AS status_color,
         da.owner_user_id,
         COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username) AS owner_display_name,
         da.owner_name,
         COUNT(mp.id) AS package_count,
         da.created_by,
         da.updated_by,
         DATE_FORMAT(da.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(da.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM developer_accounts da
       LEFT JOIN config_dict_items statusDict
         ON statusDict.type_key = ?
        AND statusDict.item_code = da.status_code
       LEFT JOIN users ownerUser
         ON ownerUser.id = da.owner_user_id
       LEFT JOIN matrix_packages mp
         ON mp.developer_account_id = da.id
        AND mp.deleted_at IS NULL
       WHERE ${whereSql}
       GROUP BY da.id
       ORDER BY
         CASE da.status_code
           WHEN 'RISK' THEN 1
           WHEN 'BANNED' THEN 2
           WHEN 'NORMAL' THEN 3
           WHEN 'DISABLED' THEN 4
           ELSE 9
         END ASC,
         da.updated_at DESC,
         da.id DESC
       LIMIT ? OFFSET ?`,
      [STATUS_DICT_KEY, ...params, pageSize, offset],
    )

    return {
      list: rows.map(mapRow),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
    }
  },

  async listOptions() {
    const [rows] = await pool.query(
      `SELECT
         da.id,
         da.company_name,
         da.account_name,
         da.account_id,
         da.status_code,
         statusDict.item_name AS status_name,
         statusDict.color AS status_color,
         da.owner_user_id,
         COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username) AS owner_display_name,
         da.owner_name,
         0 AS package_count,
         da.created_by,
         da.updated_by,
         DATE_FORMAT(da.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(da.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM developer_accounts da
       LEFT JOIN config_dict_items statusDict
         ON statusDict.type_key = ?
        AND statusDict.item_code = da.status_code
       LEFT JOIN users ownerUser
         ON ownerUser.id = da.owner_user_id
       WHERE da.deleted_at IS NULL
       ORDER BY da.company_name ASC, da.account_name ASC, da.id DESC`,
      [STATUS_DICT_KEY],
    )
    return rows.map(mapRow)
  },

  async getById(id) {
    const accountId = toPositiveInt(id)
    if (!accountId) return null

    const [rows] = await pool.query(
      `SELECT
         da.id,
         da.company_name,
         da.account_name,
         da.account_id,
         da.status_code,
         statusDict.item_name AS status_name,
         statusDict.color AS status_color,
         da.owner_user_id,
         COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username) AS owner_display_name,
         da.owner_name,
         COUNT(mp.id) AS package_count,
         da.created_by,
         da.updated_by,
         DATE_FORMAT(da.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(da.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM developer_accounts da
       LEFT JOIN config_dict_items statusDict
         ON statusDict.type_key = ?
        AND statusDict.item_code = da.status_code
       LEFT JOIN users ownerUser
         ON ownerUser.id = da.owner_user_id
       LEFT JOIN matrix_packages mp
         ON mp.developer_account_id = da.id
        AND mp.deleted_at IS NULL
       WHERE da.id = ? AND da.deleted_at IS NULL
       GROUP BY da.id
       LIMIT 1`,
      [STATUS_DICT_KEY, accountId],
    )
    return mapRow(rows[0])
  },

  async exists(id) {
    const accountId = toPositiveInt(id)
    if (!accountId) return false
    const [rows] = await pool.query(
      `SELECT id
       FROM developer_accounts
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [accountId],
    )
    return rows.length > 0
  },

  async create(payload, userId) {
    const normalized = await this.normalizePayload(payload)
    const [result] = await pool.query(
      `INSERT INTO developer_accounts
       (company_name, account_name, account_id, status_code, owner_user_id, owner_name, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.company_name,
        normalized.account_name,
        normalized.account_id,
        normalized.status_code,
        normalized.owner_user_id,
        normalized.owner_name,
        userId || null,
        userId || null,
      ],
    )
    return this.getById(result.insertId)
  },

  async update(id, payload, userId) {
    const accountId = toPositiveInt(id)
    if (!accountId) return null

    const existing = await this.getById(accountId)
    if (!existing) return null

    const normalized = await this.normalizePayload(payload)
    await pool.query(
      `UPDATE developer_accounts
       SET company_name = ?,
           account_name = ?,
           account_id = ?,
           status_code = ?,
           owner_user_id = ?,
           owner_name = ?,
           updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        normalized.company_name,
        normalized.account_name,
        normalized.account_id,
        normalized.status_code,
        normalized.owner_user_id,
        normalized.owner_name,
        userId || null,
        accountId,
      ],
    )
    return this.getById(accountId)
  },

  async softDelete(id, userId) {
    const accountId = toPositiveInt(id)
    if (!accountId) return 0
    const [result] = await pool.query(
      `UPDATE developer_accounts
       SET deleted_at = NOW(), updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [userId || null, accountId],
    )
    return result.affectedRows
  },

  async getUserDisplayName(userId) {
    const normalizedUserId = normalizeOptionalId(userId)
    if (!normalizedUserId) return { id: null, displayName: '' }

    const [rows] = await pool.query(
      `SELECT id, username, COALESCE(real_name, '') AS real_name
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [normalizedUserId],
    )

    const user = rows[0]
    if (!user) {
      const err = new Error('owner_user_invalid')
      err.statusCode = 400
      err.message = '负责人用户不存在'
      throw err
    }

    return {
      id: Number(user.id),
      displayName: user.real_name || user.username || '',
    }
  },

  async normalizePayload(payload = {}) {
    const companyName = normalizeText(payload.company_name, 120)
    if (!companyName) {
      const err = new Error('company_name_required')
      err.statusCode = 400
      err.message = '公司主体不能为空'
      throw err
    }
    if (!(await validateDictName(COMPANY_DICT_KEY, companyName))) {
      const err = new Error('company_name_invalid')
      err.statusCode = 400
      err.message = '公司主体不合法，请先在系统字典中维护'
      throw err
    }

    const accountName = normalizeText(payload.account_name, 120)
    if (!accountName) {
      const err = new Error('account_name_required')
      err.statusCode = 400
      err.message = '开发者账号名称不能为空'
      throw err
    }

    const statusCode = normalizeOptionalCode(payload.status_code)
    if (!(await validateDictCode(STATUS_DICT_KEY, statusCode))) {
      const err = new Error('status_code_invalid')
      err.statusCode = 400
      err.message = '账号状态不合法'
      throw err
    }

    const ownerUser = await this.getUserDisplayName(payload.owner_user_id)

    return {
      company_name: companyName,
      account_name: accountName,
      account_id: normalizeText(payload.account_id, 120),
      status_code: statusCode,
      owner_user_id: ownerUser.id,
      owner_name: ownerUser.displayName,
    }
  },
}

module.exports = DeveloperAccount
