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
const DEFAULT_GROUP_BY = ['developer', 'app', 'status']
const GROUP_BY_OPTIONS = [
  { code: 'developer', name: '开发者' },
  { code: 'app', name: 'APP' },
  { code: 'status', name: '发版进度' },
  { code: 'company_subject', name: '公司主体' },
  { code: 'owner', name: '负责人' },
  { code: 'urgency', name: '紧急程度' },
]
const GROUP_BY_MAP = new Map(GROUP_BY_OPTIONS.map((item) => [item.code, item]))

function toPositiveInt(value) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function normalizeText(value, maxLength = 255) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function formatOperationValue(value, fallback = '-') {
  const text = normalizeText(value, 120)
  return text || fallback
}

function formatOperationDate(value) {
  const text = normalizeText(value, 32)
  return text ? text.slice(0, 10) : ''
}

function normalizeOptionalCode(value) {
  const text = String(value || '').trim().toUpperCase()
  return text || null
}

function normalizeGroupBy(value) {
  const rawList = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  const normalized = []
  const seen = new Set()
  rawList.forEach((item) => {
    const code = String(item || '').trim().toLowerCase()
    if (!GROUP_BY_MAP.has(code) || seen.has(code)) return
    seen.add(code)
    normalized.push(code)
  })
  return normalized.length > 0 ? normalized : DEFAULT_GROUP_BY.slice()
}

function getGroupValue(release, groupBy) {
  switch (groupBy) {
    case 'developer':
      return normalizeText(release?.app_developer, 160) || '未设置开发者'
    case 'app':
      return normalizeText(release?.app_name, 160) || '未设置APP'
    case 'status':
      return {
        value: normalizeOptionalCode(release?.release_status) || 'UNKNOWN',
        name: normalizeText(release?.release_status_name, 80) || normalizeOptionalCode(release?.release_status) || '未设置进度',
        color: normalizeText(release?.release_status_color, 32) || 'default',
      }
    case 'company_subject':
      return normalizeText(release?.app_company_subject, 160) || '未设置公司主体'
    case 'owner':
      return normalizeText(release?.owner_name, 80) || '未设置负责人'
    case 'urgency':
      return {
        value: normalizeOptionalCode(release?.urgency_code) || 'UNKNOWN',
        name: normalizeText(release?.urgency_name, 80) || normalizeOptionalCode(release?.urgency_code) || '未设置紧急程度',
        color: normalizeText(release?.urgency_color, 32) || 'default',
      }
    default:
      return ''
  }
}

function buildLeafReleaseRow(release) {
  return {
    ...release,
    key: `release:${release.id}`,
    row_type: 'release',
    group_name: release.release_request_no || release.app_version || `记录 ${release.id}`,
    release_count: 1,
  }
}

function buildGroupedTree(rows = [], groupBy = DEFAULT_GROUP_BY, depth = 0, path = []) {
  if (depth >= groupBy.length) {
    return rows.map(buildLeafReleaseRow)
  }

  const groupKey = groupBy[depth]
  const groupMeta = GROUP_BY_MAP.get(groupKey)
  if (!groupMeta) {
    return buildGroupedTree(rows, DEFAULT_GROUP_BY, 0, [])
  }

  const groupMap = new Map()
  rows.forEach((release) => {
    const raw = getGroupValue(release, groupKey)
    const groupValue = typeof raw === 'object' && raw !== null ? raw.value : raw
    const groupName = typeof raw === 'object' && raw !== null ? raw.name : raw
    const groupColor = typeof raw === 'object' && raw !== null ? raw.color : 'default'
    const normalizedValue = normalizeText(groupValue, 255) || `未设置${groupMeta.name}`
    if (!groupMap.has(normalizedValue)) {
      groupMap.set(normalizedValue, {
        key: `group:${path.concat(`${groupKey}:${normalizedValue}`).join('>')}`,
        row_type: 'group',
        group_field: groupKey,
        group_value: normalizedValue,
        group_name: groupName || normalizedValue,
        group_color: groupColor,
        release_count: 0,
        children: [],
      })
    }
    const node = groupMap.get(normalizedValue)
    node.release_count += 1
    node.children.push(release)
  })

  return Array.from(groupMap.values()).map((node) => ({
    ...node,
    children: buildGroupedTree(node.children, groupBy, depth + 1, path.concat(`${groupKey}:${node.group_value}`)),
  }))
}

