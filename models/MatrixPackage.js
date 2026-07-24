const pool = require('../utils/db')
const DeveloperAccount = require('./DeveloperAccount')

const STATUS_DICT_KEY = 'matrix_package_status'
const HEALTH_DICT_KEY = 'matrix_package_health'
const PLATFORM_DICT_KEY = 'matrix_package_delivery_platform'
const DELIVERY_STATUS_DICT_KEY = 'matrix_package_delivery_status'
const PRODUCTION_STAGE_DICT_KEY = 'matrix_package_production_stage'
const PRODUCTION_STATUS_CODES = ['IN_DEVELOPMENT', 'TESTING']
const COMPLETION_SIDE_NOTE_TYPES = ['DELIVERY', 'DESIGN', 'OPERATION', 'FRONTEND', 'DEVOPS']
const COMPLETION_SIDE_NOTE_TOTAL = COMPLETION_SIDE_NOTE_TYPES.length
const COMPLETION_SIDE_NOTE_TYPE_SQL = COMPLETION_SIDE_NOTE_TYPES.map(() => '?').join(', ')
const RELEASE_TYPE_MAP = new Map([
  ['FIRST_RELEASE', { name: '首次发版', color: 'blue' }],
  ['VERSION_UPDATE', { name: '版本迭代', color: 'default' }],
])

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

function normalizeOptionalDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:00:00$/.test(text)) return text
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:00$/.test(text)) return `${text}:00`
  return null
}

function normalizeChecklist(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : []
    } catch (_) {
      return []
    }
  }
  return []
}

function normalizePlatformCodes(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')

  return Array.from(new Set(
    source
      .map((item) => normalizeOptionalCode(item))
      .filter(Boolean),
  ))
}

