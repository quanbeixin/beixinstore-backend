const pool = require('../utils/db')
const MatrixPackage = require('./MatrixPackage')
const MatrixPackageReviewPlan = require('./MatrixPackageReviewPlan')
const MatrixPackageSideNote = require('./MatrixPackageSideNote')
const MatrixPackageNotificationService = require('../services/matrixPackageNotificationService')

const RELEASE_STATUS_OPTIONS = [
  { code: 'PENDING_PLAN', name: '待规划', color: 'magenta', sort: 10 },
  { code: 'QUEUED', name: '排队中', color: 'geekblue', sort: 20 },
  { code: 'IN_REVIEW', name: '审核中', color: 'gold', sort: 30 },
  { code: 'LISTED', name: '已上架', color: 'lime', sort: 40 },
  { code: 'REJECTED', name: '被拒审', color: 'red', sort: 50 },
  { code: 'CANCELLED', name: '取消', color: 'default', sort: 60 },
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
const RELEASE_STATUS_TO_REVIEW_STAGE_MAP = new Map([
  ['LISTED', 'HOT_STANDBY'],
])
const DEFAULT_RELEASE_OWNER_NAME = '赵佳颖'

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
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`
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

function normalizeApplicationItems(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => ({
      package_id: toPositiveInt(item?.package_id),
      app_version: normalizeText(item?.app_version, 80),
      app_console_url: normalizeText(item?.app_console_url, 1000),
      urgency_code: normalizeOptionalCode(item?.urgency_code),
      expected_submit_at: normalizeOptionalDateTime(item?.expected_submit_at),
    }))
    .filter((item) => item.package_id > 0)
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
    release_request_no: row.release_request_no || '',
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
    previous_release_info: row.previous_release_info || '',
    app_id: row.app_id || '',
    domain_info: row.domain_info || '',
    related_demand_id: row.related_demand_id || '',
    related_demand_name: row.related_demand_name || '',
    expected_submit_at: row.expected_submit_at || null,
    submitted_at: row.submitted_at || null,
    listed_at: row.listed_at || null,
    applicant_user_id: row.applicant_user_id ? Number(row.applicant_user_id) : null,
    applicant_name: row.applicant_display_name || row.applicant_name || '',
    requested_at: row.requested_at || null,
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
    clauses.push('(avr.release_request_no LIKE ? OR avr.app_name LIKE ? OR avr.app_version LIKE ? OR avr.app_developer LIKE ? OR avr.app_company_subject LIKE ? OR avr.app_id LIKE ? OR avr.domain_info LIKE ? OR avr.related_demand_id LIKE ? OR avr.related_demand_name LIKE ?)')
    const like = `%${keyword}%`
    params.push(like, like, like, like, like, like, like, like, like)
  }

  const releaseStatus = normalizeOptionalCode(filters.release_status)
  if (releaseStatus) {
    clauses.push('avr.release_status = ?')
    params.push(releaseStatus)
  }

  const urgencyCode = normalizeOptionalCode(filters.urgency_code)
  if (urgencyCode) {
    clauses.push('avr.urgency_code = ?')
    params.push(urgencyCode)
  }

  const releaseType = normalizeOptionalCode(filters.release_type)
  if (releaseType) {
    clauses.push('avr.release_type = ?')
    params.push(releaseType)
  }

  const appName = normalizeText(filters.app_name, 100)
  if (appName) {
    clauses.push('avr.app_name LIKE ?')
    params.push(`%${appName}%`)
  }

  const appDeveloper = normalizeText(filters.app_developer, 100)
  if (appDeveloper) {
    clauses.push('(avr.app_developer LIKE ? OR avr.app_company_subject LIKE ?)')
    params.push(`%${appDeveloper}%`, `%${appDeveloper}%`)
  }

  const releaseRequestNo = normalizeText(filters.release_request_no, 100)
  if (releaseRequestNo) {
    clauses.push('(avr.release_request_no LIKE ? OR avr.id = ?)')
    params.push(`%${releaseRequestNo}%`, toPositiveInt(releaseRequestNo) || 0)
  }

  const matrixPackageId = toPositiveInt(filters.matrix_package_id || filters.package_id)
  if (matrixPackageId) {
    clauses.push('avr.matrix_package_id = ?')
    params.push(matrixPackageId)
  }

  return {
    whereSql: clauses.join(' AND '),
    params,
  }
}

async function getLatestAppConsoleUrlByPackageId(packageId) {
  const normalizedPackageId = toPositiveInt(packageId)
  if (!normalizedPackageId) return ''
  const [rows] = await pool.query(
    `SELECT app_console_url
     FROM app_version_releases
     WHERE matrix_package_id = ?
       AND deleted_at IS NULL
       AND COALESCE(NULLIF(app_console_url, ''), '') <> ''
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [normalizedPackageId],
  )
  return normalizeText(rows?.[0]?.app_console_url, 1000)
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
       DATE_FORMAT(avr.expected_submit_at, '%Y-%m-%d') AS expected_submit_at,
       DATE_FORMAT(avr.submitted_at, '%Y-%m-%d') AS submitted_at,
       DATE_FORMAT(avr.listed_at, '%Y-%m-%d') AS listed_at,
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