function computeGroupCounts(rows = [], groupBy = DEFAULT_GROUP_BY) {
  const result = {}
  groupBy.forEach((field) => {
    const values = new Set()
    rows.forEach((item) => {
      const raw = getGroupValue(item, field)
      const value = typeof raw === 'object' && raw !== null ? raw.value : raw
      values.add(normalizeText(value, 255) || `未设置${GROUP_BY_MAP.get(field)?.name || field}`)
    })
    result[field] = values.size
  })
  return result
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

function buildGeneratedAppConsoleUrl(packageDetail = {}, operationContent = {}, frontendContent = {}) {
  const developerAccountId = normalizeText(packageDetail.developer_account_account_id, 120)
  const prodGooglePlatformAppId = normalizeText(
    operationContent.prodGooglePlatformAppId || frontendContent.prodGooglePlatformAppId,
    120,
  )
  return developerAccountId && prodGooglePlatformAppId
    ? `https://play.google.com/console/u/0/developers/${developerAccountId}/app/${prodGooglePlatformAppId}/publishing`
    : ''
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
    last_operation_summary: row.last_operation_summary || '',
    last_operation_user_id: row.last_operation_user_id ? Number(row.last_operation_user_id) : null,
    last_operation_user_name: row.last_operation_user_name || '',
    last_operation_at: row.last_operation_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    version_info_available: Number(row.version_info_available || 0) === 1,
    version_info_id: row.version_info_id ? Number(row.version_info_id) : null,
    version_info_updated_at: row.version_info_updated_at || null,
  }
}

function buildOperationSummary(existing, next) {
  const changes = []
  const pushCodeChange = (label, beforeCode, afterCode, optionMap) => {
    const before = normalizeOptionalCode(beforeCode)
    const after = normalizeOptionalCode(afterCode)
    if (before === after) return
    changes.push(`${label}：${formatOperationValue(optionMap.get(before || '')?.name || before)} -> ${formatOperationValue(optionMap.get(after || '')?.name || after)}`)
  }
  const pushTextChange = (label, beforeValue, afterValue) => {
    const before = normalizeText(beforeValue, 255)
    const after = normalizeText(afterValue, 255)
    if (before === after) return
    changes.push(`${label}：${formatOperationValue(before)} -> ${formatOperationValue(after)}`)
  }
  const pushDateChange = (label, beforeValue, afterValue) => {
    const before = formatOperationDate(beforeValue)
    const after = formatOperationDate(afterValue)
    if (before === after) return
    changes.push(`${label}：${formatOperationValue(before)} -> ${formatOperationValue(after)}`)
  }

  pushCodeChange('发版类型', existing?.release_type, next?.release_type, RELEASE_TYPE_MAP)
  pushCodeChange('发版进度', existing?.release_status, next?.release_status, RELEASE_STATUS_MAP)
  pushCodeChange('紧急程度', existing?.urgency_code, next?.urgency_code, URGENCY_MAP)
  pushDateChange('送审预期', existing?.expected_submit_at, next?.expected_submit_at)
  pushDateChange('送审日期', existing?.submitted_at, next?.submitted_at)
  pushDateChange('上架日期', existing?.listed_at, next?.listed_at)
  pushTextChange('发版负责人', existing?.owner_name, next?.owner_name)
  pushTextChange('前序发版', existing?.previous_release_info, next?.previous_release_info)

  if (normalizeText(existing?.remark, 1000) !== normalizeText(next?.remark, 1000)) {
    changes.push('备注：已更新')
  }

  const summary = changes.length > 0 ? changes.join('；') : '保存记录（无字段变化）'
  return normalizeText(summary, 1000)
}

