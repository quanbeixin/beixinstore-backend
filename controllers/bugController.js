const Bug = require('../models/Bug')
const Work = require('../models/Work')
const User = require('../models/User')
const NotificationEvent = require('../models/NotificationEvent')
const pool = require('../utils/db')
const { sendNotification } = require('../utils/notificationSender')
const {
  buildOssObjectKey,
  buildPublicObjectUrl,
  buildSignedGetObjectUrl,
  createPostPolicy,
  deleteOssObject,
  getOssConfigFromEnv,
  sanitizeFileName,
} = require('../utils/oss')

const BUG_STATUS = Object.freeze({
  NEW: 'NEW',
  PROCESSING: 'PROCESSING',
  FIXED: 'FIXED',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
})

const DEFAULT_ACTION_REQUIREMENTS = Object.freeze({
  start: { requireRemark: false, requireFixSolution: false, requireVerifyResult: false },
  fix: { requireRemark: false, requireFixSolution: true, requireVerifyResult: false },
  verify: { requireRemark: false, requireFixSolution: false, requireVerifyResult: false },
  reopen: { requireRemark: true, requireFixSolution: false, requireVerifyResult: false },
  reject: { requireRemark: true, requireFixSolution: false, requireVerifyResult: false },
})

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizePositiveIntList(values) {
  const source = Array.isArray(values) ? values : [values]
  const dedup = new Set()
  source.forEach((item) => {
    const normalized = toPositiveInt(item)
    if (normalized) dedup.add(normalized)
  })
  return Array.from(dedup)
}

function normalizeText(value, maxLen = 500) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeDemandId(value) {
  const normalized = String(value || '').trim().toUpperCase()
  return normalized || null
}

function normalizeCode(value) {
  const normalized = String(value || '').trim().toUpperCase()
  return normalized || ''
}

function normalizeActionKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .slice(0, 50)
}

function normalizeNotificationPortalBaseUrl() {
  const baseUrl = normalizeText(process.env.NOTIFICATION_PORTAL_BASE_URL, 500)
  if (!baseUrl) return ''
  return baseUrl.replace(/\/+$/g, '')
}

function buildBugDetailUrl(bugId) {
  const normalizedBugId = toPositiveInt(bugId)
  const baseUrl = normalizeNotificationPortalBaseUrl()
  if (!baseUrl || !normalizedBugId) return null
  return `${baseUrl}/bugs/${encodeURIComponent(String(normalizedBugId))}`
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  return text
}

function sanitizeBugViewConfig(config = {}) {
  return Bug.sanitizeBugViewConfig(config)
}

function normalizeBugViewVisibility(value) {
  return Bug.normalizeBugViewVisibility(value)
}

function canManageBugView(req, viewRow) {
  if (!viewRow) return false
  if (req.userAccess?.is_super_admin) return true
  if (hasPermission(req, 'bug.manage')) return true
  return Number(req.user?.id || 0) > 0 && Number(req.user?.id || 0) === Number(viewRow.created_by || 0)
}

function canDeleteBugView(req, viewRow) {
  if (!viewRow) return false
  return Number(req.user?.id || 0) > 0 && Number(req.user?.id || 0) === Number(viewRow.created_by || 0)
}

function decorateBugViewRow(req, row) {
  if (!row) return null
  return {
    ...row,
    can_edit: canManageBugView(req, row),
    can_delete: canDeleteBugView(req, row),
  }
}

function normalizeWorkflowTransitionPayloadRows(items = []) {
  const source = Array.isArray(items) ? items : []
  return source
    .map((item, index) => ({
      from_status_code: normalizeCode(item?.from_status_code),
      to_status_code: normalizeCode(item?.to_status_code),
      action_key: normalizeActionKey(item?.action_key),
      action_name: normalizeText(item?.action_name, 50) || normalizeActionKey(item?.action_key),
      enabled:
        item?.enabled === false ||
        item?.enabled === 0 ||
        item?.enabled === '0' ||
        String(item?.enabled || '').toLowerCase() === 'false'
          ? 0
          : 1,
      sort_order: Number.isInteger(Number(item?.sort_order)) ? Number(item.sort_order) : (index + 1) * 10,
      require_remark:
        item?.require_remark === true ||
        item?.require_remark === 1 ||
        item?.require_remark === '1' ||
        String(item?.require_remark || '').toLowerCase() === 'true'
          ? 1
          : 0,
      require_fix_solution:
        item?.require_fix_solution === true ||
        item?.require_fix_solution === 1 ||
        item?.require_fix_solution === '1' ||
        String(item?.require_fix_solution || '').toLowerCase() === 'true'
          ? 1
          : 0,
      require_verify_result:
        item?.require_verify_result === true ||
        item?.require_verify_result === 1 ||
        item?.require_verify_result === '1' ||
        String(item?.require_verify_result || '').toLowerCase() === 'true'
          ? 1
          : 0,
    }))
    .filter((item) => item.from_status_code && item.to_status_code && item.action_key)
}

function getBugAttachmentSignExpireSeconds() {
  return Math.max(60, Number(process.env.BUG_ATTACHMENT_SIGN_EXPIRE_SECONDS || 1800))
}

function buildBugAttachmentAccessUrl(
  attachment,
  { ossConfig = null, expireSeconds = 1800, contentDisposition = 'inline' } = {},
) {
  if (!attachment) return ''
  const storageProvider = normalizeCode(attachment.storage_provider)
  const objectKey = normalizeText(attachment.object_key, 500).replace(/^\/+/, '')
  const objectUrl = normalizeText(attachment.object_url, 1000)

  if (storageProvider === 'ALIYUN_OSS' && ossConfig && objectKey) {
    const signedUrl = buildSignedGetObjectUrl({
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      bucketName: normalizeText(attachment.bucket_name, 100) || ossConfig.bucketName,
      endpoint: ossConfig.endpoint,
      objectKey,
      expireSeconds,
      securityToken: ossConfig.securityToken,
      responseContentDisposition: contentDisposition,
    })
    if (signedUrl) return signedUrl
  }

  return objectUrl || ''
}

function decorateBugAttachment(attachment, options = {}) {
  if (!attachment) return attachment
  return {
    ...attachment,
    // 文件名点击预览优先使用 inline 链接；下载按钮使用 attachment 链接。
    download_url: buildBugAttachmentAccessUrl(attachment, { ...options, contentDisposition: 'inline' }),
    download_file_url: buildBugAttachmentAccessUrl(attachment, { ...options, contentDisposition: 'attachment' }),
  }
}

function decorateBugCommentAttachment(attachment, options = {}) {
  return decorateBugAttachment(attachment, options)
}

function buildUniqueAttachmentList(attachments = [], nextAttachment) {
  const list = Array.isArray(attachments) ? attachments : []
  const candidate = nextAttachment || null
  if (!candidate) return list
  const candidateId = Number(candidate.id || 0)
  const candidateObjectKey = normalizeText(candidate.object_key, 500)
  const deduped = list.filter((item) => {
    const itemId = Number(item?.id || 0)
    const itemObjectKey = normalizeText(item?.object_key, 500)
    if (candidateId > 0 && itemId === candidateId) return false
    if (candidateObjectKey && itemObjectKey === candidateObjectKey) return false
    return true
  })
  return [candidate, ...deduped]
}

