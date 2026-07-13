const pool = require('../utils/db')
const MatrixPackage = require('./MatrixPackage')
const MatrixPackageSideNote = require('./MatrixPackageSideNote')

const RELEASE_STATUS_OPTIONS = [
  { code: 'PENDING_PLAN', name: '待规划', color: 'magenta', sort: 10 },
  { code: 'QUEUED', name: '排队中', color: 'geekblue', sort: 20 },
  { code: 'IN_REVIEW', name: '审核中', color: 'gold', sort: 30 },
  { code: 'LISTED', name: '已上架', color: 'lime', sort: 40 },
]

const RELEASE_TYPE_OPTIONS = [
  { code: 'FIRST_RELEASE', name: '首次发版', color: 'blue' },
  { code: 'VERSION_UPDATE', name: '版本更新', color: 'default' },
]

const URGENCY_OPTIONS = [
  { code: 'P0', name: 'P0', color: 'red' },
  { code: 'P1', name: 'P1', color: 'orange' },
  { code: 'P2', name: 'P2', color: 'blue' },
  { code: 'P3', name: 'P3', color: 'default' },
]

const RELEASE_STATUS_MAP = new Map(RELEASE_STATUS_OPTIONS.map((item) => [item.code, item]))
const RELEASE_TYPE_MAP = new Map(RELEASE_TYPE_OPTIONS.map((item) => [item.code, item]))
const URGENCY_MAP = new Map(URGENCY_OPTIONS.map((item) => [item.code, item]))

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

function normalizeOptionalDateTime(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(text)) return text
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(text)) return `${text}:00`
  const err = new Error('datetime_invalid')
  err.statusCode = 400
  err.message = '时间格式不合法'
  throw err
}

function normalizePackageIds(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => toPositiveInt(item)).filter((item) => item > 0))]
}