function buildMergeRemark(target = {}) {
  const targetLabel = normalizeText(
    [
      target.release_request_no || '',
      target.app_version ? `版本：${target.app_version}` : '',
    ].filter(Boolean).join(' / '),
    255,
  ) || normalizeText(target.app_version || target.release_request_no || `记录${target.id || ''}`, 255)
  return `该版本已合并至${targetLabel}版本申请`
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
       DATE_FORMAT(avr.last_operation_at, '%Y-%m-%d %H:%i:%s') AS last_operation_at,
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

async function resolveMatrixPackageReleaseApplicant(packageDetail = {}) {
  const ownerUserId = toPositiveInt(packageDetail.owner_user_id)
  if (ownerUserId) {
    const owner = await resolveUserInfo(ownerUserId)
    return {
      id: owner.id || ownerUserId,
      name: owner.name || normalizeText(packageDetail.owner_name, 80) || '系统创建',
    }
  }

  return {
    id: null,
    name: '系统创建',
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
  const shouldSyncPackageStatus = !(beforePackage && String(beforePackage.status_code || '').trim().toUpperCase() === 'DELIVERING')
  await MatrixPackageReviewPlan.transition(
    packageId,
    mappedStageCode,
    {},
    userId,
    {
      syncPackageStatus: shouldSyncPackageStatus,
    },
  )
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
         DATE_FORMAT(avr.last_operation_at, '%Y-%m-%d %H:%i:%s') AS last_operation_at,
         DATE_FORMAT(avr.requested_at, '%Y-%m-%d') AS requested_at,
         DATE_FORMAT(avr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(avr.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
         (
           SELECT mpv.id
           FROM matrix_package_versions mpv
           WHERE mpv.matrix_package_id = avr.matrix_package_id
             AND mpv.version_number = avr.app_version
           LIMIT 1
         ) AS version_info_id,
         (
           SELECT CASE WHEN mpv.id IS NOT NULL THEN 1 ELSE 0 END
           FROM matrix_package_versions mpv
           WHERE mpv.matrix_package_id = avr.matrix_package_id
             AND mpv.version_number = avr.app_version
           LIMIT 1
         ) AS version_info_available,
         (
           SELECT DATE_FORMAT(mpv.updated_at, '%Y-%m-%d %H:%i:%s')
           FROM matrix_package_versions mpv
           WHERE mpv.matrix_package_id = avr.matrix_package_id
             AND mpv.version_number = avr.app_version
           LIMIT 1
         ) AS version_info_updated_at,
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
    const groupBy = normalizeGroupBy(filters.group_by || filters.groupBy || filters['group_by[]'])
    const [rows] = await pool.query(
      `SELECT
         avr.*,
         DATE_FORMAT(avr.expected_submit_at, '%Y-%m-%d') AS expected_submit_at,
         DATE_FORMAT(avr.submitted_at, '%Y-%m-%d') AS submitted_at,
         DATE_FORMAT(avr.listed_at, '%Y-%m-%d') AS listed_at,
         DATE_FORMAT(avr.last_operation_at, '%Y-%m-%d %H:%i:%s') AS last_operation_at,
         DATE_FORMAT(avr.requested_at, '%Y-%m-%d') AS requested_at,
         DATE_FORMAT(avr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(avr.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
         (
           SELECT mpv.id FROM matrix_package_versions mpv
           WHERE mpv.matrix_package_id = avr.matrix_package_id AND mpv.version_number = avr.app_version
           LIMIT 1
         ) AS version_info_id,
         (
           SELECT CASE WHEN mpv.id IS NOT NULL THEN 1 ELSE 0 END FROM matrix_package_versions mpv
           WHERE mpv.matrix_package_id = avr.matrix_package_id AND mpv.version_number = avr.app_version
           LIMIT 1
         ) AS version_info_available,
         (
           SELECT DATE_FORMAT(mpv.updated_at, '%Y-%m-%d %H:%i:%s') FROM matrix_package_versions mpv
           WHERE mpv.matrix_package_id = avr.matrix_package_id AND mpv.version_number = avr.app_version
           LIMIT 1
         ) AS version_info_updated_at,
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

    const mappedRows = rows.map(mapRow).filter(Boolean)
    const tree = buildGroupedTree(mappedRows, groupBy)
    const groupCounts = computeGroupCounts(mappedRows, groupBy)

    return {
      tree,
      total: rows.length,
      group_by: groupBy,
      group_by_options: GROUP_BY_OPTIONS,
      group_counts: groupCounts,
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
         DATE_FORMAT(avr.last_operation_at, '%Y-%m-%d %H:%i:%s') AS last_operation_at,
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

  async getVersionInfoByReleaseId(id) {
    const releaseId = toPositiveInt(id)
    if (!releaseId) return null
    const [rows] = await pool.query(
      `SELECT
         mpv.id,
         mpv.matrix_package_id,
         mpv.version_number,
         mpv.version_info,
         DATE_FORMAT(mpv.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(mpv.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM app_version_releases avr
       INNER JOIN matrix_package_versions mpv
         ON mpv.matrix_package_id = avr.matrix_package_id
        AND mpv.version_number = avr.app_version
       WHERE avr.id = ? AND avr.deleted_at IS NULL
       LIMIT 1`,
      [releaseId],
    )
    const row = rows[0]
    return row
      ? {
          id: Number(row.id),
          matrix_package_id: Number(row.matrix_package_id),
          version_number: row.version_number || '',
          version_info: row.version_info || '',
          created_at: row.created_at || null,
          updated_at: row.updated_at || null,
        }
      : null
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
    const operator = await resolveUserInfo(userId)
    const operationSummary = buildOperationSummary(existing, {
      release_type: releaseType,
      release_status: releaseStatus,
      urgency_code: urgencyCode,
      expected_submit_at: expectedSubmitAt,
      submitted_at: submittedAt,
      listed_at: listedAt,
      owner_name: owner.name || '',
      previous_release_info: previousReleaseInfo,
      remark,
    })

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
           last_operation_summary = ?,
           last_operation_user_id = ?,
           last_operation_user_name = ?,
           last_operation_at = NOW(),
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
        operationSummary || null,
        operator.id || userId || null,
        operator.name || null,
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

  async listSyncTargets(id) {
    const releaseId = toPositiveInt(id)
    if (!releaseId) return []

    const current = await this.getById(releaseId)
    if (!current) return []

    const [rows] = await pool.query(
      `SELECT
         avr.id,
         avr.release_request_no,
         avr.app_version,
         avr.release_status,
         avr.remark,
         DATE_FORMAT(avr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         COALESCE(NULLIF(applicantUser.real_name, ''), applicantUser.username) AS applicant_display_name
       FROM app_version_releases avr
       LEFT JOIN users applicantUser
         ON applicantUser.id = avr.applicant_user_id
       WHERE avr.matrix_package_id = ?
         AND avr.deleted_at IS NULL
         AND avr.id > ?
         AND avr.release_status IN ('PENDING_PLAN', 'QUEUED', 'IN_REVIEW')
       ORDER BY avr.created_at ASC, avr.id ASC`,
      [current.matrix_package_id || 0, releaseId],
    )

    return rows.map((row) => ({
      id: Number(row.id),
      release_request_no: row.release_request_no || '',
      app_version: row.app_version || '',
      release_status: row.release_status || '',
      remark: row.remark || '',
      created_at: row.created_at || '',
      applicant_name: row.applicant_display_name || '',
      label: normalizeText(
        [
          row.release_request_no || `记录${row.id}`,
          row.app_version ? `版本：${row.app_version}` : '',
        ].filter(Boolean).join(' / '),
        255,
      ),
    }))
  },

  async mergeToTargetRelease(id, targetReleaseId, userId, options = {}) {
    const releaseId = toPositiveInt(id)
    const normalizedTargetReleaseId = toPositiveInt(targetReleaseId)
    const shouldSyncPreviousReleaseInfo = options.sync_previous_release_info !== false
    if (!releaseId || !normalizedTargetReleaseId) return null
    if (releaseId === normalizedTargetReleaseId) {
      const err = new Error('merge_target_invalid')
      err.statusCode = 400
      err.message = '不能同步到当前发版记录本身'
      throw err
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [currentRows] = await conn.query(
        `SELECT
           avr.*,
           DATE_FORMAT(avr.expected_submit_at, '%Y-%m-%d') AS expected_submit_at,
           DATE_FORMAT(avr.submitted_at, '%Y-%m-%d') AS submitted_at,
           DATE_FORMAT(avr.listed_at, '%Y-%m-%d') AS listed_at,
           DATE_FORMAT(avr.last_operation_at, '%Y-%m-%d %H:%i:%s') AS last_operation_at,
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
         WHERE avr.id = ?
           AND avr.deleted_at IS NULL
         FOR UPDATE`,
        [releaseId],
      )
      const current = mapRow(currentRows[0])
      if (!current) {
        const err = new Error('release_not_found')
        err.statusCode = 404
        err.message = 'APP发版记录不存在'
        throw err
      }

      const [targetRows] = await conn.query(
        `SELECT
           avr.*,
           DATE_FORMAT(avr.expected_submit_at, '%Y-%m-%d') AS expected_submit_at,
           DATE_FORMAT(avr.submitted_at, '%Y-%m-%d') AS submitted_at,
           DATE_FORMAT(avr.listed_at, '%Y-%m-%d') AS listed_at,
           DATE_FORMAT(avr.last_operation_at, '%Y-%m-%d %H:%i:%s') AS last_operation_at,
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
         WHERE avr.id = ?
           AND avr.deleted_at IS NULL
         FOR UPDATE`,
        [normalizedTargetReleaseId],
      )
      const target = mapRow(targetRows[0])
      if (!target) {
        const err = new Error('merge_target_not_found')
        err.statusCode = 404
        err.message = '目标发版记录不存在'
        throw err
      }
      if (Number(current.matrix_package_id || 0) !== Number(target.matrix_package_id || 0)) {
        const err = new Error('merge_target_package_mismatch')
        err.statusCode = 400
        err.message = '只能同步同一矩阵包下的发版记录'
        throw err
      }
      if (target.id <= current.id) {
        const err = new Error('merge_target_not_after_current')
        err.statusCode = 400
        err.message = '只能同步到当前发版记录之后的申请'
        throw err
      }

      const operator = await resolveUserInfo(userId)
      const mergedRemarkLine = buildMergeRemark(target)
      const nextRemark = current.remark
        ? `${current.remark}\n${mergedRemarkLine}`
        : mergedRemarkLine
      const operationSummary = `同步发版申请至 ${normalizeText(target.release_request_no || target.app_version || `记录${target.id}`, 120)}${shouldSyncPreviousReleaseInfo ? '' : '（未同步前序发版）'}`

      if (shouldSyncPreviousReleaseInfo) {
        await conn.query(
          `UPDATE app_version_releases
           SET previous_release_info = ?,
               updated_by = ?
           WHERE id = ? AND deleted_at IS NULL`,
          [
            normalizeText(current.previous_release_info, 255) || null,
            userId || null,
            normalizedTargetReleaseId,
          ],
        )
      }

      await conn.query(
        `UPDATE app_version_releases
         SET release_status = 'CANCELLED',
             listed_at = CURRENT_DATE,
             remark = ?,
             last_operation_summary = ?,
             last_operation_user_id = ?,
             last_operation_user_name = ?,
             last_operation_at = NOW(),
             updated_by = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [
          nextRemark || null,
          operationSummary,
          toPositiveInt(userId) || null,
          operator.name || null,
          userId || null,
          releaseId,
        ],
      )

      await conn.commit()
      return this.getById(releaseId)
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
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
        const generatedAppConsoleUrl = buildGeneratedAppConsoleUrl(packageDetail, operationContent, frontendContent)
        const appConsoleUrl = generatedAppConsoleUrl
          || applicationItem.app_console_url
          || await getLatestAppConsoleUrlByPackageId(packageDetail.id)
          || normalizeText(frontendContent.appConsoleUrl, 1000)
        if (!appConsoleUrl) {
          const err = new Error('app_console_url_required')
          err.statusCode = 400
          err.message = `${packageDetail.package_name || `矩阵包${packageDetail.id}`} 的APP后台地址不能为空`
          throw err
        }
        const releaseOwner = await resolveDefaultReleaseOwnerInfo(packageDetail)
        const operationSummary = '创建发版申请'

        const [result] = await connection.query(
          `INSERT INTO app_version_releases
           (matrix_package_id, release_type, release_status, urgency_code, app_version, app_name, app_developer, app_company_subject, app_console_url, app_id, domain_info, related_demand_id, related_demand_name, applicant_user_id, applicant_name, requested_at, owner_user_id, owner_name, expected_submit_at, remark, last_operation_summary, last_operation_user_id, last_operation_user_name, last_operation_at, created_by, updated_by)
           VALUES (?, ?, 'PENDING_PLAN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
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
            operationSummary,
            applicant.id || userId || null,
            applicant.name || null,
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
    const applicant = await resolveMatrixPackageReleaseApplicant(packageDetail)
    const appName = normalizeText(operationContent.appName, 160) || normalizeText(packageDetail.package_name, 160)
    const appVersion = normalizeText(frontendContent.appVersion, 80)
    const appConsoleUrl = buildGeneratedAppConsoleUrl(packageDetail, operationContent, frontendContent)
      || normalizeText(frontendContent.appConsoleUrl, 1000)
    const releaseOwner = await resolveDefaultReleaseOwnerInfo(packageDetail)
    const operationSummary = '系统创建发版记录'
    const operator = userId ? await resolveUserInfo(userId) : applicant
    const urgencyCode = releaseType === 'FIRST_RELEASE' ? 'P0' : 'P1'

    const [result] = await pool.query(
      `INSERT INTO app_version_releases
       (matrix_package_id, release_type, release_status, urgency_code, app_version, app_name, app_developer, app_company_subject, app_console_url, app_id, domain_info, applicant_user_id, applicant_name, requested_at, owner_user_id, owner_name, last_operation_summary, last_operation_user_id, last_operation_user_name, last_operation_at, created_by, updated_by)
       VALUES (?, ?, 'PENDING_PLAN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?, NOW(), ?, ?)
       ON DUPLICATE KEY UPDATE
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [
        normalizedPackageId,
        releaseType,
        urgencyCode,
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
        operationSummary,
        operator.id || applicant.id || null,
        operator.name || applicant.name || null,
        userId || applicant.id || null,
        userId || null,
      ],
    )
    await assignReleaseRequestNo(result.insertId)

    return getByMatrixPackageId(normalizedPackageId)
  },
}

module.exports = AppVersionRelease
