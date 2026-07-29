const MatrixPackage = require('../models/MatrixPackage')
const MatrixPackageProductionNode = require('../models/MatrixPackageProductionNode')
const MatrixPackageSideNote = require('../models/MatrixPackageSideNote')
const MatrixPackageNotificationService = require('../services/matrixPackageNotificationService')
const MatrixPackageDemandService = require('../services/matrixPackageDemandService')
const MatrixPackageScheduleService = require('../services/matrixPackageScheduleService')
const {
  buildMatrixPackageSideNotePolicyPayload,
  decorateMatrixPackageSideNotes,
} = require('../services/matrixPackageSideNoteUploadService')
const { generateDataSafetyFile } = require('../services/matrixPackageDataSafetyFileService')
const { sendNotification } = require('../utils/notificationSender')
const pool = require('../utils/db')

const DEFAULT_NOTIFICATION_PUBLIC_BASE_URL = 'http://39.97.253.194'
const PREPARATION_NODE_CODES = new Set(['OPERATION_MATERIAL', 'DESIGN_PRODUCTION', 'BACKEND_SCRIPT'])
const AUTO_COMPLETE_PRODUCTION_NODE_CODES = ['FRONTEND_BUILD', 'BACKEND_SCRIPT']
const AUTO_COMPLETE_PRODUCTION_ALLOWED_STATUS_CODES = new Set(['IN_DEVELOPMENT', 'TESTING'])
const SIDE_CHECK_NOTIFICATION_NOTE_TYPES = new Set(['DELIVERY', 'DESIGN', 'OPERATION', 'FRONTEND', 'DEVOPS'])
const REQUIRED_PRODUCTION_COMPLETE_SIDE_CHECK_TYPES = ['DELIVERY', 'DESIGN', 'OPERATION', 'FRONTEND', 'DEVOPS']

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
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'expected_cold_ready_date') && data?.expected_cold_ready_date) {
      await MatrixPackageScheduleService.syncFromFrontendBuildT({
        packageId: data.id,
        frontendBuildAt: data.expected_cold_ready_date,
        operatorUserId: req.user?.id || null,
      })
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
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'expected_cold_ready_date') && data?.expected_cold_ready_date) {
      await MatrixPackageScheduleService.syncFromFrontendBuildT({
        packageId: data.id,
        frontendBuildAt: data.expected_cold_ready_date,
        operatorUserId: req.user?.id || null,
      })
      data = await MatrixPackage.getById(data.id)
    }
    return res.json({ success: true, message: '矩阵包已更新', data })
  } catch (error) {
    return handleError(res, error, '更新矩阵包失败')
  }
}

function areProductionBuildNodesCompleted(nodes = []) {
  const statusMap = new Map(
    (Array.isArray(nodes) ? nodes : []).map((item) => [
      String(item?.node_code || '').trim().toUpperCase(),
      String(item?.status_code || '').trim().toUpperCase(),
    ]),
  )
  return AUTO_COMPLETE_PRODUCTION_NODE_CODES.every((nodeCode) => statusMap.get(nodeCode) === 'COMPLETED')
}

async function completeMatrixPackageProductionStageCore(beforePackage, operatorUserId = null) {
  if (!beforePackage?.id) return null

  const beforeStatusCode = String(beforePackage.status_code || '').trim().toUpperCase()
  if (!AUTO_COMPLETE_PRODUCTION_ALLOWED_STATUS_CODES.has(beforeStatusCode)) {
    return {
      advanced: false,
      reason: 'PACKAGE_STATUS_NOT_ALLOWED',
      package_id: beforePackage.id,
      status_code: beforePackage.status_code || '',
    }
  }

  let afterPackage = beforePackage
  if (beforeStatusCode === 'IN_DEVELOPMENT') {
    const packagePayload = {
      package_name: beforePackage.package_name,
      app_id: beforePackage.app_id || '',
      new_package_version: beforePackage.new_package_version || '',
      domain_info: beforePackage.domain_info || '',
      developer_account_id: beforePackage.developer_account_id || null,
      platform: beforePackage.platform_codes || beforePackage.platform || '',
      delivery_channel_code: beforePackage.delivery_channel_code || null,
      delivery_status_code: beforePackage.delivery_status_code || null,
      owner_user_id: beforePackage.owner_user_id || null,
      status_code: 'TESTING',
      health_code: null,
      production_stage_code: beforePackage.production_stage_code || null,
      expected_cold_ready_date: beforePackage.expected_cold_ready_date || null,
      latest_progress: beforePackage.latest_progress || '',
      production_checklist: beforePackage.production_checklist || [],
    }
    afterPackage = await MatrixPackage.update(beforePackage.id, packagePayload, operatorUserId)
    await MatrixPackageNotificationService.triggerStatusChangeNotifications({
      beforePackage,
      afterPackage,
      operatorUserId,
    })
  }

  if (MatrixPackageDemandService.shouldEnsureDemand(afterPackage)) {
    await MatrixPackageDemandService.ensureProductionDemand(afterPackage, operatorUserId)
    afterPackage = await MatrixPackage.getById(afterPackage.id)
  }
  const demandWorkflowAdvance = await MatrixPackageDemandService.completeProductionStage(
    afterPackage,
    operatorUserId,
  )

  return {
    advanced: Boolean(demandWorkflowAdvance?.advanced),
    package: afterPackage,
    demand_workflow_advance: demandWorkflowAdvance,
  }
}

