const pool = require('../utils/db')

const REVIEW_STAGE_OPTIONS = [
  { code: 'PENDING_REVIEW_SUBMIT', name: '待送审', color: 'orange', sort: 10 },
  { code: 'FIRST_SUBMITTED', name: '首次送审', color: 'processing', sort: 20 },
  { code: 'IN_REVIEW', name: '审核中', color: 'gold', sort: 30 },
  { code: 'WAITING_AD_ACCOUNT', name: '待绑定广告账号信息', color: 'purple', sort: 40 },
  { code: 'SECOND_SUBMITTED', name: '二次送审', color: 'processing', sort: 50 },
  { code: 'HOT_STANDBY', name: '热备包', color: 'green', sort: 60 },
  { code: 'REVIEW_REJECTED', name: '被拒审', color: 'red', sort: 70 },
]

const AD_ACCOUNT_BINDING_OPTIONS = [
  { code: 'NOT_REQUIRED', name: '不需要', color: 'default' },
  { code: 'PENDING', name: '待绑定', color: 'gold' },
  { code: 'BOUND', name: '已绑定', color: 'green' },
  { code: 'BLOCKED', name: '阻塞', color: 'red' },
]

const VISIBLE_REVIEW_STAGE_OPTIONS = REVIEW_STAGE_OPTIONS.filter((item) => item.code !== 'HOT_STANDBY')
const REVIEW_STAGE_MAP = new Map(REVIEW_STAGE_OPTIONS.map((item) => [item.code, item]))
const AD_ACCOUNT_BINDING_MAP = new Map(AD_ACCOUNT_BINDING_OPTIONS.map((item) => [item.code, item]))
const DEFAULT_REVIEW_OWNER_USERNAME = 'zhaojiaying'
const DEFAULT_REVIEW_OWNER_REAL_NAME = '赵佳颖'

const REVIEW_PACKAGE_STATUS_CODES = [
  'COLD_STANDBY',
  'PENDING_REVIEW_SUBMIT',
  'IN_REVIEW',
  'REVIEW_REJECTED',
]

const REVIEW_IN_FLOW_STAGE_CODES = [
  'FIRST_SUBMITTED',
  'IN_REVIEW',
  'WAITING_AD_ACCOUNT',
  'SECOND_SUBMITTED',
  'REVIEW_REJECTED',
]

const REVIEW_STAGE_SQL = `CASE
  WHEN plan.review_stage_code IS NOT NULL THEN plan.review_stage_code
  WHEN mp.status_code = 'HOT_STANDBY' THEN 'HOT_STANDBY'
  WHEN mp.status_code = 'IN_REVIEW' THEN 'IN_REVIEW'
  WHEN mp.status_code = 'REVIEW_REJECTED' THEN 'REVIEW_REJECTED'
  ELSE 'PENDING_REVIEW_SUBMIT'
END`

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
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

