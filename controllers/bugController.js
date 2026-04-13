const Bug = require('../models/Bug')
const Work = require('../models/Work')
const NotificationEvent = require('../models/NotificationEvent')
const pool = require('../utils/db')
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

function getBugAttachmentSignExpireSeconds() {
  return Math.max(60, Number(process.env.BUG_ATTACHMENT_SIGN_EXPIRE_SECONDS || 1800))
}

function buildBugAttachmentDownloadUrl(attachment, { ossConfig = null, expireSeconds = 1800 } = {}) {
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
    })
    if (signedUrl) return signedUrl
  }

  return objectUrl || ''
}

function decorateBugAttachment(attachment, options = {}) {
  if (!attachment) return attachment
  return {
    ...attachment,
    download_url: buildBugAttachmentDownloadUrl(attachment, options),
  }
}

function decorateBugDetailAttachments(detail, options = {}) {
  if (!detail || !Array.isArray(detail.attachments)) return detail
  return {
    ...detail,
    attachments: detail.attachments.map((item) => decorateBugAttachment(item, options)),
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
  if (!reproduceSteps) return { ok: false, message: '重现步骤不能为空' }
  if (!expectedResult) return { ok: false, message: '预期结果不能为空' }
  if (!actualResult) return { ok: false, message: '实际结果不能为空' }
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
  if (!(await Bug.validateDictCode('bug_stage', issueStage, { allowNull: true }))) {
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
      reproduceSteps,
      expectedResult,
      actualResult,
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

async function handleTransition(req, res, targetStatus, { requireFixSolution = false, requireRemark = false, requireVerifyResult = false, successMessage }) {
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

    const payload = buildTransitionPayload(targetStatus, req)
    if (requireFixSolution && !payload.fixSolution) {
      return res.status(400).json({ success: false, message: '修复方案不能为空' })
    }
    if (requireRemark && !payload.remark) {
      return res.status(400).json({ success: false, message: '备注不能为空' })
    }
    if (requireVerifyResult && !payload.verifyResult) {
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
    successMessage: 'Bug已开始处理',
  })

const fixBug = async (req, res) =>
  handleTransition(req, res, BUG_STATUS.FIXED, {
    requireFixSolution: true,
    successMessage: 'Bug已标记为已修复',
  })

const verifyBug = async (req, res) =>
  handleTransition(req, res, BUG_STATUS.CLOSED, {
    requireVerifyResult: true,
    successMessage: 'Bug已关闭',
  })

const reopenBug = async (req, res) =>
  handleTransition(req, res, BUG_STATUS.REOPENED, {
    requireRemark: true,
    successMessage: 'Bug已重新打开',
  })

const rejectBug = async (req, res) =>
  handleTransition(req, res, BUG_STATUS.REOPENED, {
    requireRemark: true,
    successMessage: 'Bug已打回',
  })

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

    const oss = getOssConfigFromEnv()
    if (!oss) {
      return res.status(400).json({
        success: false,
        message: '阿里云OSS未配置，暂不可上传附件',
      })
    }

    const fileName = sanitizeFileName(req.body.file_name || 'file')
    const fileSize = Number(req.body.file_size || 0)
    if (fileSize > 0 && fileSize > oss.maxFileSize) {
      return res.status(400).json({
        success: false,
        message: `附件大小不能超过 ${Math.ceil(oss.maxFileSize / 1024 / 1024)}MB`,
      })
    }
    const objectKey = buildOssObjectKey({
      rootDir: oss.uploadDir,
      businessDir: 'bugs',
      businessNo: bug.bug_no || `BUG_${bug.id}`,
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

    return res.json({
      success: true,
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
    })
  } catch (err) {
    console.error('获取Bug附件上传策略失败:', err)
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
  listBugAssignees,
  getDemandBugStats,
  listDemandBugs,
  getBugAttachmentPolicy,
  createBugAttachment,
  deleteBugAttachment,
}