async function autoCompleteProductionStageIfReady({
  packageDetail,
  nodes,
  operatorUserId = null,
} = {}) {
  if (!packageDetail?.id || !areProductionBuildNodesCompleted(nodes)) {
    return {
      advanced: false,
      reason: 'PRODUCTION_BUILD_NODES_NOT_COMPLETED',
    }
  }

  try {
    return await completeMatrixPackageProductionStageCore(packageDetail, operatorUserId)
  } catch (error) {
    console.warn('矩阵包生产阶段自动完成失败（已忽略）:', {
      packageId: packageDetail?.id,
      message: error?.message || error,
    })
    return {
      advanced: false,
      reason: 'AUTO_COMPLETE_PRODUCTION_STAGE_ERROR',
      error_message: error?.message || '生产阶段自动完成异常',
    }
  }
}

async function completeMatrixPackageProduction(req, res) {
  try {
    const beforePackage = await MatrixPackage.getById(req.params.id)
    if (!beforePackage) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    const sideNotes = await MatrixPackageSideNote.listByPackageId(req.params.id)
    const confirmedTypeSet = new Set(
      (Array.isArray(sideNotes) ? sideNotes : [])
        .filter((item) => item?.is_confirmed)
        .map((item) => String(item.note_type || '').trim().toUpperCase()),
    )
    const missingSideCheckTypes = REQUIRED_PRODUCTION_COMPLETE_SIDE_CHECK_TYPES.filter(
      (noteType) => !confirmedTypeSet.has(noteType),
    )
    if (missingSideCheckTypes.length > 0) {
      return res.status(400).json({
        success: false,
        message: '请先完成各侧信息check后再生产完成',
        data: {
          missing_side_check_types: missingSideCheckTypes,
        },
      })
    }

    const completionResult = await completeMatrixPackageProductionStageCore(beforePackage, req.user?.id || null)

    return res.json({
      success: true,
      message: '生产已完成，已进入测试中',
      data: {
        package: completionResult?.package || beforePackage,
        demand_workflow_advance: completionResult?.demand_workflow_advance || null,
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
    let data = await MatrixPackageProductionNode.updateStatus(
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
    const prevOwnerUserId = toPositiveInt(beforeNode?.owner_user_id)
    const nextOwnerUserId = toPositiveInt(afterNode?.owner_user_id)
    if (nextOwnerUserId && nextOwnerUserId !== prevOwnerUserId) {
      await MatrixPackageDemandService.syncProductionGroupMembers(
        packageDetail,
        [nextOwnerUserId],
        req.user?.id || null,
      )
    }
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
    let scheduleSync = null
    if (
      nodeCode === 'FRONTEND_BUILD' &&
      req.body &&
      Object.prototype.hasOwnProperty.call(req.body, 'expected_delivery_date') &&
      afterNode?.expected_delivery_date
    ) {
      scheduleSync = await MatrixPackageScheduleService.syncFromFrontendBuildT({
        packageId: packageDetail.id,
        frontendBuildAt: afterNode.expected_delivery_date,
        operatorUserId: req.user?.id || null,
      })
      data = await MatrixPackageProductionNode.listByPackageId(packageDetail.id)
    }
    const autoProductionCompletion = await autoCompleteProductionStageIfReady({
      packageDetail,
      nodes: data,
      operatorUserId: req.user?.id || null,
    })
    return res.json({
      success: true,
      message: '生产节点已更新',
      data,
      schedule_sync: scheduleSync,
      auto_production_completion: autoProductionCompletion,
    })
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
    const [packageDetail, beforeNotes] = await Promise.all([
      MatrixPackage.getById(req.params.id),
      MatrixPackageSideNote.listByPackageId(req.params.id),
    ])
    if (!packageDetail || !Array.isArray(beforeNotes)) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    const data = await MatrixPackageSideNote.saveBatch(req.params.id, req.body?.notes || [], req.user?.id)
    if (!data) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    const beforeOwnerMap = new Map(
      beforeNotes.map((item) => [String(item?.note_type || '').trim().toUpperCase(), toPositiveInt(item?.owner_user_id)]),
    )
    const ownerUserIds = Array.from(
      new Set(
        (Array.isArray(data) ? data : [])
          .filter((item) => {
            const noteType = String(item?.note_type || '').trim().toUpperCase()
            const nextOwnerUserId = toPositiveInt(item?.owner_user_id)
            return nextOwnerUserId && nextOwnerUserId !== beforeOwnerMap.get(noteType)
          })
          .map((item) => toPositiveInt(item?.owner_user_id))
          .filter(Boolean),
      ),
    )
    if (ownerUserIds.length > 0) {
      await MatrixPackageDemandService.syncProductionGroupMembers(
        packageDetail,
        ownerUserIds,
        req.user?.id || null,
      )
    }
    return res.json({ success: true, message: '补充信息已保存', data: decorateMatrixPackageSideNotes(data) })
  } catch (error) {
    return handleError(res, error, '保存矩阵包补充信息失败')
  }
}

async function patchMatrixPackageSideNoteFields(req, res) {
  try {
    const noteType = normalizeText(req.params.noteType, 50).toUpperCase()
    const [packageDetail, beforeNotes] = await Promise.all([
      MatrixPackage.getById(req.params.id),
      MatrixPackageSideNote.listByPackageId(req.params.id),
    ])
    if (!packageDetail || !Array.isArray(beforeNotes)) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }

    const data = await MatrixPackageSideNote.patchFields(req.params.id, noteType, req.body || {}, req.user?.id)
    if (!data) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }

    const beforeNote = beforeNotes.find((item) => String(item?.note_type || '').trim().toUpperCase() === noteType)
    const afterNote = (Array.isArray(data) ? data : []).find((item) => String(item?.note_type || '').trim().toUpperCase() === noteType)
    const beforeOwnerUserId = toPositiveInt(beforeNote?.owner_user_id)
    const afterOwnerUserId = toPositiveInt(afterNote?.owner_user_id)
    if (afterOwnerUserId && afterOwnerUserId !== beforeOwnerUserId) {
      await MatrixPackageDemandService.syncProductionGroupMembers(
        packageDetail,
        [afterOwnerUserId],
        req.user?.id || null,
      )
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
      dueLabel: '预期完成时间',
      dueValue: note.expected_delivery_date || detail.side_check_deadline_at || '',
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

async function downloadMatrixPackageDataSafetyFile(req, res) {
  try {
    const packageId = Number.parseInt(req.params.id, 10)
    if (!Number.isFinite(packageId) || packageId <= 0) {
      return res.status(400).json({ success: false, message: '矩阵包ID不合法' })
    }

    const result = await generateDataSafetyFile(packageId, {
      dataDeletionUrl: req.query?.data_deletion_url,
    })
    const encodedFileName = encodeURIComponent(result.fileName)
    res.setHeader('Content-Type', result.encoding === 'gb18030' ? 'text/csv; charset=GB18030' : 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFileName}`)
    res.setHeader('Cache-Control', 'no-store')
    return res.send(result.buffer)
  } catch (error) {
    return handleError(res, error, '生成数据安全文件失败')
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
  patchMatrixPackageSideNoteFields,
  confirmMatrixPackageSideNote,
  remindMatrixPackageSideNote,
  getMatrixPackageSideNoteUploadPolicy,
  downloadMatrixPackageDataSafetyFile,
  updateMatrixPackageProductionNode,
}