function normalizeOptionalDateTime(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}$/.test(text)) return `${text}:00:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(text)) return `${text}:00`
  return /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(text) ? text : null
}

function getPackageStatusForStage(stageCode) {
  const code = normalizeOptionalCode(stageCode)
  if (code === 'PENDING_REVIEW_SUBMIT') return 'PENDING_REVIEW_SUBMIT'
  if (code === 'FIRST_SUBMITTED') return 'IN_REVIEW'
  if (code === 'IN_REVIEW') return 'IN_REVIEW'
  if (code === 'WAITING_AD_ACCOUNT') return 'PENDING_REVIEW_SUBMIT'
  if (code === 'SECOND_SUBMITTED') return 'IN_REVIEW'
  if (code === 'HOT_STANDBY') return 'HOT_STANDBY'
  if (code === 'REVIEW_REJECTED') return 'REVIEW_REJECTED'
  return ''
}

function mapRow(row, defaultOwner = null) {
  if (!row) return null
  const defaultOwnerId = defaultOwner?.id ? Number(defaultOwner.id) : null
  const defaultOwnerName = defaultOwner?.displayName || ''
  const stageMeta = REVIEW_STAGE_MAP.get(row.review_stage_code || '') || null
  const adBindingMeta = AD_ACCOUNT_BINDING_MAP.get(row.ad_account_binding_status || '') || null
  return {
    package_id: Number(row.package_id),
    plan_id: row.plan_id ? Number(row.plan_id) : null,
    developer_account_id: row.developer_account_id ? Number(row.developer_account_id) : null,
    developer_account_name: row.developer_account_name || '',
    developer_company_name: row.developer_company_name || '',
    package_name: row.package_name || '',
    app_id: row.app_id || '',
    domain_info: row.domain_info || '',
    new_package_version: row.new_package_version || '',
    package_owner_name: row.package_owner_display_name || row.package_owner_name || '',
    status_code: row.status_code || '',
    status_name: row.status_name || row.status_code || '',
    status_color: row.status_color || '',
    review_stage_code: row.review_stage_code || 'PENDING_REVIEW_SUBMIT',
    review_stage_name: row.review_stage_name || stageMeta?.name || row.review_stage_code || '待送审',
    review_stage_color: stageMeta?.color || 'default',
    planned_first_submit_at: row.planned_first_submit_at || null,
    actual_first_submit_at: row.actual_first_submit_at || null,
    planned_second_submit_at: row.planned_second_submit_at || null,
    actual_second_submit_at: row.actual_second_submit_at || null,
    ad_account_binding_status: row.ad_account_binding_status || 'NOT_REQUIRED',
    ad_account_binding_name: adBindingMeta?.name || row.ad_account_binding_status || '不需要',
    ad_account_binding_color: adBindingMeta?.color || 'default',
    owner_user_id: row.review_owner_user_id ? Number(row.review_owner_user_id) : defaultOwnerId,
    owner_name: row.review_owner_display_name || row.review_owner_name || defaultOwnerName,
    remark: row.remark || '',
    created_at: row.plan_created_at || null,
    updated_at: row.plan_updated_at || null,
  }
}

async function resolveDefaultReviewOwner() {
  const [rows] = await pool.query(
    `SELECT id, username, COALESCE(real_name, '') AS real_name
     FROM users
     WHERE status_code = 'ACTIVE'
       AND (username = ? OR real_name = ?)
     ORDER BY CASE WHEN username = ? THEN 0 ELSE 1 END
     LIMIT 1`,
    [DEFAULT_REVIEW_OWNER_USERNAME, DEFAULT_REVIEW_OWNER_REAL_NAME, DEFAULT_REVIEW_OWNER_USERNAME],
  )
  const user = rows[0]
  if (!user) return { id: null, displayName: '' }
  return {
    id: Number(user.id),
    displayName: user.real_name || user.username || '',
  }
}

async function resolveUserDisplayName(userId) {
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
    const err = new Error('review_plan_owner_invalid')
    err.statusCode = 400
    err.message = '送审负责人用户不存在'
    throw err
  }
  return {
    id: Number(user.id),
    displayName: user.real_name || user.username || '',
  }
}

async function assertPackageExists(packageId) {
  const normalizedPackageId = toPositiveInt(packageId)
  if (!normalizedPackageId) return null
  const [rows] = await pool.query(
    `SELECT id, package_name, status_code
     FROM matrix_packages
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [normalizedPackageId],
  )
  return rows[0] || null
}