async function resolveDemandInfo(demandId) {
  const normalizedDemandId = normalizeText(demandId, 64)
  if (!normalizedDemandId) return { id: '', name: '' }
  const [rows] = await pool.query(
    `SELECT id, name
     FROM work_demands
     WHERE id = ?
     LIMIT 1`,
    [normalizedDemandId],
  )
  if (!rows[0]) {
    const err = new Error('related_demand_not_found')
    err.statusCode = 400
    err.message = '关联需求不存在'
    throw err
  }
  return {
    id: normalizeText(rows[0].id, 64),
    name: normalizeText(rows[0].name, 255),
  }
}

async function resolveUserInfo(userId) {
  const normalizedUserId = toPositiveInt(userId)
  if (!normalizedUserId) return { id: null, name: '' }
  const [rows] = await pool.query(
    `SELECT id, username, COALESCE(real_name, '') AS real_name
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [normalizedUserId],
  )
  const user = rows[0]
  if (!user) return { id: normalizedUserId, name: '' }
  return {
    id: Number(user.id),
    name: normalizeText(user.real_name || user.username, 80),
  }
}

async function resolveDefaultReleaseOwnerInfo(fallback = {}) {
  const [rows] = await pool.query(
    `SELECT id, username, COALESCE(real_name, '') AS real_name
     FROM users
     WHERE COALESCE(status_code, 'ACTIVE') = 'ACTIVE'
       AND (real_name = ? OR username = ?)
     ORDER BY id ASC
     LIMIT 1`,
    [DEFAULT_RELEASE_OWNER_NAME, DEFAULT_RELEASE_OWNER_NAME],
  )
  const user = rows[0]
  if (user) {
    return {
      id: Number(user.id),
      name: normalizeText(user.real_name || user.username, 80),
    }
  }
  return {
    id: toPositiveInt(fallback.owner_user_id) || null,
    name: normalizeText(fallback.owner_name, 80),
  }
}

async function assignReleaseRequestNo(releaseId, conn = pool) {
  const normalizedReleaseId = toPositiveInt(releaseId)
  if (!normalizedReleaseId) return
  await conn.query(
    `UPDATE app_version_releases
     SET release_request_no = CONCAT('APPREL', DATE_FORMAT(COALESCE(requested_at, created_at, NOW()), '%Y%m%d'), LPAD(id, 6, '0'))
     WHERE id = ?
       AND (release_request_no IS NULL OR release_request_no = '')`,
    [normalizedReleaseId],
  )
}

function resolveReviewStageCodeByRelease(releaseStatus, releaseType) {
  if (releaseStatus === 'IN_REVIEW') {
    return releaseType === 'FIRST_RELEASE' ? 'FIRST_SUBMITTED' : 'SECOND_SUBMITTED'
  }
  return RELEASE_STATUS_TO_REVIEW_STAGE_MAP.get(releaseStatus) || null
}

async function syncReviewPlanByReleaseStatus(existing, nextReleaseStatus, syncContext = {}, userId) {
  const nextReleaseType = normalizeOptionalCode(syncContext.release_type || existing?.release_type)
  const mappedStageCode = resolveReviewStageCodeByRelease(nextReleaseStatus, nextReleaseType)
  const previousReleaseStatus = normalizeOptionalCode(existing?.release_status)
  const previousReleaseType = normalizeOptionalCode(existing?.release_type)
  const nextSubmittedAt = syncContext.submitted_at || null
  const previousSubmittedAt = existing?.submitted_at || null
  const isFirstRelease = nextReleaseType === 'FIRST_RELEASE'
  const shouldSyncSubmitAt = nextReleaseStatus === 'IN_REVIEW'
    && (
      previousReleaseStatus !== nextReleaseStatus
      || nextSubmittedAt !== previousSubmittedAt
      || previousReleaseType !== nextReleaseType
    )
  if (!mappedStageCode || (previousReleaseStatus === nextReleaseStatus && !shouldSyncSubmitAt && previousReleaseType === nextReleaseType)) return

  const packageId = toPositiveInt(existing?.matrix_package_id)
  if (!packageId) return

  const beforePackage = await MatrixPackage.getById(packageId)
  await MatrixPackageReviewPlan.transition(packageId, mappedStageCode, {}, userId)
  if (shouldSyncSubmitAt) {
    await pool.query(
      `UPDATE matrix_package_review_plans
       SET actual_first_submit_at = CASE
             WHEN ? = 1 THEN ?
             ELSE actual_first_submit_at
           END,
           actual_second_submit_at = CASE
             WHEN ? = 1 THEN ?
             ELSE actual_second_submit_at
           END,
           updated_by = ?
       WHERE package_id = ?`,
      [
        isFirstRelease ? 1 : 0,
        nextSubmittedAt || new Date(),
        isFirstRelease ? 0 : 1,
        nextSubmittedAt || new Date(),
        userId || null,
        packageId,
      ],
    )
  }
  const afterPackage = await MatrixPackage.getById(packageId)
  if (!beforePackage || !afterPackage) return

  await MatrixPackageNotificationService.triggerStatusChangeNotifications({
    beforePackage,
    afterPackage,
    operatorUserId: userId || null,
  })
}

function createGroupNode(key, rowType, groupName, extra = {}) {
  return {
    key,
    row_type: rowType,
    group_name: groupName,
    release_count: 0,
    children: [],
    ...extra,
  }
}

function incrementGroupCount(node) {
  if (!node) return
  node.release_count = Number(node.release_count || 0) + 1
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
         DATE_FORMAT(avr.expected_submit_at, '%Y-%m-%d') AS expected_submit_at,
         DATE_FORMAT(avr.submitted_at, '%Y-%m-%d') AS submitted_at,
         DATE_FORMAT(avr.listed_at, '%Y-%m-%d') AS listed_at,
         DATE_FORMAT(avr.requested_at, '%Y-%m-%d') AS requested_at,
         DATE_FORMAT(avr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(avr.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
         COALESCE(NULLIF(applicantUser.real_name, ''), applicantUser.username) AS applicant_display_name,
         COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username) AS owner_display_name
       FROM app_version_releases avr
       LEFT JOIN users applicantUser
         ON applicantUser.id = avr.applicant_user_id
       LEFT JOIN users ownerUser
         ON ownerUser.id = avr.owner_user_id
       WHERE ${whereSql}
       ORDER BY
         avr.created_at DESC,
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

  async listGrouped(filters = {}) {
    const { whereSql, params } = buildWhere(filters)
    const [rows] = await pool.query(
      `SELECT
         avr.*,
         DATE_FORMAT(avr.expected_submit_at, '%Y-%m-%d') AS expected_submit_at,
         DATE_FORMAT(avr.submitted_at, '%Y-%m-%d') AS submitted_at,
         DATE_FORMAT(avr.listed_at, '%Y-%m-%d') AS listed_at,
         DATE_FORMAT(avr.requested_at, '%Y-%m-%d') AS requested_at,
         DATE_FORMAT(avr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(avr.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
         COALESCE(NULLIF(applicantUser.real_name, ''), applicantUser.username) AS applicant_display_name,
         COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username) AS owner_display_name
       FROM app_version_releases avr
       LEFT JOIN users applicantUser
         ON applicantUser.id = avr.applicant_user_id
       LEFT JOIN users ownerUser
         ON ownerUser.id = avr.owner_user_id
       WHERE ${whereSql}
       ORDER BY
         COALESCE(NULLIF(avr.app_developer, ''), '未设置') ASC,
         COALESCE(NULLIF(avr.app_company_subject, ''), '未设置') ASC,
         COALESCE(NULLIF(avr.app_name, ''), '未设置') ASC,
         avr.created_at DESC,
         avr.id DESC`,
      params,
    )

    const developerMap = new Map()
    const appKeySet = new Set()
    const statusKeySet = new Set()

    rows.map(mapRow).filter(Boolean).forEach((release) => {
      const developerName = normalizeText(release.app_developer, 160) || '未设置开发者'
      const companySubject = normalizeText(release.app_company_subject, 160)
      const developerKey = `${developerName}::${companySubject}`
      if (!developerMap.has(developerKey)) {
        developerMap.set(developerKey, createGroupNode(`developer:${developerKey}`, 'developer', developerName, {
          app_developer: developerName,
          app_company_subject: companySubject,
          __appMap: new Map(),
        }))
      }

      const developerNode = developerMap.get(developerKey)
      incrementGroupCount(developerNode)

      const appName = normalizeText(release.app_name, 160) || '未设置APP'
      const appIdentity = normalizeText(release.app_id, 120) || normalizeText(release.domain_info, 255) || String(release.matrix_package_id || appName)
      const appKey = `${developerKey}::${appIdentity}`
      appKeySet.add(appKey)
      if (!developerNode.__appMap.has(appKey)) {
        developerNode.__appMap.set(appKey, createGroupNode(`app:${appKey}`, 'app', appName, {
          app_name: appName,
          app_id: release.app_id || '',
          domain_info: release.domain_info || '',
          matrix_package_id: release.matrix_package_id || null,
          __statusMap: new Map(),
        }))
        developerNode.children.push(developerNode.__appMap.get(appKey))
      }

      const appNode = developerNode.__appMap.get(appKey)
      incrementGroupCount(appNode)

      const statusCode = release.release_status || 'UNKNOWN'
      const statusKey = `${appKey}::${statusCode}`
      statusKeySet.add(statusKey)
      if (!appNode.__statusMap.has(statusKey)) {
        appNode.__statusMap.set(statusKey, createGroupNode(`status:${statusKey}`, 'status', release.release_status_name || statusCode, {
          release_status: statusCode,
          release_status_name: release.release_status_name || statusCode,
          release_status_color: release.release_status_color || 'default',
        }))
        appNode.children.push(appNode.__statusMap.get(statusKey))
      }

      const statusNode = appNode.__statusMap.get(statusKey)
      incrementGroupCount(statusNode)
      statusNode.children.push({
        ...release,
        key: `release:${release.id}`,
        row_type: 'release',
        group_name: release.release_request_no || release.app_version || `记录 ${release.id}`,
        release_count: 1,
      })
    })

    const stripInternalMaps = (node) => {
      const { __appMap, __statusMap, ...rest } = node
      return {
        ...rest,
        children: Array.isArray(rest.children) ? rest.children.map(stripInternalMaps) : [],
      }
    }

    return {
      tree: Array.from(developerMap.values()).map(stripInternalMaps),
      total: rows.length,
      developer_count: developerMap.size,
      app_count: appKeySet.size,
      status_group_count: statusKeySet.size,
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
         DATE_FORMAT(avr.expected_submit_at, '%Y-%m-%d') AS expected_submit_at,
         DATE_FORMAT(avr.submitted_at, '%Y-%m-%d') AS submitted_at,
         DATE_FORMAT(avr.listed_at, '%Y-%m-%d') AS listed_at,
         DATE_FORMAT(avr.requested_at, '%Y-%m-%d') AS requested_at,
         DATE_FORMAT(avr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(avr.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
         COALESCE(NULLIF(applicantUser.real_name, ''), applicantUser.username) AS applicant_display_name,
         COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username) AS owner_display_name
       FROM app_version_releases avr
       LEFT JOIN users applicantUser
         ON applicantUser.id = avr.applicant_user_id
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

    const releaseType = normalizeOptionalCode(payload.release_type || existing.release_type)
    if (!RELEASE_TYPE_MAP.has(releaseType)) {
      const err = new Error('release_type_invalid')
      err.statusCode = 400
      err.message = '发版类型不合法'
      throw err
    }

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
    const owner = Object.prototype.hasOwnProperty.call(payload, 'owner_user_id')
      ? await resolveUserInfo(payload.owner_user_id)
      : { id: existing.owner_user_id || null, name: existing.owner_name || '' }
    const previousReleaseInfo = Object.prototype.hasOwnProperty.call(payload, 'previous_release_info')
      ? normalizeText(payload.previous_release_info, 255)
      : existing.previous_release_info
    const remark = Object.prototype.hasOwnProperty.call(payload, 'remark')
      ? normalizeText(payload.remark, 1000)
      : existing.remark

    await pool.query(
      `UPDATE app_version_releases
       SET release_type = ?,
           release_status = ?,
           urgency_code = ?,
           expected_submit_at = ?,
           submitted_at = ?,
           listed_at = ?,
           owner_user_id = ?,
           owner_name = ?,
           previous_release_info = ?,
           remark = ?,
           updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [
        releaseType,
        releaseStatus,
        urgencyCode,
        expectedSubmitAt || null,
        submittedAt || null,
        listedAt || null,
        owner.id || null,
        owner.name || null,
        previousReleaseInfo || null,
        remark || null,
        userId || null,
        releaseId,
      ],
    )

    await syncReviewPlanByReleaseStatus(
      existing,
      releaseStatus,
      {
        release_type: releaseType,
        submitted_at: submittedAt || null,
      },
      userId,
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
    const releaseType = normalizeOptionalCode(payload.release_type || 'VERSION_UPDATE')
    if (!RELEASE_TYPE_MAP.has(releaseType)) {
      const err = new Error('release_type_invalid')
      err.statusCode = 400
      err.message = '发版类型不合法'
      throw err
    }

    const remark = normalizeText(payload.remark, 1000)
    const relatedDemand = await resolveDemandInfo(payload.related_demand_id)
    const applicant = await resolveUserInfo(userId)
    const items = normalizeApplicationItems(payload.items)
    const packageIds = items.map((item) => item.package_id)
    if (packageIds.length === 0) {
      const err = new Error('package_ids_required')
      err.statusCode = 400
      err.message = '请选择app包'
      throw err
    }

    for (const item of items) {
      if (!item.app_version) {
        const err = new Error('app_version_required')
        err.statusCode = 400
        err.message = '版本号不能为空'
        throw err
      }
      if (!URGENCY_MAP.has(item.urgency_code)) {
        const err = new Error('urgency_code_invalid')
        err.statusCode = 400
        err.message = '紧急程度不合法'
        throw err
      }
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
    const itemMap = new Map(items.map((item) => [item.package_id, item]))
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      for (const packageDetail of packageDetails) {
        const applicationItem = itemMap.get(Number(packageDetail.id))
        if (!applicationItem) continue
        const [operationContent, frontendContent] = await Promise.all([
          getSideNoteContent(packageDetail.id, 'OPERATION'),
          getSideNoteContent(packageDetail.id, 'FRONTEND'),
        ])
        const appName = normalizeText(operationContent.appName, 160) || normalizeText(packageDetail.package_name, 160)
        const appConsoleUrl = applicationItem.app_console_url
          || await getLatestAppConsoleUrlByPackageId(packageDetail.id)
          || normalizeText(frontendContent.appConsoleUrl, 1000)
        if (!appConsoleUrl) {
          const err = new Error('app_console_url_required')
          err.statusCode = 400
          err.message = `${packageDetail.package_name || `矩阵包${packageDetail.id}`} 的APP后台地址不能为空`
          throw err
        }
        const releaseOwner = await resolveDefaultReleaseOwnerInfo(packageDetail)

        const [result] = await connection.query(
          `INSERT INTO app_version_releases
           (matrix_package_id, release_type, release_status, urgency_code, app_version, app_name, app_developer, app_company_subject, app_console_url, app_id, domain_info, related_demand_id, related_demand_name, applicant_user_id, applicant_name, requested_at, owner_user_id, owner_name, expected_submit_at, remark, created_by, updated_by)
           VALUES (?, ?, 'PENDING_PLAN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?)`,
          [
            packageDetail.id,
            releaseType,
            applicationItem.urgency_code,
            applicationItem.app_version,
            appName,
            normalizeText(packageDetail.developer_account_name, 160),
            normalizeText(packageDetail.developer_company_name, 160),
            appConsoleUrl,
            normalizeText(packageDetail.app_id, 120),
            normalizeText(packageDetail.domain_info, 255),
            relatedDemand.id || null,
            relatedDemand.name || null,
            applicant.id,
            applicant.name || null,
            releaseOwner.id || null,
            releaseOwner.name || null,
            applicationItem.expected_submit_at,
            remark || null,
            userId || null,
            userId || null,
          ],
        )
        await assignReleaseRequestNo(result.insertId, connection)
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
    const applicant = await resolveUserInfo(userId)
    const appName = normalizeText(operationContent.appName, 160) || normalizeText(packageDetail.package_name, 160)
    const appVersion = normalizeText(frontendContent.appVersion, 80)
    const appConsoleUrl = normalizeText(frontendContent.appConsoleUrl, 1000)
    const releaseOwner = await resolveDefaultReleaseOwnerInfo(packageDetail)

    const [result] = await pool.query(
      `INSERT INTO app_version_releases
       (matrix_package_id, release_type, release_status, urgency_code, app_version, app_name, app_developer, app_company_subject, app_console_url, app_id, domain_info, applicant_user_id, applicant_name, requested_at, owner_user_id, owner_name, created_by, updated_by)
       VALUES (?, ?, 'PENDING_PLAN', 'P1', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)
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
        applicant.id,
        applicant.name || null,
        releaseOwner.id || null,
        releaseOwner.name || null,
        userId || null,
        userId || null,
      ],
    )
    await assignReleaseRequestNo(result.insertId)

    return getByMatrixPackageId(normalizedPackageId)
  },
}

module.exports = AppVersionRelease