function mapRow(row) {
  if (!row) return null
  const sideNoteConfirmedCount = Number(row.side_note_confirmed_count || 0)
  const releaseType = RELEASE_TYPE_MAP.get(row.release_type || '') || null
  return {
    id: Number(row.id),
    developer_account_id: row.developer_account_id ? Number(row.developer_account_id) : null,
    developer_account_name: row.developer_account_name || '',
    developer_account_account_id: row.developer_account_account_id || '',
    developer_company_name: row.developer_company_name || '',
    package_name: row.package_name || '',
    app_id: row.app_id || '',
    new_package_version: row.new_package_version || '',
    domain_info: row.domain_info || '',
    platform: row.platform || '',
    platform_codes: normalizePlatformCodes(row.platform),
    delivery_status_code: row.delivery_status_code || '',
    delivery_status_name: row.delivery_status_name || row.delivery_status_code || '',
    delivery_status_color: row.delivery_status_color || '',
    owner_user_id: row.owner_user_id ? Number(row.owner_user_id) : null,
    owner_name: row.owner_display_name || row.owner_name || '',
    status_code: row.status_code || '',
    status_name: row.status_name || row.status_code || '',
    status_color: row.status_color || '',
    health_code: row.health_code || '',
    health_name: row.health_name || row.health_code || '',
    health_color: row.health_color || '',
    production_stage_code: row.production_stage_code || '',
    production_stage_name: row.production_stage_name || row.production_stage_code || '',
    production_stage_color: row.production_stage_color || '',
    expected_cold_ready_date: row.expected_cold_ready_date || null,
    latest_progress: row.latest_progress || '',
    production_checklist: normalizeChecklist(row.production_checklist),
    linked_demand_id: row.linked_demand_id || '',
    linked_demand_name: row.linked_demand_name || '',
    release_type: row.release_type || '',
    release_type_name: releaseType?.name || row.release_type || '',
    release_type_color: releaseType?.color || 'default',
    side_note_confirmed_count: sideNoteConfirmedCount,
    side_note_total: COMPLETION_SIDE_NOTE_TOTAL,
    side_note_completion_percent: Math.round((sideNoteConfirmedCount / COMPLETION_SIDE_NOTE_TOTAL) * 100),
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

async function validateDictCodes(typeKey, itemCodes = []) {
  const codes = normalizePlatformCodes(itemCodes)
  if (codes.length === 0) return true

  const [rows] = await pool.query(
    `SELECT item_code
     FROM config_dict_items
     WHERE type_key = ? AND enabled = 1 AND item_code IN (${codes.map(() => '?').join(', ')})`,
    [typeKey, ...codes],
  )
  const validCodes = new Set((rows || []).map((row) => normalizeOptionalCode(row.item_code)))
  return codes.every((code) => validCodes.has(code))
}

function buildWhere(filters = {}) {
  const clauses = ['mp.deleted_at IS NULL']
  const params = []

  const keyword = normalizeText(filters.keyword, 100)
  if (keyword) {
    clauses.push('(mp.package_name LIKE ? OR mp.app_id LIKE ? OR mp.new_package_version LIKE ? OR mp.domain_info LIKE ? OR mp.platform LIKE ? OR mp.owner_name LIKE ? OR ownerUser.real_name LIKE ? OR ownerUser.username LIKE ? OR da.account_name LIKE ? OR da.company_name LIKE ?)')
    const like = `%${keyword}%`
    params.push(like, like, like, like, like, like, like, like, like, like)
  }

  const statusCode = normalizeOptionalCode(filters.status_code)
  if (statusCode) {
    clauses.push('mp.status_code = ?')
    params.push(statusCode)
  }

  const statusCodes = String(filters.status_codes || '')
    .split(',')
    .map((item) => normalizeOptionalCode(item))
    .filter(Boolean)
  if (statusCodes.length > 0) {
    clauses.push(`mp.status_code IN (${statusCodes.map(() => '?').join(', ')})`)
    params.push(...statusCodes)
  }

  if (String(filters.production_only || '').trim() === '1') {
    clauses.push(`mp.status_code IN (${PRODUCTION_STATUS_CODES.map(() => '?').join(', ')})`)
    params.push(...PRODUCTION_STATUS_CODES)
  }

  const healthCode = normalizeOptionalCode(filters.health_code)
  if (healthCode) {
    clauses.push('mp.health_code = ?')
    params.push(healthCode)
  }

  const platformCodes = normalizePlatformCodes(filters.platform)
  if (platformCodes.length > 0) {
    clauses.push(`(${platformCodes.map(() => 'FIND_IN_SET(?, mp.platform)').join(' OR ')})`)
    params.push(...platformCodes)
  }

  const deliveryStatusCode = normalizeOptionalCode(filters.delivery_status_code)
  if (deliveryStatusCode) {
    clauses.push('mp.delivery_status_code = ?')
    params.push(deliveryStatusCode)
  }

  const ownerName = normalizeText(filters.owner_name, 80)
  if (ownerName) {
    clauses.push('(mp.owner_name LIKE ? OR ownerUser.real_name LIKE ? OR ownerUser.username LIKE ?)')
    const like = `%${ownerName}%`
    params.push(like, like, like)
  }

  const developerAccountId = toPositiveInt(filters.developer_account_id)
  if (developerAccountId) {
    clauses.push('mp.developer_account_id = ?')
    params.push(developerAccountId)
  }

  const productionStageCode = normalizeOptionalCode(filters.production_stage_code)
  if (productionStageCode) {
    clauses.push('mp.production_stage_code = ?')
    params.push(productionStageCode)
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
    const productionOnly = String(filters.production_only || '').trim() === '1'
    const statusOrderSql = productionOnly
      ? `CASE mp.status_code
           WHEN 'IN_DEVELOPMENT' THEN 1
           WHEN 'TESTING' THEN 2
           WHEN 'COLD_STANDBY' THEN 3
           ELSE 9
         END`
      : `CASE mp.status_code
           WHEN 'DELIVERING' THEN 1
           WHEN 'IN_REVIEW' THEN 2
           WHEN 'REVIEW_REJECTED' THEN 3
           WHEN 'HOT_STANDBY' THEN 4
           WHEN 'PENDING_REVIEW_SUBMIT' THEN 5
           WHEN 'COLD_STANDBY' THEN 6
           WHEN 'TESTING' THEN 7
           WHEN 'IN_DEVELOPMENT' THEN 8
           WHEN 'PENDING_DEV' THEN 9
           WHEN 'BANNED' THEN 10
           WHEN 'ARCHIVED' THEN 11
           ELSE 99
         END`

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM matrix_packages mp
       LEFT JOIN users ownerUser
         ON ownerUser.id = mp.owner_user_id
       LEFT JOIN developer_accounts da
         ON da.id = mp.developer_account_id
        AND da.deleted_at IS NULL
       WHERE ${whereSql}`,
      params,
    )

    const [summaryRows] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN mp.status_code = 'PENDING_DEV' THEN 1 ELSE 0 END) AS pending_dev,
         SUM(CASE WHEN mp.status_code = 'IN_DEVELOPMENT' THEN 1 ELSE 0 END) AS in_development,
         SUM(CASE WHEN mp.status_code = 'TESTING' THEN 1 ELSE 0 END) AS testing,
         SUM(CASE WHEN mp.status_code = 'COLD_STANDBY' THEN 1 ELSE 0 END) AS cold_standby,
         SUM(CASE WHEN mp.status_code = 'PENDING_REVIEW_SUBMIT' THEN 1 ELSE 0 END) AS pending_review_submit,
         SUM(CASE WHEN mp.status_code = 'DELIVERING' THEN 1 ELSE 0 END) AS delivering,
         SUM(CASE WHEN mp.status_code = 'IN_REVIEW' THEN 1 ELSE 0 END) AS in_review,
         SUM(CASE WHEN mp.status_code = 'IN_REVIEW' AND latestRelease.release_type = 'FIRST_RELEASE' THEN 1 ELSE 0 END) AS in_review_first_release,
         SUM(CASE WHEN mp.status_code = 'HOT_STANDBY' THEN 1 ELSE 0 END) AS hot_standby,
         SUM(CASE WHEN mp.status_code IN ('HOT_STANDBY', 'COLD_STANDBY') THEN 1 ELSE 0 END) AS standby,
         SUM(CASE WHEN mp.status_code = 'BANNED' OR mp.health_code = 'ABNORMAL' THEN 1 ELSE 0 END) AS abnormal
       FROM matrix_packages mp
       LEFT JOIN users ownerUser
         ON ownerUser.id = mp.owner_user_id
       LEFT JOIN developer_accounts da
         ON da.id = mp.developer_account_id
        AND da.deleted_at IS NULL
       LEFT JOIN app_version_releases latestRelease
         ON latestRelease.id = (
           SELECT avr.id
           FROM app_version_releases avr
           WHERE avr.matrix_package_id = mp.id
             AND avr.deleted_at IS NULL
           ORDER BY avr.created_at DESC, avr.id DESC
           LIMIT 1
         )
       WHERE ${whereSql}`,
      params,
    )

    const [rows] = await pool.query(
      `SELECT
         mp.id,
         mp.developer_account_id,
         da.account_name AS developer_account_name,
         da.account_id AS developer_account_account_id,
         da.company_name AS developer_company_name,
         mp.package_name,
         mp.app_id,
         mp.new_package_version,
         mp.domain_info,
         mp.platform,
         mp.delivery_status_code,
         deliveryStatusDict.item_name AS delivery_status_name,
         deliveryStatusDict.color AS delivery_status_color,
         latestRelease.release_type,
         mp.owner_user_id,
         COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username) AS owner_display_name,
         mp.owner_name,
         mp.status_code,
         statusDict.item_name AS status_name,
         statusDict.color AS status_color,
         mp.health_code,
         healthDict.item_name AS health_name,
         healthDict.color AS health_color,
         mp.production_stage_code,
         productionStageDict.item_name AS production_stage_name,
         productionStageDict.color AS production_stage_color,
         DATE_FORMAT(mp.expected_cold_ready_date, '%Y-%m-%d') AS expected_cold_ready_date,
         mp.latest_progress,
         mp.production_checklist,
         mp.linked_demand_id,
         linkedDemand.name AS linked_demand_name,
         COALESCE(sideNoteStats.side_note_confirmed_count, 0) AS side_note_confirmed_count,
         mp.created_by,
         mp.updated_by,
         DATE_FORMAT(mp.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(mp.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM matrix_packages mp
       LEFT JOIN users ownerUser
         ON ownerUser.id = mp.owner_user_id
       LEFT JOIN developer_accounts da
         ON da.id = mp.developer_account_id
        AND da.deleted_at IS NULL
       LEFT JOIN work_demands linkedDemand
         ON linkedDemand.id = mp.linked_demand_id
       LEFT JOIN app_version_releases latestRelease
         ON latestRelease.id = (
           SELECT avr.id
           FROM app_version_releases avr
           WHERE avr.matrix_package_id = mp.id
             AND avr.deleted_at IS NULL
           ORDER BY avr.created_at DESC, avr.id DESC
           LIMIT 1
         )
       LEFT JOIN (
         SELECT
           package_id,
           SUM(CASE
             WHEN COALESCE(TRIM(content), '') <> ''
              AND COALESCE(content, '') = COALESCE(confirmed_content, '')
             THEN 1
             ELSE 0
           END) AS side_note_confirmed_count
         FROM matrix_package_side_notes
         WHERE note_type IN (${COMPLETION_SIDE_NOTE_TYPE_SQL})
         GROUP BY package_id
       ) sideNoteStats
         ON sideNoteStats.package_id = mp.id
       LEFT JOIN config_dict_items statusDict
         ON statusDict.type_key = ?
        AND statusDict.item_code = mp.status_code
       LEFT JOIN config_dict_items healthDict
         ON healthDict.type_key = ?
        AND healthDict.item_code = mp.health_code
       LEFT JOIN config_dict_items productionStageDict
         ON productionStageDict.type_key = ?
        AND productionStageDict.item_code = mp.production_stage_code
       LEFT JOIN config_dict_items deliveryStatusDict
         ON deliveryStatusDict.type_key = ?
        AND deliveryStatusDict.item_code = mp.delivery_status_code
       WHERE ${whereSql}
       ORDER BY
         ${statusOrderSql} ASC,
         CASE
           WHEN mp.status_code = 'IN_REVIEW' AND latestRelease.release_type = 'FIRST_RELEASE' THEN 1
           WHEN mp.status_code = 'IN_REVIEW' AND latestRelease.release_type = 'VERSION_UPDATE' THEN 2
           WHEN mp.status_code = 'IN_REVIEW' THEN 3
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
      [
        ...COMPLETION_SIDE_NOTE_TYPES,
        STATUS_DICT_KEY,
        HEALTH_DICT_KEY,
        PRODUCTION_STAGE_DICT_KEY,
        DELIVERY_STATUS_DICT_KEY,
        ...params,
        pageSize,
        offset,
      ],
    )

    return {
      list: rows.map(mapRow),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
      summary: {
        total: Number(summaryRows[0]?.total || 0),
        pending_dev: Number(summaryRows[0]?.pending_dev || 0),
        in_development: Number(summaryRows[0]?.in_development || 0),
        cold_standby: Number(summaryRows[0]?.cold_standby || 0),
        pending_review_submit: Number(summaryRows[0]?.pending_review_submit || 0),
        delivering: Number(summaryRows[0]?.delivering || 0),
        in_review: Number(summaryRows[0]?.in_review || 0),
        in_review_first_release: Number(summaryRows[0]?.in_review_first_release || 0),
        hot_standby: Number(summaryRows[0]?.hot_standby || 0),
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
         mp.developer_account_id,
         da.account_name AS developer_account_name,
         da.account_id AS developer_account_account_id,
         da.company_name AS developer_company_name,
         mp.package_name,
         mp.app_id,
         mp.new_package_version,
         mp.domain_info,
         mp.platform,
         mp.delivery_status_code,
         deliveryStatusDict.item_name AS delivery_status_name,
         deliveryStatusDict.color AS delivery_status_color,
         latestRelease.release_type,
         mp.owner_user_id,
         COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username) AS owner_display_name,
         mp.owner_name,
         mp.status_code,
         statusDict.item_name AS status_name,
         statusDict.color AS status_color,
         mp.health_code,
         healthDict.item_name AS health_name,
         healthDict.color AS health_color,
         mp.production_stage_code,
         productionStageDict.item_name AS production_stage_name,
         productionStageDict.color AS production_stage_color,
         DATE_FORMAT(mp.expected_cold_ready_date, '%Y-%m-%d') AS expected_cold_ready_date,
         mp.latest_progress,
         mp.production_checklist,
         mp.linked_demand_id,
         linkedDemand.name AS linked_demand_name,
         COALESCE(sideNoteStats.side_note_confirmed_count, 0) AS side_note_confirmed_count,
         mp.created_by,
         mp.updated_by,
         DATE_FORMAT(mp.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(mp.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM matrix_packages mp
       LEFT JOIN users ownerUser
         ON ownerUser.id = mp.owner_user_id
       LEFT JOIN developer_accounts da
         ON da.id = mp.developer_account_id
        AND da.deleted_at IS NULL
       LEFT JOIN work_demands linkedDemand
         ON linkedDemand.id = mp.linked_demand_id
       LEFT JOIN app_version_releases latestRelease
         ON latestRelease.id = (
           SELECT avr.id
           FROM app_version_releases avr
           WHERE avr.matrix_package_id = mp.id
             AND avr.deleted_at IS NULL
           ORDER BY avr.created_at DESC, avr.id DESC
           LIMIT 1
         )
       LEFT JOIN (
         SELECT
           package_id,
           SUM(CASE
             WHEN COALESCE(TRIM(content), '') <> ''
              AND COALESCE(content, '') = COALESCE(confirmed_content, '')
             THEN 1
             ELSE 0
           END) AS side_note_confirmed_count
         FROM matrix_package_side_notes
         WHERE note_type IN (${COMPLETION_SIDE_NOTE_TYPE_SQL})
         GROUP BY package_id
       ) sideNoteStats
         ON sideNoteStats.package_id = mp.id
       LEFT JOIN config_dict_items statusDict
         ON statusDict.type_key = ?
        AND statusDict.item_code = mp.status_code
       LEFT JOIN config_dict_items healthDict
         ON healthDict.type_key = ?
        AND healthDict.item_code = mp.health_code
       LEFT JOIN config_dict_items productionStageDict
         ON productionStageDict.type_key = ?
        AND productionStageDict.item_code = mp.production_stage_code
       LEFT JOIN config_dict_items deliveryStatusDict
         ON deliveryStatusDict.type_key = ?
        AND deliveryStatusDict.item_code = mp.delivery_status_code
       WHERE mp.id = ? AND mp.deleted_at IS NULL
       LIMIT 1`,
      [
        ...COMPLETION_SIDE_NOTE_TYPES,
        STATUS_DICT_KEY,
        HEALTH_DICT_KEY,
        PRODUCTION_STAGE_DICT_KEY,
        DELIVERY_STATUS_DICT_KEY,
        packageId,
      ],
    )
    return mapRow(rows[0])
  },

  async create(payload, userId) {
    const normalized = await this.normalizePayload(payload)
    const [result] = await pool.query(
      `INSERT INTO matrix_packages
       (developer_account_id, package_name, app_id, new_package_version, domain_info, platform, delivery_status_code, owner_user_id, owner_name, status_code, health_code, production_stage_code, expected_cold_ready_date, latest_progress, production_checklist, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.developer_account_id,
        normalized.package_name,
        normalized.app_id,
        normalized.new_package_version,
        normalized.domain_info,
        normalized.platform,
        normalized.delivery_status_code,
        normalized.owner_user_id,
        normalized.owner_name,
        normalized.status_code,
        normalized.health_code,
        normalized.production_stage_code,
        normalized.expected_cold_ready_date,
        normalized.latest_progress,
        JSON.stringify(normalized.production_checklist),
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

    const normalized = await this.normalizePayload(payload, existing)
    await pool.query(
      `UPDATE matrix_packages
       SET package_name = ?,
           app_id = ?,
           new_package_version = ?,
           domain_info = ?,
           developer_account_id = ?,
           platform = ?,
           delivery_status_code = ?,
           owner_user_id = ?,
           owner_name = ?,
           status_code = ?,
           health_code = ?,
           production_stage_code = ?,
           expected_cold_ready_date = ?,
           latest_progress = ?,
           production_checklist = ?,
           updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        normalized.package_name,
        normalized.app_id,
        normalized.new_package_version,
        normalized.domain_info,
        normalized.developer_account_id,
        normalized.platform,
        normalized.delivery_status_code,
        normalized.owner_user_id,
        normalized.owner_name,
        normalized.status_code,
        normalized.health_code,
        normalized.production_stage_code,
        normalized.expected_cold_ready_date,
        normalized.latest_progress,
        JSON.stringify(normalized.production_checklist),
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

  async normalizePayload(payload = {}, existing = {}) {
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
      err.message = '运营中的矩阵包必须选择健康度'
      throw err
    }

    const developerAccountId = toPositiveInt(payload.developer_account_id)
    if (developerAccountId && !(await DeveloperAccount.exists(developerAccountId))) {
      const err = new Error('developer_account_invalid')
      err.statusCode = 400
      err.message = '开发者账号不存在'
      throw err
    }

    const existingStatusCode = normalizeOptionalCode(existing.status_code)
    if (existingStatusCode === 'PENDING_DEV' && statusCode === 'IN_DEVELOPMENT' && !developerAccountId) {
      const err = new Error('developer_account_required_before_development')
      err.statusCode = 400
      err.message = '请先绑定开发者账号后推进开发'
      throw err
    }

    const hasProductionStage = Object.prototype.hasOwnProperty.call(payload, 'production_stage_code')
    const productionStageCode = hasProductionStage
      ? normalizeOptionalCode(payload.production_stage_code)
      : normalizeOptionalCode(existing.production_stage_code)
    if (productionStageCode && !(await validateDictCode(PRODUCTION_STAGE_DICT_KEY, productionStageCode))) {
      const err = new Error('production_stage_code_invalid')
      err.statusCode = 400
      err.message = '生产节点不合法'
      throw err
    }

    const hasReadyDate = Object.prototype.hasOwnProperty.call(payload, 'expected_cold_ready_date')
    const expectedColdReadyDate = hasReadyDate
      ? normalizeOptionalDate(payload.expected_cold_ready_date)
      : normalizeOptionalDate(existing.expected_cold_ready_date)
    if (hasReadyDate && payload.expected_cold_ready_date && !expectedColdReadyDate) {
      const err = new Error('expected_cold_ready_date_invalid')
      err.statusCode = 400
      err.message = '预计冷备完成时间格式错误'
      throw err
    }

    const latestProgress = Object.prototype.hasOwnProperty.call(payload, 'latest_progress')
      ? normalizeText(payload.latest_progress, 500)
      : normalizeText(existing.latest_progress, 500)

    const productionChecklist = Object.prototype.hasOwnProperty.call(payload, 'production_checklist')
      ? normalizeChecklist(payload.production_checklist)
      : normalizeChecklist(existing.production_checklist)

    const hasPackageVersion = Object.prototype.hasOwnProperty.call(payload, 'new_package_version')
    const newPackageVersion = hasPackageVersion
      ? normalizeText(payload.new_package_version, 50)
      : normalizeText(existing.new_package_version, 50)

    const hasAppId = Object.prototype.hasOwnProperty.call(payload, 'app_id')
    const appId = hasAppId
      ? normalizeText(payload.app_id, 80)
      : normalizeText(existing.app_id, 80)

    const hasDomainInfo = Object.prototype.hasOwnProperty.call(payload, 'domain_info')
    const domainInfo = hasDomainInfo
      ? normalizeText(payload.domain_info, 255)
      : normalizeText(existing.domain_info, 255)
    if (!existing.id && !domainInfo) {
      const err = new Error('domain_info_required')
      err.statusCode = 400
      err.message = '新增矩阵包时必须填写域名信息'
      throw err
    }

    const hasPlatform = Object.prototype.hasOwnProperty.call(payload, 'platform')
    const rawPlatformCodes = hasPlatform
      ? normalizePlatformCodes(payload.platform)
      : normalizePlatformCodes(existing.platform)
    const platformCodes = statusCode === 'DELIVERING' ? rawPlatformCodes : []
    if (platformCodes.length > 0 && !(await validateDictCodes(PLATFORM_DICT_KEY, platformCodes))) {
      const err = new Error('platform_invalid')
      err.statusCode = 400
      err.message = '投放平台不合法'
      throw err
    }

    const hasDeliveryStatus = Object.prototype.hasOwnProperty.call(payload, 'delivery_status_code')
    const rawDeliveryStatusCode = hasDeliveryStatus
      ? normalizeOptionalCode(payload.delivery_status_code)
      : normalizeOptionalCode(existing.delivery_status_code)
    const deliveryStatusCode = statusCode === 'DELIVERING' ? rawDeliveryStatusCode : null
    if (deliveryStatusCode && !(await validateDictCode(DELIVERY_STATUS_DICT_KEY, deliveryStatusCode, { allowNull: true }))) {
      const err = new Error('delivery_status_invalid')
      err.statusCode = 400
      err.message = '投放状态不合法'
      throw err
    }

    const hasOwnerUser = Object.prototype.hasOwnProperty.call(payload, 'owner_user_id')
    const ownerUser = hasOwnerUser
      ? await this.getUserDisplayName(payload.owner_user_id)
      : {
          id: normalizeOptionalId(existing.owner_user_id),
          displayName: normalizeText(existing.owner_name, 80),
        }

    return {
      developer_account_id: developerAccountId || null,
      package_name: packageName,
      app_id: appId || null,
      new_package_version: newPackageVersion || null,
      domain_info: domainInfo || null,
      platform: platformCodes.join(',') || null,
      delivery_status_code: deliveryStatusCode || null,
      owner_user_id: ownerUser.id,
      owner_name: normalizeText(ownerUser.displayName, 80),
      status_code: statusCode,
      health_code: healthCode,
      production_stage_code: productionStageCode,
      expected_cold_ready_date: expectedColdReadyDate,
      latest_progress: latestProgress,
      production_checklist: productionChecklist,
    }
  },
}

module.exports = MatrixPackage