function parseStructuredContent(content) {
  if (content && typeof content === 'object' && !Array.isArray(content)) return content
  const text = String(content || '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function mapRow(row) {
  if (!row) return null
  const releaseStatus = RELEASE_STATUS_MAP.get(row.release_status || '') || null
  const releaseType = RELEASE_TYPE_MAP.get(row.release_type || '') || null
  const urgency = URGENCY_MAP.get(row.urgency_code || '') || null
  return {
    id: Number(row.id),
    matrix_package_id: row.matrix_package_id ? Number(row.matrix_package_id) : null,
    release_type: row.release_type || '',
    release_type_name: releaseType?.name || row.release_type || '',
    release_type_color: releaseType?.color || 'default',
    release_status: row.release_status || '',
    release_status_name: releaseStatus?.name || row.release_status || '',
    release_status_color: releaseStatus?.color || 'default',
    urgency_code: row.urgency_code || '',
    urgency_name: urgency?.name || row.urgency_code || '',
    urgency_color: urgency?.color || 'default',
    app_version: row.app_version || '',
    app_name: row.app_name || '',
    app_developer: row.app_developer || '',
    app_company_subject: row.app_company_subject || '',
    app_console_url: row.app_console_url || '',
    app_id: row.app_id || '',
    domain_info: row.domain_info || '',
    expected_submit_at: row.expected_submit_at || null,
    submitted_at: row.submitted_at || null,
    listed_at: row.listed_at || null,
    owner_user_id: row.owner_user_id ? Number(row.owner_user_id) : null,
    owner_name: row.owner_display_name || row.owner_name || '',
    remark: row.remark || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

function buildWhere(filters = {}) {
  const clauses = ['avr.deleted_at IS NULL']
  const params = []

  const keyword = normalizeText(filters.keyword, 100)
  if (keyword) {
    clauses.push('(avr.app_name LIKE ? OR avr.app_version LIKE ? OR avr.app_developer LIKE ? OR avr.app_company_subject LIKE ? OR avr.app_id LIKE ? OR avr.domain_info LIKE ?)')
    const like = `%${keyword}%`
    params.push(like, like, like, like, like, like)
  }

  const releaseStatus = normalizeOptionalCode(filters.release_status)
  if (releaseStatus) {
    clauses.push('avr.release_status = ?')
    params.push(releaseStatus)
  }

  const releaseType = normalizeOptionalCode(filters.release_type)
  if (releaseType) {
    clauses.push('avr.release_type = ?')
    params.push(releaseType)
  }

  return {
    whereSql: clauses.join(' AND '),
    params,
  }
}

async function getSideNoteContent(packageId, noteType) {
  const notes = await MatrixPackageSideNote.listByPackageId(packageId)
  if (!Array.isArray(notes)) return {}
  const note = notes.find((item) => item.note_type === noteType)
  const content = String(note?.content || '').trim() ? note.content : note?.confirmed_content || ''
  return parseStructuredContent(content)
}

async function resolveReleaseType(packageDetail) {
  const appId = normalizeText(packageDetail?.app_id, 120)
  const appName = normalizeText(packageDetail?.package_name, 160)
  if (!appId && !appName) return 'FIRST_RELEASE'

  const clauses = ['deleted_at IS NULL', `release_status = 'LISTED'`]
  const params = []
  if (appId) {
    clauses.push('app_id = ?')
    params.push(appId)
  } else {
    clauses.push('app_name = ?')
    params.push(appName)
  }

  const [rows] = await pool.query(
    `SELECT id
     FROM app_version_releases
     WHERE ${clauses.join(' AND ')}
     LIMIT 1`,
    params,
  )
  return rows.length > 0 ? 'VERSION_UPDATE' : 'FIRST_RELEASE'
}

async function getByMatrixPackageId(packageId) {
  const normalizedPackageId = toPositiveInt(packageId)
  if (!normalizedPackageId) return null
  const [rows] = await pool.query(
    `SELECT
       avr.*,
       DATE_FORMAT(avr.expected_submit_at, '%Y-%m-%d %H:%i:%s') AS expected_submit_at,
       DATE_FORMAT(avr.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
       DATE_FORMAT(avr.listed_at, '%Y-%m-%d %H:%i:%s') AS listed_at,
       DATE_FORMAT(avr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
       DATE_FORMAT(avr.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
       COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username) AS owner_display_name
     FROM app_version_releases avr
     LEFT JOIN users ownerUser
       ON ownerUser.id = avr.owner_user_id
     WHERE avr.matrix_package_id = ? AND avr.deleted_at IS NULL
     ORDER BY avr.id DESC
     LIMIT 1`,
    [normalizedPackageId],
  )
  return mapRow(rows[0])
}

async function findBlockingReleasesByPackageIds(packageIds = []) {
  const normalizedIds = normalizePackageIds(packageIds)
  if (normalizedIds.length === 0) return []

  const [rows] = await pool.query(
    `SELECT
       avr.id,
       avr.matrix_package_id,
       avr.release_status,
       avr.app_version,
       mp.package_name,
       mp.app_id,
       mp.domain_info
     FROM app_version_releases avr
     LEFT JOIN matrix_packages mp
       ON mp.id = avr.matrix_package_id
     WHERE avr.deleted_at IS NULL
       AND avr.release_status <> 'LISTED'
       AND avr.matrix_package_id IN (?)
     ORDER BY avr.id DESC`,
    [normalizedIds],
  )

  return rows.map((row) => ({
    id: Number(row.id),
    matrix_package_id: Number(row.matrix_package_id),
    package_name: row.package_name || '',
    app_id: row.app_id || '',
    domain_info: row.domain_info || '',
    app_version: row.app_version || '',
    release_status: row.release_status || '',
    release_status_name: RELEASE_STATUS_MAP.get(row.release_status || '')?.name || row.release_status || '',
  }))
}

const AppVersionRelease = {
  RELEASE_STATUS_OPTIONS,
  RELEASE_TYPE_OPTIONS,
  URGENCY_OPTIONS,

  async list(filters = {}) {
    const page = Math.max(toPositiveInt(filters.page) || 1, 1)
    const pageSize = Math.min(Math.max(toPositiveInt(filters.pageSize) || 20, 1), 100)
    const offset = (page - 1) * pageSize
    const { whereSql, params } = buildWhere(filters)

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM app_version_releases avr
       WHERE ${whereSql}`,
      params,
    )

    const [rows] = await pool.query(
      `SELECT
         avr.*,
         DATE_FORMAT(avr.expected_submit_at, '%Y-%m-%d %H:%i:%s') AS expected_submit_at,
         DATE_FORMAT(avr.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
         DATE_FORMAT(avr.listed_at, '%Y-%m-%d %H:%i:%s') AS listed_at,
         DATE_FORMAT(avr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(avr.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
         COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username) AS owner_display_name
       FROM app_version_releases avr
       LEFT JOIN users ownerUser
         ON ownerUser.id = avr.owner_user_id
       WHERE ${whereSql}
       ORDER BY
         CASE avr.release_status
           WHEN 'PENDING_PLAN' THEN 1
           WHEN 'QUEUED' THEN 2
           WHEN 'IN_REVIEW' THEN 3
           WHEN 'LISTED' THEN 4
           ELSE 9
         END ASC,
         avr.updated_at DESC,
         avr.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )

    return {
      list: rows.map(mapRow),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
      release_status_options: RELEASE_STATUS_OPTIONS,
      release_type_options: RELEASE_TYPE_OPTIONS,
      urgency_options: URGENCY_OPTIONS,
    }
  },

  getByMatrixPackageId,

  async getById(id) {
    const releaseId = toPositiveInt(id)
    if (!releaseId) return null
    const [rows] = await pool.query(
      `SELECT
         avr.*,
         DATE_FORMAT(avr.expected_submit_at, '%Y-%m-%d %H:%i:%s') AS expected_submit_at,
         DATE_FORMAT(avr.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
         DATE_FORMAT(avr.listed_at, '%Y-%m-%d %H:%i:%s') AS listed_at,
         DATE_FORMAT(avr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(avr.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
         COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username) AS owner_display_name
       FROM app_version_releases avr
       LEFT JOIN users ownerUser
         ON ownerUser.id = avr.owner_user_id
       WHERE avr.id = ? AND avr.deleted_at IS NULL
       LIMIT 1`,
      [releaseId],
    )
    return mapRow(rows[0])
  },

  async update(id, payload = {}, userId) {
    const releaseId = toPositiveInt(id)
    if (!releaseId) return null

    const existing = await this.getById(releaseId)
    if (!existing) return null

    const releaseStatus = normalizeOptionalCode(payload.release_status || existing.release_status)
    if (!RELEASE_STATUS_MAP.has(releaseStatus)) {
      const err = new Error('release_status_invalid')
      err.statusCode = 400
      err.message = '发版进度不合法'
      throw err
    }

    const urgencyCode = normalizeOptionalCode(payload.urgency_code || existing.urgency_code)
    if (!URGENCY_MAP.has(urgencyCode)) {
      const err = new Error('urgency_code_invalid')
      err.statusCode = 400
      err.message = '紧急程度不合法'
      throw err
    }

    const expectedSubmitAt = Object.prototype.hasOwnProperty.call(payload, 'expected_submit_at')
      ? normalizeOptionalDateTime(payload.expected_submit_at)
      : existing.expected_submit_at
    const submittedAt = Object.prototype.hasOwnProperty.call(payload, 'submitted_at')
      ? normalizeOptionalDateTime(payload.submitted_at)
      : existing.submitted_at
    const listedAt = Object.prototype.hasOwnProperty.call(payload, 'listed_at')
      ? normalizeOptionalDateTime(payload.listed_at)
      : existing.listed_at
    const remark = Object.prototype.hasOwnProperty.call(payload, 'remark')
      ? normalizeText(payload.remark, 1000)
      : existing.remark

    await pool.query(
      `UPDATE app_version_releases
       SET release_status = ?,
           urgency_code = ?,
           expected_submit_at = ?,
           submitted_at = ?,
           listed_at = ?,
           remark = ?,
           updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        releaseStatus,
        urgencyCode,
        expectedSubmitAt || null,
        submittedAt || null,
        listedAt || null,
        remark || null,
        userId || null,
        releaseId,
      ],
    )

    return this.getById(releaseId)
  },

  async softDelete(id, userId) {
    const releaseId = toPositiveInt(id)
    if (!releaseId) return 0
    const [result] = await pool.query(
      `UPDATE app_version_releases
       SET deleted_at = NOW(),
           updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [userId || null, releaseId],
    )
    return result.affectedRows
  },

  async createApplications(payload = {}, userId) {
    const packageIds = normalizePackageIds(payload.package_ids)
    if (packageIds.length === 0) {
      const err = new Error('package_ids_required')
      err.statusCode = 400
      err.message = '请选择app包'
      throw err
    }

    const appVersion = normalizeText(payload.app_version, 80)
    if (!appVersion) {
      const err = new Error('app_version_required')
      err.statusCode = 400
      err.message = '版本号不能为空'
      throw err
    }

    const urgencyCode = normalizeOptionalCode(payload.urgency_code)
    if (!URGENCY_MAP.has(urgencyCode)) {
      const err = new Error('urgency_code_invalid')
      err.statusCode = 400
      err.message = '紧急程度不合法'
      throw err
    }

    const expectedSubmitAt = normalizeOptionalDateTime(payload.expected_submit_at)
    const remark = normalizeText(payload.remark, 1000)

    const conflicts = await findBlockingReleasesByPackageIds(packageIds)
    if (conflicts.length > 0) {
      const err = new Error('app_release_blocking_records_exist')
      err.statusCode = 409
      err.message = '所选app包存在未上架的发版记录，请先修改已有记录'
      err.conflicts = conflicts
      throw err
    }

    const packageDetails = await Promise.all(packageIds.map((packageId) => MatrixPackage.getById(packageId)))
    const missingPackageIds = packageIds.filter((packageId, index) => !packageDetails[index])
    if (missingPackageIds.length > 0) {
      const err = new Error('matrix_package_not_found')
      err.statusCode = 404
      err.message = `矩阵包不存在：${missingPackageIds.join(', ')}`
      throw err
    }

    const created = []
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      for (const packageDetail of packageDetails) {
        const [operationContent, frontendContent] = await Promise.all([
          getSideNoteContent(packageDetail.id, 'OPERATION'),
          getSideNoteContent(packageDetail.id, 'FRONTEND'),
        ])
        const releaseType = await resolveReleaseType(packageDetail)
        const appName = normalizeText(operationContent.appName, 160) || normalizeText(packageDetail.package_name, 160)
        const appConsoleUrl = normalizeText(frontendContent.appConsoleUrl, 1000)

        const [result] = await connection.query(
          `INSERT INTO app_version_releases
           (matrix_package_id, release_type, release_status, urgency_code, app_version, app_name, app_developer, app_company_subject, app_console_url, app_id, domain_info, owner_user_id, owner_name, expected_submit_at, remark, created_by, updated_by)
           VALUES (?, ?, 'PENDING_PLAN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            packageDetail.id,
            releaseType,
            urgencyCode,
            appVersion,
            appName,
            normalizeText(packageDetail.developer_account_name, 160),
            normalizeText(packageDetail.developer_company_name, 160),
            appConsoleUrl,
            normalizeText(packageDetail.app_id, 120),
            normalizeText(packageDetail.domain_info, 255),
            packageDetail.owner_user_id || null,
            normalizeText(packageDetail.owner_name, 80),
            expectedSubmitAt,
            remark || null,
            userId || null,
            userId || null,
          ],
        )
        created.push(result.insertId)
      }

      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }

    const rows = await Promise.all(created.map((id) => this.getById(id)))
    return rows.filter(Boolean)
  },

  async ensureFromMatrixPackage(packageId, userId) {
    const normalizedPackageId = toPositiveInt(packageId)
    if (!normalizedPackageId) return null

    const existing = await getByMatrixPackageId(normalizedPackageId)
    if (existing) return existing

    const packageDetail = await MatrixPackage.getById(normalizedPackageId)
    if (!packageDetail) return null

    const [operationContent, frontendContent] = await Promise.all([
      getSideNoteContent(normalizedPackageId, 'OPERATION'),
      getSideNoteContent(normalizedPackageId, 'FRONTEND'),
    ])

    const releaseType = await resolveReleaseType(packageDetail)
    const appName = normalizeText(operationContent.appName, 160) || normalizeText(packageDetail.package_name, 160)
    const appVersion = normalizeText(frontendContent.appVersion, 80)
    const appConsoleUrl = normalizeText(frontendContent.appConsoleUrl, 1000)

    await pool.query(
      `INSERT INTO app_version_releases
       (matrix_package_id, release_type, release_status, urgency_code, app_version, app_name, app_developer, app_company_subject, app_console_url, app_id, domain_info, owner_user_id, owner_name, created_by, updated_by)
       VALUES (?, ?, 'PENDING_PLAN', 'P1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [
        normalizedPackageId,
        releaseType,
        appVersion,
        appName,
        normalizeText(packageDetail.developer_account_name, 160),
        normalizeText(packageDetail.developer_company_name, 160),
        appConsoleUrl,
        normalizeText(packageDetail.app_id, 120),
        normalizeText(packageDetail.domain_info, 255),
        packageDetail.owner_user_id || null,
        normalizeText(packageDetail.owner_name, 80),
        userId || null,
        userId || null,
      ],
    )

    return getByMatrixPackageId(normalizedPackageId)
  },
}

module.exports = AppVersionRelease
