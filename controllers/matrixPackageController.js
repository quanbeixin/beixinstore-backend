const MatrixPackage = require('../models/MatrixPackage')
const AppVersionRelease = require('../models/AppVersionRelease')
const MatrixPackageProductionNode = require('../models/MatrixPackageProductionNode')
const MatrixPackageSideNote = require('../models/MatrixPackageSideNote')
const MatrixPackageNotificationService = require('../services/matrixPackageNotificationService')
const MatrixPackageDemandService = require('../services/matrixPackageDemandService')
const { sendNotification } = require('../utils/notificationSender')
const pool = require('../utils/db')
const {
  buildOssObjectKey,
  buildPublicObjectUrl,
  buildSignedGetObjectUrl,
  createPostPolicy,
  getOssConfigFromEnv,
} = require('../utils/oss')

const DEFAULT_NOTIFICATION_PUBLIC_BASE_URL = 'http://39.97.253.194'
const PREPARATION_NODE_CODES = new Set(['OPERATION_MATERIAL', 'DESIGN_PRODUCTION'])
const SIDE_CHECK_NOTIFICATION_NOTE_TYPES = new Set(['DELIVERY', 'DESIGN', 'OPERATION', 'FRONTEND', 'DEVOPS'])

function normalizeText(value, maxLen = 500) {
  return String(value || '').trim().slice(0, maxLen)
}

function toPositiveInt(value) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function isLocalHost(hostname = '') {
  const normalized = String(hostname || '').trim().toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0'
}

function normalizePublicBaseUrl(value) {
  const text = normalizeText(value, 1000)
  if (!text) return ''
  try {
    const parsed = new URL(text)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    if (isLocalHost(parsed.hostname)) return ''
    parsed.pathname = parsed.pathname.replace(/\/+$/g, '')
    return parsed.toString().replace(/\/+$/g, '')
  } catch {
    return ''
  }
}