function buildWhere(filters = {}, defaultOwnerId = null) {
  const clauses = [
    'mp.deleted_at IS NULL',
    `mp.status_code <> 'HOT_STANDBY'`,
    `(mp.status_code IN (${REVIEW_PACKAGE_STATUS_CODES.map(() => '?').join(', ')}) OR (plan.id IS NOT NULL AND plan.review_stage_code <> 'HOT_STANDBY'))`,
  ]
  const params = [...REVIEW_PACKAGE_STATUS_CODES]

  const keyword = normalizeText(filters.keyword, 100)
  if (keyword) {
    clauses.push('(mp.package_name LIKE ? OR mp.app_id LIKE ? OR mp.domain_info LIKE ? OR da.account_name LIKE ? OR da.company_name LIKE ? OR plan.owner_name LIKE ?)')
    const like = `%${keyword}%`
    params.push(like, like, like, like, like, like)
  }

  const stageCode = normalizeOptionalCode(filters.review_stage_code)
  if (stageCode) {
    clauses.push(`${REVIEW_STAGE_SQL} = ?`)
    params.push(stageCode)
  } else {
    const stageGroup = normalizeOptionalCode(filters.review_stage_group)
    if (stageGroup === 'PENDING_REVIEW_SUBMIT') {
      clauses.push(`${REVIEW_STAGE_SQL} = ?`)
      params.push('PENDING_REVIEW_SUBMIT')
    }
    if (stageGroup === 'IN_FLOW') {
      clauses.push(`${REVIEW_STAGE_SQL} IN (${REVIEW_IN_FLOW_STAGE_CODES.map(() => '?').join(', ')})`)
      params.push(...REVIEW_IN_FLOW_STAGE_CODES)
    }
  }

  const statusCode = normalizeOptionalCode(filters.status_code)
  if (statusCode) {
    clauses.push('mp.status_code = ?')
    params.push(statusCode)
  }

  const developerAccountId = toPositiveInt(filters.developer_account_id)
  if (developerAccountId) {
    clauses.push('mp.developer_account_id = ?')
    params.push(developerAccountId)
  }

  const ownerUserId = toPositiveInt(filters.owner_user_id)
  if (ownerUserId) {
    if (defaultOwnerId && Number(ownerUserId) === Number(defaultOwnerId)) {
      clauses.push('(plan.owner_user_id = ? OR plan.owner_user_id IS NULL)')
      params.push(ownerUserId)
    } else {
      clauses.push('plan.owner_user_id = ?')
      params.push(ownerUserId)
    }
  }

  return {
    whereSql: clauses.join(' AND '),
    params,
  }
}

async function getByPackageId(packageId) {
  const normalizedPackageId = toPositiveInt(packageId)
  if (!normalizedPackageId) return null

  const [rows] = await pool.query(
    `SELECT
       mp.id AS package_id,
       plan.id AS plan_id,
       mp.developer_account_id,
       da.account_name AS developer_account_name,
       da.company_name AS developer_company_name,
       mp.package_name,
       mp.app_id,
       mp.domain_info,
       mp.new_package_version,
       mp.owner_name AS package_owner_name,
       COALESCE(NULLIF(packageOwner.real_name, ''), packageOwner.username) AS package_owner_display_name,
       mp.status_code,
       statusDict.item_name AS status_name,
       statusDict.color AS status_color,
       ${REVIEW_STAGE_SQL} AS review_stage_code,
       plan.planned_first_submit_at,
       plan.actual_first_submit_at,
       plan.planned_second_submit_at,
       plan.actual_second_submit_at,
       COALESCE(plan.ad_account_binding_status, 'NOT_REQUIRED') AS ad_account_binding_status,
       plan.owner_user_id AS review_owner_user_id,
       plan.owner_name AS review_owner_name,
       COALESCE(NULLIF(reviewOwner.real_name, ''), reviewOwner.username) AS review_owner_display_name,
       plan.remark,
       DATE_FORMAT(plan.created_at, '%Y-%m-%d %H:%i:%s') AS plan_created_at,
       DATE_FORMAT(plan.updated_at, '%Y-%m-%d %H:%i:%s') AS plan_updated_at,
       DATE_FORMAT(plan.planned_first_submit_at, '%Y-%m-%d %H:%i:%s') AS planned_first_submit_at,
       DATE_FORMAT(plan.actual_first_submit_at, '%Y-%m-%d %H:%i:%s') AS actual_first_submit_at,
       DATE_FORMAT(plan.planned_second_submit_at, '%Y-%m-%d %H:%i:%s') AS planned_second_submit_at,
       DATE_FORMAT(plan.actual_second_submit_at, '%Y-%m-%d %H:%i:%s') AS actual_second_submit_at
     FROM matrix_packages mp
     LEFT JOIN matrix_package_review_plans plan
       ON plan.package_id = mp.id
     LEFT JOIN users packageOwner
       ON packageOwner.id = mp.owner_user_id
     LEFT JOIN users reviewOwner
       ON reviewOwner.id = plan.owner_user_id
     LEFT JOIN developer_accounts da
       ON da.id = mp.developer_account_id
      AND da.deleted_at IS NULL
     LEFT JOIN config_dict_items statusDict
       ON statusDict.type_key = 'matrix_package_status'
      AND statusDict.item_code = mp.status_code
     WHERE mp.id = ? AND mp.deleted_at IS NULL
     LIMIT 1`,
    [normalizedPackageId],
  )
  const defaultOwner = await resolveDefaultReviewOwner()
  return mapRow(rows[0], defaultOwner)
}