function decorateBugDetailAttachments(detail, options = {}) {
  if (!detail) return detail
  return {
    ...detail,
    attachments: Array.isArray(detail.attachments)
      ? detail.attachments.map((item) => decorateBugAttachment(item, options))
      : [],
    status_logs: Array.isArray(detail.status_logs)
      ? detail.status_logs.map((item) => ({
          ...item,
          attachments: Array.isArray(item?.attachments)
            ? item.attachments.map((attachment) => decorateBugCommentAttachment(attachment, options))
            : [],
        }))
      : [],
  }
}

function buildBugAttachmentPolicyPayload({
  bug,
  fileName,
  fileSize,
  businessDir = 'bugs',
  businessNo,
} = {}) {
  const oss = getOssConfigFromEnv()
  if (!oss) {
    return {
      ok: false,
      status: 400,
      message: '阿里云OSS未配置，暂不可上传附件',
    }
  }

  const normalizedFileSize = Number(fileSize || 0)
  if (normalizedFileSize > 0 && normalizedFileSize > oss.maxFileSize) {
    return {
      ok: false,
      status: 400,
      message: `附件大小不能超过 ${Math.ceil(oss.maxFileSize / 1024 / 1024)}MB`,
    }
  }

  const objectKey = buildOssObjectKey({
    rootDir: oss.uploadDir,
    businessDir,
    businessNo: businessNo || bug?.bug_no || `BUG_${bug?.id || 'UNKNOWN'}`,
    fileName,
  })
  const policyPayload = createPostPolicy({
    accessKeyId: oss.accessKeyId,
    accessKeySecret: oss.accessKeySecret,
    bucketName: oss.bucketName,
    endpoint: oss.endpoint,
    objectKey,
    expireSeconds: oss.expireSeconds,
    maxFileSize: oss.maxFileSize,
    successActionStatus: '200',
    securityToken: oss.securityToken,
  })
  const objectUrl = buildPublicObjectUrl({
    publicBaseUrl: oss.publicBaseUrl,
    objectKey,
  })

  return {
    ok: true,
    data: {
      configured: true,
      provider: 'ALIYUN_OSS',
      bucket_name: oss.bucketName,
      endpoint: oss.endpoint,
      region: oss.region,
      object_key: objectKey,
      object_url: objectUrl || null,
      max_file_size: oss.maxFileSize,
      host: policyPayload.host,
      expire_at: policyPayload.expire_at,
      fields: policyPayload.fields,
    },
  }
}

function extractBugAssigneeList(bug) {
  const list = []
  const seen = new Set()
  const source = Array.isArray(bug?.assignees) ? bug.assignees : []

  source.forEach((item) => {
    const userId = toPositiveInt(item?.id || item?.user_id)
    if (!userId || seen.has(userId)) return
    seen.add(userId)
    list.push({
      id: userId,
      name:
        normalizeText(item?.name || item?.user_name || '', 100) ||
        `用户${userId}`,
    })
  })

  const legacyAssigneeId = toPositiveInt(bug?.assignee_id)
  if (legacyAssigneeId && !seen.has(legacyAssigneeId)) {
    list.unshift({
      id: legacyAssigneeId,
      name: normalizeText(bug?.assignee_name, 100) || `用户${legacyAssigneeId}`,
    })
  }

  return list
}

function extractBugWatcherList(bug) {
  const list = []
  const seen = new Set()
  const source = Array.isArray(bug?.watchers) ? bug.watchers : []

  source.forEach((item) => {
    const userId = toPositiveInt(item?.id || item?.user_id)
    if (!userId || seen.has(userId)) return
    seen.add(userId)
    list.push({
      id: userId,
      name:
        normalizeText(item?.name || item?.user_name || '', 100) ||
        `用户${userId}`,
    })
  })

  return list
}

async function resolveBusinessLineId(demandId) {
  const normalizedDemandId = normalizeDemandId(demandId)
  if (!normalizedDemandId) return null

  try {
    const [rows] = await pool.query(
      `SELECT i.id AS business_line_id
       FROM work_demands d
       LEFT JOIN config_dict_items i
         ON i.type_key = 'business_group'
        AND i.item_code = d.business_group_code
       WHERE d.id = ?
       LIMIT 1`,
      [normalizedDemandId],
    )
    const value = toPositiveInt(rows?.[0]?.business_line_id)
    return value || null
  } catch (error) {
    console.warn('解析Bug所属业务线失败:', error?.message || error)
    return null
  }
}

async function buildBugNotificationData({ bug, req, extra = {} }) {
  const businessLineId = await resolveBusinessLineId(bug?.demand_id)
  const bugId = Number(bug?.id || 0) || null
  const assigneeList = extractBugAssigneeList(bug)
  const watcherList = extractBugWatcherList(bug)
  const operatorName =
    normalizeText(req?.user?.real_name || '', 100) ||
    normalizeText(req?.user?.username || '', 100) ||
    normalizeText(bug?.reporter_name || '', 100) ||
    '系统'

  return {
    bug_id: bugId,
    bug_no: normalizeText(bug?.bug_no, 64) || null,
    bug_title: normalizeText(bug?.title, 200) || '',
    bug_content: normalizeText(bug?.description, 20000) || '',
    severity: normalizeText(bug?.severity_name || bug?.severity_code, 64) || '',
    status: normalizeText(bug?.status_name || bug?.status_code, 64) || '',
    reporter_id: toPositiveInt(bug?.reporter_id),
    reporter_name: normalizeText(bug?.reporter_name, 100) || '',
    assignee_id: toPositiveInt(bug?.assignee_id),
    assignee_name: normalizeText(bug?.assignee_name, 100) || '',
    assignee_ids: assigneeList.map((item) => item.id),
    assignee_names:
      normalizeText(bug?.assignee_names, 500) ||
      assigneeList.map((item) => item.name).join('、'),
    watcher_ids: watcherList.map((item) => item.id),
    watcher_names:
      normalizeText(bug?.watcher_names, 500) ||
      watcherList.map((item) => item.name).join('、'),
    operator_id: toPositiveInt(req?.user?.id),
    operator_name: operatorName,
    demand_id: normalizeText(bug?.demand_id, 64) || null,
    demand_name: normalizeText(bug?.demand_name, 200) || '',
    business_line_id: businessLineId,
    detail_type: bugId ? 'bug' : null,
    detail_id: bugId,
    detail_url: buildBugDetailUrl(bugId),
    ...extra,
  }
}

async function emitBugNotificationEvent({ eventType, bug, req, extra = {} }) {
  if (!eventType || !bug) return
  try {
    const data = await buildBugNotificationData({ bug, req, extra })
    await NotificationEvent.processEvent({
      eventType,
      data,
      operatorUserId: req?.user?.id || null,
    })
  } catch (error) {
    console.warn(`触发Bug通知事件失败: ${eventType}`, {
      bug_id: bug?.id || null,
      message: error?.message || String(error || ''),
    })
  }
}

function hasPermission(req, code) {
  const access = req.userAccess || {}
  if (access.is_super_admin) return true
  const codes = Array.isArray(access.permission_codes) ? access.permission_codes : []
  return codes.includes(code)
}