function normalizePortalBaseUrl() {
  const explicitPublic = normalizePublicBaseUrl(process.env.NOTIFICATION_PORTAL_PUBLIC_BASE_URL)
  if (explicitPublic) return explicitPublic

  const configuredBaseUrl = normalizePublicBaseUrl(process.env.NOTIFICATION_PORTAL_BASE_URL)
  if (configuredBaseUrl) return configuredBaseUrl

  const firstNonLocalOrigin = String(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((item) => normalizePublicBaseUrl(item))
    .find(Boolean)
  if (firstNonLocalOrigin) return firstNonLocalOrigin

  return DEFAULT_NOTIFICATION_PUBLIC_BASE_URL
}

function buildPortalUrl(pathname = '') {
  const baseUrl = normalizePortalBaseUrl()
  if (!baseUrl) return ''
  const path = String(pathname || '').trim()
  if (!path.startsWith('/')) return ''
  return `${baseUrl}${path}`
}

function buildMatrixPackageProductionDetailUrl(packageId) {
  const normalizedId = toPositiveInt(packageId)
  if (!normalizedId) return ''
  return buildPortalUrl(`/matrix-package-special/cold-standby-production/${encodeURIComponent(String(normalizedId))}`)
}

async function getNotificationTargetUser(userId) {
  const normalizedUserId = toPositiveInt(userId)
  if (!normalizedUserId) return null
  const [rows] = await require('../utils/db').query(
    `SELECT id, COALESCE(NULLIF(real_name, ''), username) AS display_name, feishu_open_id
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [normalizedUserId],
  )
  const row = rows?.[0]
  if (!row || !String(row.feishu_open_id || '').trim()) return null
  return {
    user_id: Number(row.id),
    display_name: row.display_name || `用户${row.id}`,
    feishu_open_id: String(row.feishu_open_id || '').trim(),
  }
}

function getSideNoteTitle(noteType) {
  const map = {
    DELIVERY: 'PUSH信息补充',
    DESIGN: '设计侧补充',
    OPERATION: '运营侧补充',
    FRONTEND: '前端补充',
    BACKEND: 'GP初始化配置信息',
    DEVOPS: '运维补充',
    ADVERTISING: '投放侧补充',
    REQUIREMENT: '需求侧补充',
    DEVELOPMENT: '研发侧补充',
  }
  return map[String(noteType || '').trim().toUpperCase()] || String(noteType || '').trim()
}

async function sendMatrixPackageManualReminder({
  packageDetail,
  receiverUserId,
  sceneTitle,
  dueLabel,
  dueValue,
}) {
  const targetUser = await getNotificationTargetUser(receiverUserId)
  if (!targetUser) {
    const err = new Error('matrix_package_reminder_target_invalid')
    err.statusCode = 400
    err.message = '提醒对象未绑定飞书，无法发送催办通知'
    throw err
  }

  const detailUrl = buildMatrixPackageProductionDetailUrl(packageDetail?.id)
  const content = [
    '**手动催办**',
    `矩阵包：${packageDetail?.package_name || '-'}`,
    `催办模块：${sceneTitle || '-'}`,
    `负责人：${targetUser.display_name}`,
    dueValue ? `${dueLabel}：${dueValue}` : '',
    `域名：${packageDetail?.domain_info || '-'}`,
    `包ID：${packageDetail?.app_id || '-'}`,
  ].filter(Boolean).join('\n')

  const result = await sendNotification({
    channelType: 'feishu',
    title: '矩阵包催办通知',
    content,
    targets: [{
      target_type: 'user',
      target_id: targetUser.feishu_open_id,
      target_name: targetUser.display_name,
      extra: { user_id: targetUser.user_id },
    }],
    metadata: {
      detail_url: detailUrl,
      detail_action_text: '生产详情',
    },
  })

  if (!result?.success) {
    const err = new Error(result?.error_message || '发送催办通知失败')
    err.statusCode = 500
    throw err
  }

  return targetUser
}

async function resolveMatrixPackageDemandChatTarget(packageDetail) {
  const demandId = normalizeText(packageDetail?.linked_demand_id, 64)
  if (!demandId) return null

  const [rows] = await pool.query(
    `SELECT id, name, group_chat_mode, group_chat_id
     FROM work_demands
     WHERE id = ?
     LIMIT 1`,
    [demandId],
  )
  const demand = rows?.[0]
  if (!demand) return null

  const mode = normalizeText(demand.group_chat_mode, 20).toLowerCase()
  const chatId = normalizeText(demand.group_chat_id, 128)
  if ((mode !== 'auto' && mode !== 'bind') || !chatId) return null

  return {
    target_type: 'chat',
    target_id: chatId,
    target_name: normalizeText(demand.name, 128) || `矩阵包需求群(${demand.id})`,
    extra: {
      demand_id: demand.id,
      group_chat_mode: mode,
    },
  }
}

async function sendPreparationNodeCompletedNotification({ packageDetail, node, operatorUserId = null }) {
  if (!packageDetail || !node || !PREPARATION_NODE_CODES.has(String(node.node_code || '').toUpperCase())) return null

  let latestPackageDetail = packageDetail
  let chatTarget = await resolveMatrixPackageDemandChatTarget(latestPackageDetail)
  if (!chatTarget && MatrixPackageDemandService.shouldEnsureDemand(packageDetail)) {
    await MatrixPackageDemandService.ensureProductionDemand(packageDetail, operatorUserId)
    latestPackageDetail = await MatrixPackage.getById(packageDetail.id)
    chatTarget = await resolveMatrixPackageDemandChatTarget(latestPackageDetail)
  }
  if (!chatTarget) {
    return {
      success: false,
      skipped: true,
      reason: 'DEMAND_GROUP_CHAT_NOT_FOUND',
    }
  }

  const detailUrl = buildMatrixPackageProductionDetailUrl(latestPackageDetail.id)
  const content = [
    '**前置准备已完成**',
    `矩阵包：${latestPackageDetail.package_name || '-'}`,
    `完成模块：${node.node_name || node.node_code || '-'}`,
    node.owner_name ? `负责人：${node.owner_name}` : '',
    node.completed_at ? `完成时间：${node.completed_at}` : '',
    `域名：${latestPackageDetail.domain_info || '-'}`,
    `包ID：${latestPackageDetail.app_id || '-'}`,
  ].filter(Boolean).join('\n')

  return sendNotification({
    channelType: 'feishu',
    title: '矩阵包前置准备完成',
    content,
    targets: [chatTarget],
    metadata: {
      detail_url: detailUrl,
      detail_action_text: '查看生产详情',
    },
  })
}

async function notifyPreparationNodeCompletedQuietly({ packageDetail, beforeNode, afterNode, operatorUserId = null }) {
  const beforeStatus = String(beforeNode?.status_code || '').toUpperCase()
  const afterStatus = String(afterNode?.status_code || '').toUpperCase()
  const nodeCode = String(afterNode?.node_code || '').toUpperCase()
  if (!PREPARATION_NODE_CODES.has(nodeCode) || beforeStatus === 'COMPLETED' || afterStatus !== 'COMPLETED') {
    return null
  }

  try {
    const result = await sendPreparationNodeCompletedNotification({ packageDetail, node: afterNode, operatorUserId })
    if (result?.skipped) {
      console.warn('矩阵包前置准备完成通知已跳过:', {
        packageId: packageDetail?.id,
        nodeCode,
        reason: result.reason,
        linkedDemandId: packageDetail?.linked_demand_id || '',
      })
    } else if (!result?.success) {
      console.warn('矩阵包前置准备完成通知发送失败:', {
        packageId: packageDetail?.id,
        nodeCode,
        error: result?.error_message || result?.message || 'UNKNOWN',
      })
    }
    return result
  } catch (error) {
    console.warn('矩阵包前置准备完成通知异常（已忽略）:', {
      packageId: packageDetail?.id,
      nodeCode,
      message: error?.message || error,
    })
    return null
  }
}

async function sendSideNoteConfirmedNotification({ packageDetail, note, operatorUserId = null }) {
  if (!packageDetail || !note) return null

  const noteType = String(note.note_type || '').trim().toUpperCase()
  if (!SIDE_CHECK_NOTIFICATION_NOTE_TYPES.has(noteType)) return null

  let latestPackageDetail = packageDetail
  let chatTarget = await resolveMatrixPackageDemandChatTarget(latestPackageDetail)
  if (!chatTarget && MatrixPackageDemandService.shouldEnsureDemand(packageDetail)) {
    await MatrixPackageDemandService.ensureProductionDemand(packageDetail, operatorUserId)
    latestPackageDetail = await MatrixPackage.getById(packageDetail.id)
    chatTarget = await resolveMatrixPackageDemandChatTarget(latestPackageDetail)
  }
  if (!chatTarget) {
    return {
      success: false,
      skipped: true,
      reason: 'DEMAND_GROUP_CHAT_NOT_FOUND',
    }
  }

  const detailUrl = buildMatrixPackageProductionDetailUrl(latestPackageDetail.id)
  const content = [
    '**各侧信息check已确认完成**',
    `矩阵包：${latestPackageDetail.package_name || '-'}`,
    `完成模块：${getSideNoteTitle(noteType) || '-'}`,
    note.owner_name ? `负责人：${note.owner_name}` : '',
    note.confirmed_at ? `确认时间：${note.confirmed_at}` : '',
    `域名：${latestPackageDetail.domain_info || '-'}`,
    `包ID：${latestPackageDetail.app_id || '-'}`,
  ].filter(Boolean).join('\n')

  return sendNotification({
    channelType: 'feishu',
    title: '矩阵包各侧信息check完成',
    content,
    targets: [chatTarget],
    metadata: {
      detail_url: detailUrl,
      detail_action_text: '查看生产详情',
    },
  })
}

async function notifySideNoteConfirmedQuietly({
  packageDetail,
  beforeNote,
  afterNote,
  operatorUserId = null,
}) {
  const noteType = String(afterNote?.note_type || '').trim().toUpperCase()
  if (!SIDE_CHECK_NOTIFICATION_NOTE_TYPES.has(noteType)) return null
  if (beforeNote?.is_confirmed || !afterNote?.is_confirmed) return null

  try {
    const result = await sendSideNoteConfirmedNotification({ packageDetail, note: afterNote, operatorUserId })
    if (result?.skipped) {
      console.warn('矩阵包各侧信息check完成通知已跳过:', {
        packageId: packageDetail?.id,
        noteType,
        reason: result.reason,
        linkedDemandId: packageDetail?.linked_demand_id || '',
      })
    } else if (!result?.success) {
      console.warn('矩阵包各侧信息check完成通知发送失败:', {
        packageId: packageDetail?.id,
        noteType,
        error: result?.error_message || result?.message || 'UNKNOWN',
      })
    }
    return result
  } catch (error) {
    console.warn('矩阵包各侧信息check完成通知异常（已忽略）:', {
      packageId: packageDetail?.id,
      noteType,
      message: error?.message || error,
    })
    return null
  }
}

function normalizeFileSizeBytes(value) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0
}

function buildFileSizeExceededMessage(maxFileSize) {
  const mb = Math.max(1, Math.ceil(Number(maxFileSize || 0) / 1024 / 1024))
  return `文件大小不能超过 ${mb}MB，请压缩后再上传`
}

function getMatrixPackageSideNoteSignExpireSeconds() {
  return Math.max(60, Number(process.env.MATRIX_PACKAGE_SIDE_NOTE_SIGN_EXPIRE_SECONDS || 300))
}

function buildMatrixPackageSideNoteAccessUrl(
  attachment,
  { ossConfig = null, expireSeconds = 300, contentDisposition = 'inline' } = {},
) {
  if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return ''
  const storageProvider = String(attachment.storage_provider || attachment.provider || '').trim().toUpperCase()
  const objectKey = String(attachment.object_key || '').trim().replace(/^\/+/, '')
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
      responseCacheControl: 'public,max-age=300',
    })
    if (signedUrl) return signedUrl
  }

  return objectUrl || ''
}

function decorateMatrixPackageSideNote(note, options = {}) {
  if (!note) return note
  let parsed = null
  try {
    parsed = JSON.parse(String(note.content || '{}'))
  } catch {
    return note
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return note

  let changed = false
  const nextContent = { ...parsed }
  Object.entries(nextContent).forEach(([fieldName, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const previewUrl = buildMatrixPackageSideNoteAccessUrl(value, options)
    const downloadUrl = buildMatrixPackageSideNoteAccessUrl(value, { ...options, contentDisposition: 'attachment' })
    if (!previewUrl && !downloadUrl) return
    nextContent[fieldName] = {
      ...value,
      preview_url: previewUrl,
      download_url: downloadUrl || previewUrl,
    }
    changed = true
  })

  return changed ? { ...note, content: JSON.stringify(nextContent) } : note
}

function decorateMatrixPackageSideNotes(notes = []) {
  if (!Array.isArray(notes) || notes.length === 0) return notes
  const ossConfig = getOssConfigFromEnv()
  const expireSeconds = getMatrixPackageSideNoteSignExpireSeconds()
  return notes.map((note) => decorateMatrixPackageSideNote(note, { ossConfig, expireSeconds }))
}

function buildMatrixPackageSideNotePolicyPayload({ packageId, noteType, fieldName, fileName, fileSize } = {}) {
  const oss = getOssConfigFromEnv()
  if (!oss) {
    return {
      ok: false,
      status: 400,
      message: '阿里云OSS未配置，暂不可上传文件',
    }
  }

  const normalizedNoteType = normalizeText(noteType, 50).toUpperCase()
  const configuredMaxFileSize = Number(oss.maxFileSize || 50 * 1024 * 1024)
  const maxFileSize = normalizedNoteType === 'DESIGN'
    ? Math.max(configuredMaxFileSize, 100 * 1024 * 1024)
    : configuredMaxFileSize
  const normalizedFileSize = normalizeFileSizeBytes(fileSize)
  if (normalizedFileSize > 0 && normalizedFileSize > maxFileSize) {
    return {
      ok: false,
      status: 400,
      message: buildFileSizeExceededMessage(maxFileSize),
    }
  }

  const normalizedNoteTypePath = normalizedNoteType.toLowerCase() || 'side-note'
  const normalizedFieldName = normalizeText(fieldName, 80).replace(/[^a-zA-Z0-9._-]+/g, '_') || 'file'
  const objectKey = buildOssObjectKey({
    rootDir: oss.uploadDir,
    businessDir: `matrix-packages/${packageId}/${normalizedNoteTypePath}/${normalizedFieldName}`,
    businessNo: `PKG_${packageId}`,
    fileName,
  })
  const policyPayload = createPostPolicy({
    accessKeyId: oss.accessKeyId,
    accessKeySecret: oss.accessKeySecret,
    bucketName: oss.bucketName,
    endpoint: oss.endpoint,
    objectKey,
    expireSeconds: oss.expireSeconds,
    maxFileSize,
    successActionStatus: '200',
    securityToken: oss.securityToken,
  })
  const objectUrl = buildPublicObjectUrl({
    publicBaseUrl: oss.publicBaseUrl,
    objectKey,
  })
  const previewUrl = buildMatrixPackageSideNoteAccessUrl({
    storage_provider: 'ALIYUN_OSS',
    bucket_name: oss.bucketName,
    object_key: objectKey,
    object_url: objectUrl,
  }, {
    ossConfig: oss,
    expireSeconds: getMatrixPackageSideNoteSignExpireSeconds(),
  })
  const downloadUrl = buildMatrixPackageSideNoteAccessUrl({
    storage_provider: 'ALIYUN_OSS',
    bucket_name: oss.bucketName,
    object_key: objectKey,
    object_url: objectUrl,
  }, {
    ossConfig: oss,
    expireSeconds: getMatrixPackageSideNoteSignExpireSeconds(),
    contentDisposition: 'attachment',
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
      preview_url: previewUrl || objectUrl || null,
      download_url: downloadUrl || previewUrl || objectUrl || null,
      max_file_size: maxFileSize,
      host: policyPayload.host,
      expire_at: policyPayload.expire_at,
      fields: policyPayload.fields,
    },
  }
}

function handleError(res, error, fallbackMessage) {
  const statusCode = Number(error?.statusCode || 500)
  if (statusCode >= 500) {
    console.error(fallbackMessage, error)
  } else if (error?.debugInfo) {
    console.warn(fallbackMessage, {
      message: error?.message,
      debugInfo: error.debugInfo,
    })
  }
  const response = {
    success: false,
    message: error?.message || fallbackMessage,
  }
  if (error?.debugInfo) {
    response.debug_info = error.debugInfo
  }
  return res.status(statusCode).json(response)
}

async function listMatrixPackages(req, res) {
  try {
    const data = await MatrixPackage.list(req.query || {})
    return res.json({ success: true, data })
  } catch (error) {
    return handleError(res, error, '获取矩阵包列表失败')
  }
}

async function getMatrixPackage(req, res) {
  try {
    const data = await MatrixPackage.getById(req.params.id)
    if (!data) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    return res.json({ success: true, data })
  } catch (error) {
    return handleError(res, error, '获取矩阵包详情失败')
  }
}

async function createMatrixPackage(req, res) {
  try {
    let data = await MatrixPackage.create(req.body || {}, req.user?.id)
    if (MatrixPackageDemandService.shouldEnsureDemand(data)) {
      await MatrixPackageDemandService.ensureProductionDemand(data, req.user?.id || null)
      data = await MatrixPackage.getById(data.id)
    }
    return res.status(201).json({ success: true, message: '矩阵包已新增', data })
  } catch (error) {
    return handleError(res, error, '新增矩阵包失败')
  }
}

async function updateMatrixPackage(req, res) {
  try {
    const beforePackage = await MatrixPackage.getById(req.params.id)
    if (!beforePackage) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }

    let data = await MatrixPackage.update(req.params.id, req.body || {}, req.user?.id)
    await MatrixPackageNotificationService.triggerStatusChangeNotifications({
      beforePackage,
      afterPackage: data,
      operatorUserId: req.user?.id || null,
    })
    if (MatrixPackageDemandService.shouldEnsureDemand(data)) {
      await MatrixPackageDemandService.ensureProductionDemand(data, req.user?.id || null)
      data = await MatrixPackage.getById(data.id)
    }
    return res.json({ success: true, message: '矩阵包已更新', data })
  } catch (error) {
    return handleError(res, error, '更新矩阵包失败')
  }
}

async function completeMatrixPackageProduction(req, res) {
  try {
    const beforePackage = await MatrixPackage.getById(req.params.id)
    if (!beforePackage) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }

    const packagePayload = {
      package_name: beforePackage.package_name,
      app_id: beforePackage.app_id || '',
      new_package_version: beforePackage.new_package_version || '',
      domain_info: beforePackage.domain_info || '',
      developer_account_id: beforePackage.developer_account_id || null,
      platform: beforePackage.platform_codes || beforePackage.platform || '',
      delivery_status_code: beforePackage.delivery_status_code || null,
      owner_user_id: beforePackage.owner_user_id || null,
      status_code: 'COLD_STANDBY',
      health_code: null,
      production_stage_code: beforePackage.production_stage_code || null,
      expected_cold_ready_date: beforePackage.expected_cold_ready_date || null,
      latest_progress: beforePackage.latest_progress || '',
      production_checklist: beforePackage.production_checklist || [],
    }
    let afterPackage = await MatrixPackage.update(req.params.id, packagePayload, req.user?.id)
    await MatrixPackageNotificationService.triggerStatusChangeNotifications({
      beforePackage,
      afterPackage,
      operatorUserId: req.user?.id || null,
    })
    if (MatrixPackageDemandService.shouldEnsureDemand(afterPackage)) {
      await MatrixPackageDemandService.ensureProductionDemand(afterPackage, req.user?.id || null)
      afterPackage = await MatrixPackage.getById(afterPackage.id)
    }
    const demandWorkflowAdvance = await MatrixPackageDemandService.completeProductionStage(
      afterPackage,
      req.user?.id || null,
    )

    const release = await AppVersionRelease.ensureFromMatrixPackage(req.params.id, req.user?.id)

    return res.json({
      success: true,
      message: '生产已完成，APP发版记录已创建',
      data: {
        package: afterPackage,
        release,
        demand_workflow_advance: demandWorkflowAdvance,
      },
    })
  } catch (error) {
    return handleError(res, error, '完成矩阵包生产失败')
  }
}

async function deleteMatrixPackage(req, res) {
  try {
    const affected = await MatrixPackage.softDelete(req.params.id, req.user?.id)
    if (!affected) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    return res.json({ success: true, message: '矩阵包已删除' })
  } catch (error) {
    return handleError(res, error, '删除矩阵包失败')
  }
}

async function listMatrixPackageSideNotes(req, res) {
  try {
    const data = await MatrixPackageSideNote.listByPackageId(req.params.id)
    if (!data) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    return res.json({ success: true, data: decorateMatrixPackageSideNotes(data) })
  } catch (error) {
    return handleError(res, error, '获取矩阵包补充信息失败')
  }
}

async function listMatrixPackageProductionNodes(req, res) {
  try {
    const data = await MatrixPackageProductionNode.listByPackageId(req.params.id)
    if (!data) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    return res.json({ success: true, data })
  } catch (error) {
    return handleError(res, error, '获取矩阵包生产节点失败')
  }
}

async function updateMatrixPackageProductionNode(req, res) {
  try {
    const nodeCode = normalizeText(req.params.nodeCode, 50).toUpperCase()
    const [packageDetail, beforeNodes] = await Promise.all([
      MatrixPackage.getById(req.params.id),
      MatrixPackageProductionNode.listByPackageId(req.params.id),
    ])
    if (!packageDetail || !Array.isArray(beforeNodes)) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    const beforeNode = beforeNodes.find((item) => item.node_code === nodeCode) || null
    const data = await MatrixPackageProductionNode.updateStatus(
      req.params.id,
      nodeCode,
      req.body || {},
      req.user?.id,
    )
    if (!data) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    const afterNode = Array.isArray(data)
      ? data.find((item) => item.node_code === nodeCode) || null
      : null
    await notifyPreparationNodeCompletedQuietly({
      packageDetail,
      beforeNode,
      afterNode,
      operatorUserId: req.user?.id || null,
    })
    await MatrixPackageNotificationService.triggerPreparationAllCompletedNotifications({
      packageDetail,
      beforeNode,
      afterNode,
      nodes: data,
      operatorUserId: req.user?.id || null,
    })
    return res.json({ success: true, message: '生产节点已更新', data })
  } catch (error) {
    return handleError(res, error, '更新矩阵包生产节点失败')
  }
}

async function remindMatrixPackageProductionNode(req, res) {
  try {
    const packageId = req.params.id
    const nodeCode = normalizeText(req.params.nodeCode, 50).toUpperCase()
    const [detail, nodes] = await Promise.all([
      MatrixPackage.getById(packageId),
      MatrixPackageProductionNode.listByPackageId(packageId),
    ])
    if (!detail || !Array.isArray(nodes)) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }

    const node = nodes.find((item) => item.node_code === nodeCode)
    if (!node) {
      return res.status(404).json({ success: false, message: '生产节点不存在' })
    }

    const receiverUserId = toPositiveInt(node.owner_user_id) || toPositiveInt(detail.owner_user_id)
    if (!receiverUserId) {
      return res.status(400).json({ success: false, message: '当前节点负责人和矩阵包总负责人都未配置，无法催办' })
    }

    const targetUser = await sendMatrixPackageManualReminder({
      packageDetail: detail,
      receiverUserId,
      sceneTitle: node.node_name || node.node_code,
      dueLabel: '预期完成时间',
      dueValue: node.expected_delivery_date || '',
    })
    return res.json({
      success: true,
      message: `已催办 ${targetUser.display_name}`,
      data: {
        receiver_user_id: targetUser.user_id,
        receiver_name: targetUser.display_name,
      },
    })
  } catch (error) {
    return handleError(res, error, '发送生产节点催办通知失败')
  }
}

async function saveMatrixPackageSideNotes(req, res) {
  try {
    const data = await MatrixPackageSideNote.saveBatch(req.params.id, req.body?.notes || [], req.user?.id)
    if (!data) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    return res.json({ success: true, message: '补充信息已保存', data: decorateMatrixPackageSideNotes(data) })
  } catch (error) {
    return handleError(res, error, '保存矩阵包补充信息失败')
  }
}

async function confirmMatrixPackageSideNote(req, res) {
  try {
    const noteType = normalizeText(req.params.noteType, 50).toUpperCase()
    const [packageDetail, beforeNotes] = await Promise.all([
      MatrixPackage.getById(req.params.id),
      MatrixPackageSideNote.listByPackageId(req.params.id),
    ])
    if (!packageDetail || !Array.isArray(beforeNotes)) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    const beforeNote = beforeNotes.find((item) => item.note_type === noteType) || null
    const data = await MatrixPackageSideNote.confirm(req.params.id, req.params.noteType, req.user?.id)
    if (!data) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    const afterNote = Array.isArray(data)
      ? data.find((item) => item.note_type === noteType) || null
      : null
    await notifySideNoteConfirmedQuietly({
      packageDetail,
      beforeNote,
      afterNote,
      operatorUserId: req.user?.id || null,
    })
    return res.json({ success: true, message: '补充信息已确认', data: decorateMatrixPackageSideNotes(data) })
  } catch (error) {
    return handleError(res, error, '确认矩阵包补充信息失败')
  }
}

async function remindMatrixPackageSideNote(req, res) {
  try {
    const packageId = req.params.id
    const noteType = normalizeText(req.params.noteType, 50).toUpperCase()
    const [detail, notes] = await Promise.all([
      MatrixPackage.getById(packageId),
      MatrixPackageSideNote.listByPackageId(packageId),
    ])
    if (!detail || !Array.isArray(notes)) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }

    const note = notes.find((item) => item.note_type === noteType)
    if (!note) {
      return res.status(404).json({ success: false, message: '侧信息不存在' })
    }

    const receiverUserId = toPositiveInt(note.owner_user_id) || toPositiveInt(detail.owner_user_id)
    if (!receiverUserId) {
      return res.status(400).json({ success: false, message: '当前侧负责人和矩阵包总负责人都未配置，无法催办' })
    }

    const targetUser = await sendMatrixPackageManualReminder({
      packageDetail: detail,
      receiverUserId,
      sceneTitle: getSideNoteTitle(note.note_type),
      dueLabel: '统一截止时间',
      dueValue: detail.expected_cold_ready_date || '',
    })
    return res.json({
      success: true,
      message: `已催办 ${targetUser.display_name}`,
      data: {
        receiver_user_id: targetUser.user_id,
        receiver_name: targetUser.display_name,
      },
    })
  } catch (error) {
    return handleError(res, error, '发送侧信息催办通知失败')
  }
}

async function getMatrixPackageSideNoteUploadPolicy(req, res) {
  try {
    const packageId = Number.parseInt(req.params.id, 10)
    if (!Number.isFinite(packageId) || packageId <= 0) {
      return res.status(400).json({ success: false, message: '矩阵包ID不合法' })
    }

    const detail = await MatrixPackage.getById(packageId)
    if (!detail) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }

    const fileName = normalizeText(req.body?.file_name, 255)
    if (!fileName) {
      return res.status(400).json({ success: false, message: '文件名不能为空' })
    }

    const policyResult = buildMatrixPackageSideNotePolicyPayload({
      packageId,
      noteType: req.body?.note_type,
      fieldName: req.body?.field_name,
      fileName,
      fileSize: req.body?.file_size,
    })
    if (!policyResult.ok) {
      return res.status(policyResult.status || 400).json({ success: false, message: policyResult.message || '获取上传策略失败' })
    }
    return res.json({
      success: true,
      message: '上传策略已生成',
      data: policyResult.data,
    })
  } catch (error) {
    return handleError(res, error, '获取矩阵包补充信息上传策略失败')
  }
}

module.exports = {
  listMatrixPackages,
  getMatrixPackage,
  createMatrixPackage,
  updateMatrixPackage,
  completeMatrixPackageProduction,
  deleteMatrixPackage,
  listMatrixPackageProductionNodes,
  remindMatrixPackageProductionNode,
  listMatrixPackageSideNotes,
  saveMatrixPackageSideNotes,
  confirmMatrixPackageSideNote,
  remindMatrixPackageSideNote,
  getMatrixPackageSideNoteUploadPolicy,
  updateMatrixPackageProductionNode,
}