const MatrixPackageReviewPlan = {
  REVIEW_STAGE_OPTIONS,
  AD_ACCOUNT_BINDING_OPTIONS,

  async list(filters = {}) {
    const page = Math.max(toPositiveInt(filters.page) || 1, 1)
    const pageSize = Math.min(Math.max(toPositiveInt(filters.pageSize) || 20, 1), 100)
    const offset = (page - 1) * pageSize
    const defaultOwner = await resolveDefaultReviewOwner()
    const { whereSql, params } = buildWhere(filters, defaultOwner.id)

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM matrix_packages mp
       LEFT JOIN matrix_package_review_plans plan
         ON plan.package_id = mp.id
       LEFT JOIN developer_accounts da
         ON da.id = mp.developer_account_id
        AND da.deleted_at IS NULL
       WHERE ${whereSql}`,
      params,
    )

    const [rows] = await pool.query(
      `SELECT
         mp.id AS package_id,
         plan.id AS plan_id,
         mp.developer_account_id,
         da.account_name AS developer_account_name,
         da.company_name AS developer_company_name,
         mp.package_name,
         mp.app_id,
         mp.domain_info,
         mp.new_package_version,
         mp.owner_name AS package_owner_name,
         COALESCE(NULLIF(packageOwner.real_name, ''), packageOwner.username) AS package_owner_display_name,
         mp.status_code,
         statusDict.item_name AS status_name,
         statusDict.color AS status_color,
         ${REVIEW_STAGE_SQL} AS review_stage_code,
         DATE_FORMAT(plan.planned_first_submit_at, '%Y-%m-%d %H:%i:%s') AS planned_first_submit_at,
         DATE_FORMAT(plan.actual_first_submit_at, '%Y-%m-%d %H:%i:%s') AS actual_first_submit_at,
         DATE_FORMAT(plan.planned_second_submit_at, '%Y-%m-%d %H:%i:%s') AS planned_second_submit_at,
         DATE_FORMAT(plan.actual_second_submit_at, '%Y-%m-%d %H:%i:%s') AS actual_second_submit_at,
         COALESCE(plan.ad_account_binding_status, 'NOT_REQUIRED') AS ad_account_binding_status,
         plan.owner_user_id AS review_owner_user_id,
         plan.owner_name AS review_owner_name,
         COALESCE(NULLIF(reviewOwner.real_name, ''), reviewOwner.username) AS review_owner_display_name,
         plan.remark,
         DATE_FORMAT(plan.created_at, '%Y-%m-%d %H:%i:%s') AS plan_created_at,
         DATE_FORMAT(plan.updated_at, '%Y-%m-%d %H:%i:%s') AS plan_updated_at
       FROM matrix_packages mp
       LEFT JOIN matrix_package_review_plans plan
         ON plan.package_id = mp.id
       LEFT JOIN users packageOwner
         ON packageOwner.id = mp.owner_user_id
       LEFT JOIN users reviewOwner
         ON reviewOwner.id = plan.owner_user_id
       LEFT JOIN developer_accounts da
         ON da.id = mp.developer_account_id
        AND da.deleted_at IS NULL
       LEFT JOIN config_dict_items statusDict
         ON statusDict.type_key = 'matrix_package_status'
        AND statusDict.item_code = mp.status_code
       WHERE ${whereSql}
       ORDER BY
         CASE ${REVIEW_STAGE_SQL}
           WHEN 'PENDING_REVIEW_SUBMIT' THEN 1
           WHEN 'FIRST_SUBMITTED' THEN 2
           WHEN 'IN_REVIEW' THEN 3
           WHEN 'WAITING_AD_ACCOUNT' THEN 4
           WHEN 'SECOND_SUBMITTED' THEN 5
           WHEN 'HOT_STANDBY' THEN 6
           WHEN 'REVIEW_REJECTED' THEN 7
           ELSE 99
         END ASC,
         COALESCE(plan.planned_first_submit_at, plan.planned_second_submit_at, mp.updated_at) ASC,
         mp.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    )

    return {
      list: rows.map((row) => mapRow(row, defaultOwner)),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
      stage_options: VISIBLE_REVIEW_STAGE_OPTIONS,
      ad_account_binding_options: AD_ACCOUNT_BINDING_OPTIONS,
    }
  },

  getByPackageId,

  async save(packageId, payload = {}, userId) {
    const normalizedPackageId = toPositiveInt(packageId)
    const packageRow = await assertPackageExists(normalizedPackageId)
    if (!packageRow) return null

    const current = await getByPackageId(normalizedPackageId)
    const stageCode = normalizeOptionalCode(payload.review_stage_code) || current?.review_stage_code || 'PENDING_REVIEW_SUBMIT'
    if (!REVIEW_STAGE_MAP.has(stageCode)) {
      const err = new Error('review_stage_invalid')
      err.statusCode = 400
      err.message = '送审阶段不合法'
      throw err
    }

    const adBindingStatus = normalizeOptionalCode(payload.ad_account_binding_status) || 'NOT_REQUIRED'
    if (!AD_ACCOUNT_BINDING_MAP.has(adBindingStatus)) {
      const err = new Error('ad_account_binding_status_invalid')
      err.statusCode = 400
      err.message = '广告账号绑定状态不合法'
      throw err
    }

    const defaultOwner = await resolveDefaultReviewOwner()
    const owner = await resolveUserDisplayName(payload.owner_user_id || defaultOwner.id)
    const plannedFirstSubmitAt = normalizeOptionalDateTime(payload.planned_first_submit_at)
    const plannedSecondSubmitAt = normalizeOptionalDateTime(payload.planned_second_submit_at)
    const remark = normalizeText(payload.remark, 1000)

    await pool.query(
      `INSERT INTO matrix_package_review_plans
       (package_id, review_stage_code, planned_first_submit_at, actual_first_submit_at, planned_second_submit_at, actual_second_submit_at, ad_account_binding_status, owner_user_id, owner_name, remark, created_by, updated_by)
       VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         review_stage_code = VALUES(review_stage_code),
         planned_first_submit_at = VALUES(planned_first_submit_at),
         planned_second_submit_at = VALUES(planned_second_submit_at),
         ad_account_binding_status = VALUES(ad_account_binding_status),
         owner_user_id = VALUES(owner_user_id),
         owner_name = VALUES(owner_name),
         remark = VALUES(remark),
         updated_by = VALUES(updated_by)`,
      [
        normalizedPackageId,
        stageCode,
        plannedFirstSubmitAt,
        plannedSecondSubmitAt,
        adBindingStatus,
        owner.id,
        owner.displayName,
        remark,
        userId || null,
        userId || null,
      ],
    )

    const nextPackageStatus = getPackageStatusForStage(stageCode)
    if (nextPackageStatus) {
      await pool.query(
        `UPDATE matrix_packages
         SET status_code = ?, health_code = NULL, updated_by = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [nextPackageStatus, userId || null, normalizedPackageId],
      )
    }

    return getByPackageId(normalizedPackageId)
  },

  async transition(packageId, stageCode, payload = {}, userId) {
    const normalizedPackageId = toPositiveInt(packageId)
    const packageRow = await assertPackageExists(normalizedPackageId)
    if (!packageRow) return null

    const normalizedStageCode = normalizeOptionalCode(stageCode)
    if (!REVIEW_STAGE_MAP.has(normalizedStageCode)) {
      const err = new Error('review_stage_invalid')
      err.statusCode = 400
      err.message = '送审阶段不合法'
      throw err
    }

    const current = await getByPackageId(normalizedPackageId)
    const defaultOwner = await resolveDefaultReviewOwner()
    const owner = await resolveUserDisplayName(payload.owner_user_id ?? current?.owner_user_id ?? defaultOwner.id)
    const adBindingStatus = normalizeOptionalCode(payload.ad_account_binding_status) || current?.ad_account_binding_status || 'NOT_REQUIRED'
    if (!AD_ACCOUNT_BINDING_MAP.has(adBindingStatus)) {
      const err = new Error('ad_account_binding_status_invalid')
      err.statusCode = 400
      err.message = '广告账号绑定状态不合法'
      throw err
    }

    const nowExpression = 'NOW()'
    const setActualFirstSubmit = normalizedStageCode === 'FIRST_SUBMITTED'
    const setActualSecondSubmit = normalizedStageCode === 'SECOND_SUBMITTED'
    const remark = Object.prototype.hasOwnProperty.call(payload, 'remark')
      ? normalizeText(payload.remark, 1000)
      : current?.remark || ''

    await pool.query(
      `INSERT INTO matrix_package_review_plans
       (package_id, review_stage_code, planned_first_submit_at, actual_first_submit_at, planned_second_submit_at, actual_second_submit_at, ad_account_binding_status, owner_user_id, owner_name, remark, created_by, updated_by)
       VALUES (
         ?, ?,
         ?, ${setActualFirstSubmit ? nowExpression : 'NULL'},
         ?, ${setActualSecondSubmit ? nowExpression : 'NULL'},
         ?, ?, ?, ?, ?, ?
       )
       ON DUPLICATE KEY UPDATE
         review_stage_code = VALUES(review_stage_code),
         actual_first_submit_at = CASE
           WHEN ? = 1 THEN NOW()
           ELSE actual_first_submit_at
         END,
         actual_second_submit_at = CASE
           WHEN ? = 1 THEN NOW()
           ELSE actual_second_submit_at
         END,
         ad_account_binding_status = VALUES(ad_account_binding_status),
         owner_user_id = VALUES(owner_user_id),
         owner_name = VALUES(owner_name),
         remark = VALUES(remark),
         updated_by = VALUES(updated_by)`,
      [
        normalizedPackageId,
        normalizedStageCode,
        normalizeOptionalDateTime(payload.planned_first_submit_at) || current?.planned_first_submit_at || null,
        normalizeOptionalDateTime(payload.planned_second_submit_at) || current?.planned_second_submit_at || null,
        adBindingStatus,
        owner.id,
        owner.displayName,
        remark,
        userId || null,
        userId || null,
        setActualFirstSubmit ? 1 : 0,
        setActualSecondSubmit ? 1 : 0,
      ],
    )

    const nextPackageStatus = getPackageStatusForStage(normalizedStageCode)
    if (nextPackageStatus) {
      await pool.query(
        `UPDATE matrix_packages
         SET status_code = ?, health_code = NULL, updated_by = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [nextPackageStatus, userId || null, normalizedPackageId],
      )
    }

    return getByPackageId(normalizedPackageId)
  },
}

module.exports = MatrixPackageReviewPlan