async function canManageBug(req, bug) {
  if (!bug) return false
  if (req.userAccess?.is_super_admin) return true
  if (hasPermission(req, 'bug.manage')) return true

  const currentUserId = Number(req.user?.id || 0)
  if (currentUserId > 0 && currentUserId === Number(bug.reporter_id || 0)) return true
  if (currentUserId > 0 && currentUserId === Number(bug.assignee_id || 0)) return true
  if (
    currentUserId > 0 &&
    Array.isArray(bug.assignee_ids) &&
    bug.assignee_ids.some((item) => Number(item) === currentUserId)
  ) {
    return true
  }
  if (currentUserId > 0 && toPositiveInt(bug.id) && (await Bug.isBugAssignee(bug.id, currentUserId))) return true
  if (currentUserId > 0 && currentUserId === Number(bug.demand_owner_user_id || 0)) return true
  if (currentUserId > 0 && currentUserId === Number(bug.demand_project_manager_id || 0)) return true

  return false
}

async function canManageBugComment(req, bug, commentLog) {
  if (!bug || !commentLog) return false
  const currentUserId = Number(req.user?.id || 0)
  if (currentUserId > 0 && currentUserId === Number(commentLog.operator_id || 0)) return true
  return canManageBug(req, bug)
}

function isBugCommentLog(commentLog) {
  const fromStatus = normalizeCode(commentLog?.from_status_code)
  const toStatus = normalizeCode(commentLog?.to_status_code)
  return Boolean(commentLog?.remark) && fromStatus && fromStatus === toStatus
}

function canEditOwnBugComment(req, commentLog) {
  if (!commentLog) return false
  return Number(req.user?.id || 0) > 0 && Number(req.user?.id || 0) === Number(commentLog.operator_id || 0)
}

async function ensureDemandExists(demandId) {
  if (!demandId) return null
  const demand = await Work.findDemandById(demandId)
  return demand || null
}

async function validateBugPayload(payload, { isCreate = false } = {}) {
  const title = normalizeText(payload.title, 200)
  const description = normalizeText(payload.description, 20000)
  const severityCode = normalizeCode(payload.severity_code)
  const bugTypeCode = normalizeCode(payload.bug_type_code)
  const productCode = normalizeCode(payload.product_code)
  const issueStage = normalizeCode(payload.issue_stage)
  const reproduceSteps = normalizeText(payload.reproduce_steps, 20000)
  const expectedResult = normalizeText(payload.expected_result, 20000)
  const actualResult = normalizeText(payload.actual_result, 20000)
  const environmentInfo = normalizeText(payload.environment_info, 20000)
  const demandId = normalizeDemandId(payload.demand_id)
  const assigneeIds = normalizePositiveIntList(payload.assignee_ids)
  const legacyAssigneeId = toPositiveInt(payload.assignee_id)
  if (legacyAssigneeId && !assigneeIds.includes(legacyAssigneeId)) {
    assigneeIds.unshift(legacyAssigneeId)
  }
  const assigneeId = assigneeIds[0] || null
  const watcherIds = normalizePositiveIntList(payload.watcher_ids)
  const assigneeIdSet = new Set(assigneeIds)
  const sanitizedWatcherIds = watcherIds.filter((item) => !assigneeIdSet.has(item))
  const fixSolution = normalizeText(payload.fix_solution, 20000)
  const verifyResult = normalizeText(payload.verify_result, 20000)

  if (!title) return { ok: false, message: 'Bug标题不能为空' }
  if (!description) return { ok: false, message: 'Bug描述不能为空' }
  if (!severityCode) return { ok: false, message: '严重程度不能为空' }
  if (isCreate && !issueStage) return { ok: false, message: 'Bug阶段不能为空' }
  if (!assigneeId) return { ok: false, message: '处理人不能为空' }

  if (!(await Bug.validateDictCode('bug_severity', severityCode))) {
    return { ok: false, message: '严重程度不存在或已停用' }
  }
  if (!(await Bug.validateDictCode('bug_type', bugTypeCode, { allowNull: true }))) {
    return { ok: false, message: 'Bug类型不存在或已停用' }
  }
  if (!(await Bug.validateDictCode('bug_product', productCode, { allowNull: true }))) {
    return { ok: false, message: '产品模块不存在或已停用' }
  }
  if (!(await Bug.validateDictCode('bug_stage', issueStage, { allowNull: !isCreate }))) {
    return { ok: false, message: 'Bug阶段不存在或已停用' }
  }

  const demand = await ensureDemandExists(demandId)
  if (demandId && !demand) {
    return { ok: false, message: '关联需求不存在' }
  }

  return {
    ok: true,
    data: {
      title,
      description,
      severityCode,
      bugTypeCode: bugTypeCode || null,
      productCode: productCode || null,
      issueStage: issueStage || null,
      reproduceSteps: reproduceSteps || '',
      expectedResult: expectedResult || '',
      actualResult: actualResult || '',
      environmentInfo: environmentInfo || null,
      demandId: demandId || null,
      assigneeId,
      assigneeIds,
      watcherIds: sanitizedWatcherIds,
      fixSolution: isCreate ? null : fixSolution || null,
      verifyResult: isCreate ? null : verifyResult || null,
      demand,
    },
  }
}

function buildTransitionPayload(targetStatus, req) {
  return {
    toStatusCode: targetStatus,
    operatorId: req.user.id,
    remark: normalizeText(req.body.remark, 20000) || null,
    fixSolution: normalizeText(req.body.fix_solution, 20000) || null,
    verifyResult: normalizeText(req.body.verify_result, 20000) || null,
  }
}

const listBugs = async (req, res) => {
  try {
    const data = await Bug.listBugs({
      page: req.query.page,
      pageSize: req.query.pageSize,
      keyword: req.query.keyword,
      statusCode: req.query.status_code,
      severityCode: req.query.severity_code,
      bugTypeCode: req.query.bug_type_code,
      productCode: req.query.product_code,
      issueStage: req.query.issue_stage,
      demandId: req.query.demand_id,
      assigneeId: req.query.assignee_id,
      reporterId: req.query.reporter_id,
      startDate: normalizeDate(req.query.start_date),
      endDate: normalizeDate(req.query.end_date),
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取Bug列表失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getBugDetail = async (req, res) => {
  const bugId = toPositiveInt(req.params.id)
  if (!bugId) {
    return res.status(400).json({ success: false, message: 'Bug ID 无效' })
  }

  try {
    const detail = await Bug.getBugDetail(bugId)
    if (!detail) {
      return res.status(404).json({ success: false, message: 'Bug不存在' })
    }
    const responseData = decorateBugDetailAttachments(detail, {
      ossConfig: getOssConfigFromEnv(),
      expireSeconds: getBugAttachmentSignExpireSeconds(),
    })
    return res.json({ success: true, data: responseData })
  } catch (err) {
    console.error('获取Bug详情失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createBug = async (req, res) => {
  const validation = await validateBugPayload(req.body, { isCreate: true })
  if (!validation.ok) {
    return res.status(400).json({ success: false, message: validation.message })
  }

  try {
    const bugId = await Bug.createBug({
      ...validation.data,
      reporterId: req.user.id,
    })
    const detail = await Bug.getBugDetail(bugId)
    const assigneeList = extractBugAssigneeList(detail)
    const createReceiverUserId = toPositiveInt(detail?.assignee_id)
    const assignReceiverUserId = toPositiveInt(detail?.assignee_id)
    const shouldSkipCreateNotification =
      createReceiverUserId &&
      assignReceiverUserId &&
      Number(createReceiverUserId) === Number(assignReceiverUserId)

    // 创建成功后触发真实业务事件（不阻塞主业务）
    // 当创建和指派会在同一时刻通知同一接收人时，仅发送“指派通知”。
    if (!shouldSkipCreateNotification) {
      await emitBugNotificationEvent({
        eventType: 'bug_create',
        bug: detail,
        req,
      })
    }
    for (const assignee of assigneeList) {
      await emitBugNotificationEvent({
        eventType: 'bug_assign',
        bug: detail,
        req,
        extra: {
          from_assignee_id: null,
          from_assignee_name: '',
          to_assignee_id: assignee.id,
          to_assignee_name: assignee.name,
        },
      })
    }

    const responseData = decorateBugDetailAttachments(detail, {
      ossConfig: getOssConfigFromEnv(),
      expireSeconds: getBugAttachmentSignExpireSeconds(),
    })
    return res.status(201).json({
      success: true,
      message: 'Bug创建成功',
      data: responseData,
    })
  } catch (err) {
    if (String(err?.message || '').includes('数据库迁移')) {
      return res.status(500).json({ success: false, message: err.message })
    }
    console.error('创建Bug失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateBug = async (req, res) => {
  const bugId = toPositiveInt(req.params.id)
  if (!bugId) {
    return res.status(400).json({ success: false, message: 'Bug ID 无效' })
  }

  try {
    const existing = await Bug.findBugById(bugId)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Bug不存在' })
    }
    if (!(await canManageBug(req, existing))) {
      return res.status(403).json({ success: false, message: '无权限编辑该Bug' })
    }

    const validation = await validateBugPayload(req.body, { isCreate: false })
    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message })
    }

    await Bug.updateBug(bugId, validation.data)
    const detail = await Bug.getBugDetail(bugId)

    // 指派变更时触发 bug_assign
    const prevAssigneeList = extractBugAssigneeList(existing)
    const nextAssigneeList = extractBugAssigneeList(detail)
    const prevAssigneeIds = new Set(prevAssigneeList.map((item) => item.id))
    const newAssignees = nextAssigneeList.filter((item) => !prevAssigneeIds.has(item.id))
    const primaryPreviousAssignee =
      prevAssigneeList[0] || {
        id: toPositiveInt(existing?.assignee_id),
        name: normalizeText(existing?.assignee_name, 100) || '',
      }

    for (const assignee of newAssignees) {
      await emitBugNotificationEvent({
        eventType: 'bug_assign',
        bug: detail,
        req,
        extra: {
          from_assignee_id: primaryPreviousAssignee?.id || null,
          from_assignee_name: primaryPreviousAssignee?.name || '',
          to_assignee_id: assignee.id,
          to_assignee_name: assignee.name,
        },
      })
    }

    const responseData = decorateBugDetailAttachments(detail, {
      ossConfig: getOssConfigFromEnv(),
      expireSeconds: getBugAttachmentSignExpireSeconds(),
    })
    return res.json({ success: true, message: 'Bug更新成功', data: responseData })
  } catch (err) {
    if (String(err?.message || '').includes('数据库迁移')) {
      return res.status(500).json({ success: false, message: err.message })
    }
    console.error('更新Bug失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteBug = async (req, res) => {
  const bugId = toPositiveInt(req.params.id)
  if (!bugId) {
    return res.status(400).json({ success: false, message: 'Bug ID 无效' })
  }

  try {
    const affected = await Bug.deleteBug(bugId)
    if (!affected) {
      return res.status(404).json({ success: false, message: 'Bug不存在' })
    }
    return res.json({ success: true, message: 'Bug删除成功' })
  } catch (err) {
    console.error('删除Bug失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

async function handleTransition(
  req,
  res,
  targetStatus,
  {
    actionKey = '',
    requireFixSolution = false,
    requireRemark = false,
    requireVerifyResult = false,
    successMessage,
  },
) {
  const bugId = toPositiveInt(req.params.id)
  if (!bugId) {
    return res.status(400).json({ success: false, message: 'Bug ID 无效' })
  }

  try {
    const existing = await Bug.findBugById(bugId)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Bug不存在' })
    }
    if (!(await canManageBug(req, existing))) {
      return res.status(403).json({ success: false, message: '无权限操作该Bug' })
    }

    const normalizedActionKey = normalizeActionKey(actionKey)
    const persistedWorkflowTransitions = await Bug.listBugWorkflowTransitions({ includeDisabled: false })
    const persistedStatusTransitions = persistedWorkflowTransitions.filter(
      (item) =>
        normalizeCode(item?.from_status_code) === normalizeCode(existing?.status_code),
    )
    let workflowRule = null

    if (persistedStatusTransitions.length > 0) {
      workflowRule =
        persistedStatusTransitions.find(
          (item) =>
            normalizeCode(item?.to_status_code) === normalizeCode(targetStatus) &&
            (!normalizedActionKey || normalizeActionKey(item?.action_key) === normalizedActionKey),
        ) || null
      if (!workflowRule) {
        return res.status(400).json({ success: false, message: '当前流程配置不允许执行该操作' })
      }
    } else {
      workflowRule = await Bug.getWorkflowTransitionRule({
        fromStatusCode: existing?.status_code,
        toStatusCode: targetStatus,
        actionKey: normalizedActionKey,
      })
    }

    const defaultRequirements = DEFAULT_ACTION_REQUIREMENTS[normalizedActionKey] || {
      requireRemark,
      requireFixSolution,
      requireVerifyResult,
    }
    const resolvedRequirements = workflowRule
      ? {
          requireRemark: Number(workflowRule.require_remark) === 1,
          requireFixSolution: Number(workflowRule.require_fix_solution) === 1,
          requireVerifyResult: Number(workflowRule.require_verify_result) === 1,
        }
      : defaultRequirements

    const payload = buildTransitionPayload(targetStatus, req)
    if (resolvedRequirements.requireFixSolution && !payload.fixSolution) {
      return res.status(400).json({ success: false, message: '修复方案不能为空' })
    }
    if (resolvedRequirements.requireRemark && !payload.remark) {
      return res.status(400).json({ success: false, message: '备注不能为空' })
    }
    if (resolvedRequirements.requireVerifyResult && !payload.verifyResult) {
      return res.status(400).json({ success: false, message: '验证结果不能为空' })
    }

    const result = await Bug.transitionBug(bugId, payload)
    if (!result.ok) {
      if (result.reason === 'not_found') {
        return res.status(404).json({ success: false, message: 'Bug不存在' })
      }
      if (result.reason === 'transition_not_allowed') {
        return res.status(400).json({ success: false, message: '当前状态不允许执行该操作' })
      }
      return res.status(400).json({ success: false, message: 'Bug流转失败' })
    }

    const detail = await Bug.getBugDetail(bugId)

    const fromStatus = normalizeText(existing?.status_name || existing?.status_code, 64) || ''
    const toStatus = normalizeText(detail?.status_name || detail?.status_code, 64) || ''
    await emitBugNotificationEvent({
      eventType: 'bug_status_change',
      bug: detail,
      req,
      extra: {
        from_status: fromStatus,
        to_status: toStatus,
      },
    })
    if (targetStatus === BUG_STATUS.FIXED) {
      await emitBugNotificationEvent({
        eventType: 'bug_fixed',
        bug: detail,
        req,
        extra: {
          from_status: fromStatus,
          to_status: toStatus,
        },
      })
    }
    if (targetStatus === BUG_STATUS.REOPENED) {
      await emitBugNotificationEvent({
        eventType: 'bug_reopen',
        bug: detail,
        req,
        extra: {
          from_status: fromStatus,
          to_status: toStatus,
          reopen_reason: normalizeText(req.body?.remark, 500) || '',
        },
      })
    }

    const responseData = decorateBugDetailAttachments(detail, {
      ossConfig: getOssConfigFromEnv(),
      expireSeconds: getBugAttachmentSignExpireSeconds(),
    })
    return res.json({ success: true, message: successMessage, data: responseData })
  } catch (err) {
    console.error('Bug流转失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const startBug = async (req, res) =>
  handleTransition(req, res, BUG_STATUS.PROCESSING, {
    actionKey: 'start',
    successMessage: 'Bug已开始处理',
  })

const fixBug = async (req, res) =>
  handleTransition(req, res, BUG_STATUS.FIXED, {
    actionKey: 'fix',
    requireFixSolution: true,
    successMessage: 'Bug已标记为已修复',
  })

const verifyBug = async (req, res) =>
  handleTransition(req, res, BUG_STATUS.CLOSED, {
    actionKey: 'verify',
    successMessage: 'Bug已关闭',
  })

const reopenBug = async (req, res) =>
  handleTransition(req, res, BUG_STATUS.REOPENED, {
    actionKey: 'reopen',
    requireRemark: true,
    successMessage: 'Bug已重新打开',
  })

const rejectBug = async (req, res) =>
  handleTransition(req, res, BUG_STATUS.CLOSED, {
    actionKey: 'reject',
    requireRemark: true,
    successMessage: 'Bug已打回并关闭',
  })

const transitionBugByWorkflow = async (req, res) => {
  const targetStatus = normalizeCode(req.body?.to_status_code)
  const actionKey = normalizeActionKey(req.body?.action_key)
  if (!targetStatus) {
    return res.status(400).json({ success: false, message: '缺少目标状态编码 to_status_code' })
  }
  if (!actionKey) {
    return res.status(400).json({ success: false, message: '缺少动作编码 action_key' })
  }

  const defaults = DEFAULT_ACTION_REQUIREMENTS[actionKey] || {
    requireRemark: false,
    requireFixSolution: false,
    requireVerifyResult: false,
  }

  return handleTransition(req, res, targetStatus, {
    actionKey,
    requireRemark: defaults.requireRemark,
    requireFixSolution: defaults.requireFixSolution,
    requireVerifyResult: defaults.requireVerifyResult,
    successMessage: 'Bug状态已更新',
  })
}

const createBugComment = async (req, res) => {
  const bugId = toPositiveInt(req.params.id)
  if (!bugId) {
    return res.status(400).json({ success: false, message: 'Bug ID 无效' })
  }

  const comment = normalizeText(req.body?.comment, 20000)
  if (!comment) {
    return res.status(400).json({ success: false, message: '评论内容不能为空' })
  }
  const mentionUserId = toPositiveInt(req.body?.mention_user_id)
  const parentCommentId = toPositiveInt(req.body?.parent_comment_id)

  try {
    const bug = await Bug.findBugById(bugId)
    if (!bug) {
      return res.status(404).json({ success: false, message: 'Bug不存在' })
    }

    let parentComment = null
    if (parentCommentId) {
      parentComment = await Bug.findCommentLogById(parentCommentId, { bugId })
      if (!parentComment || !isBugCommentLog(parentComment)) {
        return res.status(400).json({ success: false, message: '回复目标评论不存在' })
      }
      if (toPositiveInt(parentComment.parent_comment_id)) {
        return res.status(400).json({ success: false, message: '当前仅支持一级回复' })
      }
    }

    let mentionUser = null
    if (mentionUserId) {
      mentionUser = await User.findById(mentionUserId)
      if (!mentionUser) {
        return res.status(400).json({ success: false, message: '被@用户不存在' })
      }
    }

    const mentionDisplayName =
      normalizeText(mentionUser?.real_name || mentionUser?.username, 100) ||
      (mentionUserId ? `用户${mentionUserId}` : '')
    const statusCode = normalizeCode(bug?.status_code) || BUG_STATUS.NEW
    const commentForHistory = mentionDisplayName ? `@${mentionDisplayName} ${comment}` : comment
    const logResult = await Bug.addBugCommentLog(bugId, {
      operatorId: req.user.id,
      statusCode,
      comment: commentForHistory,
      parentCommentId,
    })
    if (!logResult?.ok) {
      if (logResult?.reason === 'not_found') {
        return res.status(404).json({ success: false, message: 'Bug不存在' })
      }
      return res.status(400).json({ success: false, message: '评论保存失败' })
    }

    const warnings = []
    if (mentionUserId) {
      const mentionOpenId = normalizeText(mentionUser?.feishu_open_id, 128)
      if (!mentionOpenId) {
        warnings.push('评论已记录，但被@用户未绑定飞书 OpenID，通知未发送')
      } else {
        const sendResult = await sendNotification({
          channelType: 'feishu',
          title: `Bug评论提醒 ${normalizeText(bug?.bug_no, 64) || `#${bugId}`}`,
          content: comment,
          targets: [
            {
              target_type: 'user',
              target_id: mentionOpenId,
              target_name: mentionDisplayName || null,
              extra: {
                user_id: mentionUserId,
              },
            },
          ],
          metadata: {
            source: 'bug_comment_mention',
            bug_id: bugId,
            bug_no: normalizeText(bug?.bug_no, 64) || null,
            detail_url: buildBugDetailUrl(bugId),
            detail_action_text: '查看Bug',
            mention_user_id: mentionUserId,
            mention_user_name: mentionDisplayName || null,
          },
        })
        if (!sendResult?.success) {
          warnings.push(sendResult?.error_message || '评论已记录，但通知发送失败')
        } else if (sendResult?.skipped) {
          warnings.push(sendResult?.error_message || '评论已记录，但通知发送被策略跳过')
        }
      }
    }

    const latestDetail = await Bug.getBugDetail(bugId)
    const responseData = decorateBugDetailAttachments(latestDetail, {
      ossConfig: getOssConfigFromEnv(),
      expireSeconds: getBugAttachmentSignExpireSeconds(),
    })

    return res.json({
      success: true,
      message: warnings.length ? `评论已发布（${warnings.join('；')}）` : '评论已发布',
      data: {
        comment_log_id: logResult.commentLogId || null,
        detail: responseData,
      },
      warnings,
    })
  } catch (err) {
    console.error('Bug评论失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateBugComment = async (req, res) => {
  const bugId = toPositiveInt(req.params.id)
  const commentLogId = toPositiveInt(req.params.commentLogId)
  if (!bugId || !commentLogId) {
    return res.status(400).json({ success: false, message: '参数无效' })
  }

  const comment = normalizeText(req.body?.comment, 20000)
  if (!comment) {
    return res.status(400).json({ success: false, message: '评论内容不能为空' })
  }

  try {
    const [bug, commentLog] = await Promise.all([
      Bug.findBugById(bugId),
      Bug.findCommentLogById(commentLogId, { bugId }),
    ])
    if (!bug) {
      return res.status(404).json({ success: false, message: 'Bug不存在' })
    }
    if (!commentLog || !isBugCommentLog(commentLog)) {
      return res.status(404).json({ success: false, message: '评论不存在' })
    }
    if (!canEditOwnBugComment(req, commentLog)) {
      return res.status(403).json({ success: false, message: '仅支持编辑自己发布的评论' })
    }

    const affected = await Bug.updateCommentLog(commentLogId, { bugId, comment })
    if (!affected) {
      return res.status(400).json({ success: false, message: '评论更新失败' })
    }

    const latestDetail = await Bug.getBugDetail(bugId)
    const responseData = decorateBugDetailAttachments(latestDetail, {
      ossConfig: getOssConfigFromEnv(),
      expireSeconds: getBugAttachmentSignExpireSeconds(),
    })

    return res.json({
      success: true,
      message: '评论已更新',
      data: {
        comment_log_id: commentLogId,
        detail: responseData,
      },
    })
  } catch (err) {
    console.error('更新Bug评论失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listBugAssignees = async (req, res) => {
  try {
    const rows = await Bug.listAssignees({
      demandId: req.query.demand_id,
      keyword: req.query.keyword,
    })
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('获取Bug可选处理人失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getBugWorkflowConfig = async (req, res) => {
  try {
    const data = await Bug.getBugWorkflowConfig({ includeDisabled: true })
    return res.json({
      success: true,
      data: {
        ...data,
        editable: Boolean(req.userAccess?.is_super_admin || hasPermission(req, 'bug.manage')),
      },
    })
  } catch (err) {
    if (err?.code === 'BUG_WORKFLOW_CONFIG_UNAVAILABLE') {
      return res.status(400).json({ success: false, message: err.message })
    }
    console.error('获取Bug流程配置失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateBugWorkflowConfig = async (req, res) => {
  if (!(req.userAccess?.is_super_admin || hasPermission(req, 'bug.manage'))) {
    return res.status(403).json({ success: false, message: '无权限更新流程配置' })
  }

  const transitions = normalizeWorkflowTransitionPayloadRows(req.body?.transitions)
  if (transitions.length === 0) {
    return res.status(400).json({ success: false, message: '请至少配置一条流程流转规则' })
  }

  try {
    const statuses = await Bug.getBugStatusOptions({ enabledOnly: true })
    const statusCodeSet = new Set(statuses.map((item) => normalizeCode(item?.status_code)))

    const invalidRow = transitions.find(
      (item) =>
        !statusCodeSet.has(normalizeCode(item.from_status_code)) ||
        !statusCodeSet.has(normalizeCode(item.to_status_code)),
    )
    if (invalidRow) {
      return res.status(400).json({
        success: false,
        message: `状态编码无效：${invalidRow.from_status_code || '-'} -> ${invalidRow.to_status_code || '-'}`,
      })
    }

    await Bug.replaceBugWorkflowTransitions(transitions, { operatorUserId: req.user.id })
    const latest = await Bug.getBugWorkflowConfig({ includeDisabled: true })

    return res.json({
      success: true,
      message: 'Bug流程配置已保存',
      data: {
        ...latest,
        editable: true,
      },
    })
  } catch (err) {
    if (err?.code === 'BUG_WORKFLOW_CONFIG_UNAVAILABLE') {
      return res.status(400).json({ success: false, message: err.message })
    }
    console.error('更新Bug流程配置失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listBugViews = async (req, res) => {
  try {
    const rows = await Bug.listBugViews({ viewerUserId: req.user.id })
    return res.json({
      success: true,
      data: rows.map((item) => decorateBugViewRow(req, item)),
    })
  } catch (err) {
    console.error('获取Bug视图列表失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getBugViewById = async (req, res) => {
  const viewId = toPositiveInt(req.params.viewId)
  if (!viewId) {
    return res.status(400).json({ success: false, message: '视图ID无效' })
  }

  try {
    const row = await Bug.getBugViewById(viewId, { viewerUserId: req.user.id })
    if (!row) {
      return res.status(404).json({ success: false, message: '视图不存在或无权限查看' })
    }
    return res.json({
      success: true,
      data: decorateBugViewRow(req, row),
    })
  } catch (err) {
    console.error('获取Bug视图详情失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createBugView = async (req, res) => {
  const viewName = normalizeText(req.body?.view_name || req.body?.name, 100)
  if (!viewName) {
    return res.status(400).json({ success: false, message: '视图名称不能为空' })
  }

  const visibility = normalizeBugViewVisibility(req.body?.visibility)
  const config = sanitizeBugViewConfig(req.body?.config)

  try {
    const viewId = await Bug.createBugView({
      viewName,
      visibility,
      config,
      createdBy: req.user.id,
      updatedBy: req.user.id,
    })
    if (!viewId) {
      return res.status(400).json({ success: false, message: '创建视图失败，请检查参数' })
    }
    const row = await Bug.getBugViewById(viewId, {
      viewerUserId: req.user.id,
      bypassScope: true,
    })
    return res.status(201).json({
      success: true,
      message: '视图保存成功',
      data: decorateBugViewRow(req, row),
    })
  } catch (err) {
    console.error('创建Bug视图失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateBugView = async (req, res) => {
  const viewId = toPositiveInt(req.params.viewId)
  if (!viewId) {
    return res.status(400).json({ success: false, message: '视图ID无效' })
  }

  try {
    const existing = await Bug.getBugViewById(viewId, {
      viewerUserId: req.user.id,
      bypassScope: true,
    })
    if (!existing) {
      return res.status(404).json({ success: false, message: '视图不存在' })
    }
    if (!canManageBugView(req, existing)) {
      return res.status(403).json({ success: false, message: '无权限编辑该视图' })
    }

    const viewName = normalizeText(req.body?.view_name || req.body?.name || existing.view_name, 100)
    if (!viewName) {
      return res.status(400).json({ success: false, message: '视图名称不能为空' })
    }
    const visibility = normalizeBugViewVisibility(req.body?.visibility || existing.visibility)
    const configSource = Object.prototype.hasOwnProperty.call(req.body || {}, 'config')
      ? req.body.config
      : existing.config
    const config = sanitizeBugViewConfig(configSource)

    const affected = await Bug.updateBugView(viewId, {
      viewName,
      visibility,
      config,
      updatedBy: req.user.id,
    })
    if (!affected) {
      return res.status(400).json({ success: false, message: '视图更新失败' })
    }

    const row = await Bug.getBugViewById(viewId, {
      viewerUserId: req.user.id,
      bypassScope: true,
    })
    return res.json({
      success: true,
      message: '视图更新成功',
      data: decorateBugViewRow(req, row),
    })
  } catch (err) {
    console.error('更新Bug视图失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteBugView = async (req, res) => {
  const viewId = toPositiveInt(req.params.viewId)
  if (!viewId) {
    return res.status(400).json({ success: false, message: '视图ID无效' })
  }

  try {
    const existing = await Bug.getBugViewById(viewId, {
      viewerUserId: req.user.id,
      bypassScope: true,
    })
    if (!existing) {
      return res.status(404).json({ success: false, message: '视图不存在' })
    }
    if (!canDeleteBugView(req, existing)) {
      return res.status(403).json({ success: false, message: '无权限删除该视图' })
    }
    const affected = await Bug.deleteBugView(viewId, { updatedBy: req.user.id })
    if (!affected) {
      return res.status(400).json({ success: false, message: '视图删除失败' })
    }
    return res.json({ success: true, message: '视图删除成功' })
  } catch (err) {
    console.error('删除Bug视图失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getDemandBugStats = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求ID无效' })
  }
  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }
    const rows = await Bug.getDemandBugStats(demandId)
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('获取需求Bug统计失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listDemandBugs = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求ID无效' })
  }
  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }
    const data = await Bug.listBugs({
      page: req.query.page,
      pageSize: req.query.pageSize,
      keyword: req.query.keyword,
      statusCode: req.query.status_code,
      severityCode: req.query.severity_code,
      bugTypeCode: req.query.bug_type_code,
      productCode: req.query.product_code,
      issueStage: req.query.issue_stage,
      demandId,
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取需求关联Bug列表失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getBugAttachmentPolicy = async (req, res) => {
  const bugId = toPositiveInt(req.params.id)
  if (!bugId) {
    return res.status(400).json({ success: false, message: 'Bug ID 无效' })
  }

  try {
    const bug = await Bug.findBugById(bugId)
    if (!bug) {
      return res.status(404).json({ success: false, message: 'Bug不存在' })
    }
    const fileName = sanitizeFileName(req.body.file_name || 'file')
    const policyResult = buildBugAttachmentPolicyPayload({
      bug,
      fileName,
      fileSize: req.body.file_size,
      businessDir: 'bugs',
      businessNo: bug.bug_no || `BUG_${bug.id}`,
    })
    if (!policyResult.ok) {
      return res.status(policyResult.status || 400).json({ success: false, message: policyResult.message || '获取上传策略失败' })
    }
    return res.json({ success: true, data: policyResult.data })
  } catch (err) {
    console.error('获取Bug附件上传策略失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getBugCommentAttachmentPolicy = async (req, res) => {
  const bugId = toPositiveInt(req.params.id)
  const commentLogId = toPositiveInt(req.params.commentLogId)
  if (!bugId || !commentLogId) {
    return res.status(400).json({ success: false, message: '参数无效' })
  }

  try {
    const [bug, commentLog] = await Promise.all([
      Bug.findBugById(bugId),
      Bug.findCommentLogById(commentLogId, { bugId }),
    ])
    if (!bug) {
      return res.status(404).json({ success: false, message: 'Bug不存在' })
    }
    if (!commentLog) {
      return res.status(404).json({ success: false, message: '评论不存在' })
    }
    if (!(await canManageBugComment(req, bug, commentLog))) {
      return res.status(403).json({ success: false, message: '无权限为该评论上传附件' })
    }

    const fileName = sanitizeFileName(req.body.file_name || 'file')
    const policyResult = buildBugAttachmentPolicyPayload({
      bug,
      fileName,
      fileSize: req.body.file_size,
      businessDir: 'bug-comments',
      businessNo: `${bug.bug_no || `BUG_${bug.id}`}/comment_${commentLogId}`,
    })
    if (!policyResult.ok) {
      return res.status(policyResult.status || 400).json({ success: false, message: policyResult.message || '获取上传策略失败' })
    }

    return res.json({ success: true, data: policyResult.data })
  } catch (err) {
    console.error('获取Bug评论附件上传策略失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createBugAttachment = async (req, res) => {
  const bugId = toPositiveInt(req.params.id)
  if (!bugId) {
    return res.status(400).json({ success: false, message: 'Bug ID 无效' })
  }

  const fileName = normalizeText(req.body.file_name, 255)
  const objectKey = normalizeText(req.body.object_key, 500)
  if (!fileName || !objectKey) {
    return res.status(400).json({ success: false, message: '附件文件名和对象Key不能为空' })
  }

  try {
    const bug = await Bug.findBugById(bugId)
    if (!bug) {
      return res.status(404).json({ success: false, message: 'Bug不存在' })
    }
    if (!(await canManageBug(req, bug))) {
      return res.status(403).json({ success: false, message: '无权限维护该Bug附件' })
    }

    const existingAttachment = await Bug.findAttachmentByObjectKey(bugId, objectKey)
    if (existingAttachment) {
      const responseData = decorateBugAttachment(existingAttachment, {
        ossConfig: getOssConfigFromEnv(),
        expireSeconds: getBugAttachmentSignExpireSeconds(),
      })
      return res.status(200).json({ success: true, message: '附件已存在', data: responseData })
    }

    const attachmentId = await Bug.createAttachment(bugId, {
      fileName,
      fileExt: normalizeText(req.body.file_ext, 50) || null,
      fileSize: req.body.file_size,
      mimeType: normalizeText(req.body.mime_type, 100) || null,
      storageProvider: normalizeText(req.body.storage_provider, 50) || 'ALIYUN_OSS',
      bucketName: normalizeText(req.body.bucket_name, 100) || null,
      objectKey,
      objectUrl:
        normalizeText(req.body.object_url, 1000) ||
        buildPublicObjectUrl({
          publicBaseUrl: getOssConfigFromEnv()?.publicBaseUrl || '',
          objectKey,
        }) ||
        null,
      uploadedBy: req.user.id,
    })

    const attachment = await Bug.findAttachmentById(attachmentId)
    const responseData = decorateBugAttachment(attachment, {
      ossConfig: getOssConfigFromEnv(),
      expireSeconds: getBugAttachmentSignExpireSeconds(),
    })
    return res.status(201).json({ success: true, message: '附件登记成功', data: responseData })
  } catch (err) {
    console.error('登记Bug附件失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createBugCommentAttachment = async (req, res) => {
  const bugId = toPositiveInt(req.params.id)
  const commentLogId = toPositiveInt(req.params.commentLogId)
  if (!bugId || !commentLogId) {
    return res.status(400).json({ success: false, message: '参数无效' })
  }

  const fileName = normalizeText(req.body.file_name, 255)
  const objectKey = normalizeText(req.body.object_key, 500)
  if (!fileName || !objectKey) {
    return res.status(400).json({ success: false, message: '附件文件名和对象Key不能为空' })
  }

  try {
    const [bug, commentLog] = await Promise.all([
      Bug.findBugById(bugId),
      Bug.findCommentLogById(commentLogId, { bugId }),
    ])
    if (!bug) {
      return res.status(404).json({ success: false, message: 'Bug不存在' })
    }
    if (!commentLog) {
      return res.status(404).json({ success: false, message: '评论不存在' })
    }
    if (!(await canManageBugComment(req, bug, commentLog))) {
      return res.status(403).json({ success: false, message: '无权限维护该评论附件' })
    }

    const existingAttachment = await Bug.findCommentAttachmentByObjectKey(bugId, commentLogId, objectKey)
    if (existingAttachment) {
      const responseData = decorateBugCommentAttachment(existingAttachment, {
        ossConfig: getOssConfigFromEnv(),
        expireSeconds: getBugAttachmentSignExpireSeconds(),
      })
      return res.status(200).json({ success: true, message: '评论附件已存在', data: responseData })
    }

    const attachmentId = await Bug.createCommentAttachment(bugId, {
      commentLogId,
      fileName,
      fileExt: normalizeText(req.body.file_ext, 50) || null,
      fileSize: req.body.file_size,
      mimeType: normalizeText(req.body.mime_type, 100) || null,
      storageProvider: normalizeText(req.body.storage_provider, 50) || 'ALIYUN_OSS',
      bucketName: normalizeText(req.body.bucket_name, 100) || null,
      objectKey,
      objectUrl:
        normalizeText(req.body.object_url, 1000) ||
        buildPublicObjectUrl({
          publicBaseUrl: getOssConfigFromEnv()?.publicBaseUrl || '',
          objectKey,
        }) ||
        null,
      uploadedBy: req.user.id,
    })

    const attachment = await Bug.findCommentAttachmentById(attachmentId)
    const responseData = decorateBugCommentAttachment(attachment, {
      ossConfig: getOssConfigFromEnv(),
      expireSeconds: getBugAttachmentSignExpireSeconds(),
    })
    return res.status(201).json({ success: true, message: '评论附件登记成功', data: responseData })
  } catch (err) {
    console.error('登记Bug评论附件失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteBugAttachment = async (req, res) => {
  const bugId = toPositiveInt(req.params.id)
  const attachmentId = toPositiveInt(req.params.attachmentId)
  if (!bugId || !attachmentId) {
    return res.status(400).json({ success: false, message: '参数无效' })
  }

  try {
    const bug = await Bug.findBugById(bugId)
    if (!bug) {
      return res.status(404).json({ success: false, message: 'Bug不存在' })
    }
    if (!(await canManageBug(req, bug))) {
      return res.status(403).json({ success: false, message: '无权限维护该Bug附件' })
    }

    const attachment = await Bug.findAttachmentById(attachmentId)
    if (!attachment || Number(attachment.bug_id || 0) !== bugId) {
      return res.status(404).json({ success: false, message: '附件不存在' })
    }

    let deleteWarning = ''
    if (
      normalizeCode(attachment.storage_provider) === 'ALIYUN_OSS' &&
      normalizeText(attachment.object_key, 500)
    ) {
      const oss = getOssConfigFromEnv()
      if (oss) {
        try {
          const deleteResult = await deleteOssObject({
            accessKeyId: oss.accessKeyId,
            accessKeySecret: oss.accessKeySecret,
            bucketName: normalizeText(attachment.bucket_name, 100) || oss.bucketName,
            endpoint: oss.endpoint,
            objectKey: attachment.object_key,
            securityToken: oss.securityToken,
          })
          if (!deleteResult?.ok && !deleteResult?.skipped) {
            deleteWarning = '，OSS源文件未能同步删除'
            console.warn('删除OSS Bug附件失败:', deleteResult)
          }
        } catch (ossErr) {
          deleteWarning = '，OSS源文件未能同步删除'
          console.warn('删除OSS Bug附件异常:', ossErr)
        }
      }
    }

    const affected = await Bug.deleteAttachment(attachmentId, { bugId })
    if (!affected) {
      return res.status(404).json({ success: false, message: '附件不存在' })
    }
    return res.json({
      success: true,
      message: `附件删除成功${deleteWarning}`,
    })
  } catch (err) {
    console.error('删除Bug附件失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteBugCommentAttachment = async (req, res) => {
  const bugId = toPositiveInt(req.params.id)
  const commentLogId = toPositiveInt(req.params.commentLogId)
  const attachmentId = toPositiveInt(req.params.attachmentId)
  if (!bugId || !commentLogId || !attachmentId) {
    return res.status(400).json({ success: false, message: '参数无效' })
  }

  try {
    const [bug, commentLog, attachment] = await Promise.all([
      Bug.findBugById(bugId),
      Bug.findCommentLogById(commentLogId, { bugId }),
      Bug.findCommentAttachmentById(attachmentId),
    ])
    if (!bug) {
      return res.status(404).json({ success: false, message: 'Bug不存在' })
    }
    if (!commentLog) {
      return res.status(404).json({ success: false, message: '评论不存在' })
    }
    if (
      !attachment ||
      Number(attachment.bug_id || 0) !== bugId ||
      Number(attachment.comment_log_id || 0) !== commentLogId
    ) {
      return res.status(404).json({ success: false, message: '评论附件不存在' })
    }

    const currentUserId = Number(req.user?.id || 0)
    const canDeleteCurrentAttachment =
      (await canManageBugComment(req, bug, commentLog)) || currentUserId === Number(attachment.uploaded_by || 0)
    if (!canDeleteCurrentAttachment) {
      return res.status(403).json({ success: false, message: '无权限删除该评论附件' })
    }

    let deleteWarning = ''
    if (
      normalizeCode(attachment.storage_provider) === 'ALIYUN_OSS' &&
      normalizeText(attachment.object_key, 500)
    ) {
      const oss = getOssConfigFromEnv()
      if (oss) {
        try {
          const deleteResult = await deleteOssObject({
            accessKeyId: oss.accessKeyId,
            accessKeySecret: oss.accessKeySecret,
            bucketName: normalizeText(attachment.bucket_name, 100) || oss.bucketName,
            endpoint: oss.endpoint,
            objectKey: attachment.object_key,
            securityToken: oss.securityToken,
          })
          if (!deleteResult?.ok && !deleteResult?.skipped) {
            deleteWarning = '，OSS源文件未能同步删除'
            console.warn('删除OSS Bug评论附件失败:', deleteResult)
          }
        } catch (ossErr) {
          deleteWarning = '，OSS源文件未能同步删除'
          console.warn('删除OSS Bug评论附件异常:', ossErr)
        }
      }
    }

    const affected = await Bug.deleteCommentAttachment(attachmentId, { bugId, commentLogId })
    if (!affected) {
      return res.status(404).json({ success: false, message: '评论附件不存在' })
    }
    return res.json({
      success: true,
      message: `评论附件删除成功${deleteWarning}`,
    })
  } catch (err) {
    console.error('删除Bug评论附件失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  listBugs,
  getBugDetail,
  createBug,
  updateBug,
  deleteBug,
  startBug,
  fixBug,
  verifyBug,
  reopenBug,
  rejectBug,
  transitionBugByWorkflow,
  createBugComment,
  updateBugComment,
  listBugAssignees,
  getBugWorkflowConfig,
  updateBugWorkflowConfig,
  listBugViews,
  getBugViewById,
  createBugView,
  updateBugView,
  deleteBugView,
  getDemandBugStats,
  listDemandBugs,
  getBugAttachmentPolicy,
  getBugCommentAttachmentPolicy,
  createBugAttachment,
  createBugCommentAttachment,
  deleteBugAttachment,
  deleteBugCommentAttachment,
}
