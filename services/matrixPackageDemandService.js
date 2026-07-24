const pool = require('../utils/db')
const Work = require('../models/Work')
const Workflow = require('../models/Workflow')
const MatrixPackage = require('../models/MatrixPackage')
const FeishuUserBinding = require('../models/FeishuUserBinding')
const { addFeishuChatMembers, createFeishuDemandChat } = require('../utils/notificationSender')

const TEMPLATE_NAME = '矩阵包生产流程'
const NODE_KEYS = {
  START: 'START',
  PRODUCTION: 'MATRIX_PRODUCTION',
  TEST_ACCEPTANCE: 'TEST_ACCEPTANCE',
}
const PRODUCTION_STATUS_CODES = new Set(['IN_DEVELOPMENT', 'TESTING', 'COLD_STANDBY'])

function toPositiveInt(value) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function normalizeText(value, maxLength = 255) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function normalizeGroupChatConfig(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaultMemberUserIds = Array.from(
    new Set(
      (Array.isArray(source.default_member_user_ids) ? source.default_member_user_ids : [])
        .map((item) => toPositiveInt(item))
        .filter(Boolean),
    ),
  )
  return {
    auto_group_chat_enabled: source.auto_group_chat_enabled === false ? false : true,
    include_owner: source.include_owner === false ? false : true,
    default_member_user_ids: defaultMemberUserIds,
  }
}

function parseGroupChatConfig(raw) {
  if (!raw) return normalizeGroupChatConfig()
  if (typeof raw === 'object' && !Array.isArray(raw)) return normalizeGroupChatConfig(raw)
  if (typeof raw !== 'string') return normalizeGroupChatConfig()
  try {
    return normalizeGroupChatConfig(JSON.parse(raw))
  } catch {
    return normalizeGroupChatConfig()
  }
}

function shouldEnsureDemand(matrixPackage) {
  const statusCode = normalizeText(matrixPackage?.status_code, 50).toUpperCase()
  return PRODUCTION_STATUS_CODES.has(statusCode)
}

async function findTemplate() {
  const [rows] = await pool.query(
    `SELECT id, name
     FROM project_templates
     WHERE name = ? AND status = 1
     ORDER BY id DESC
     LIMIT 1`,
    [TEMPLATE_NAME],
  )
  return rows[0] || null
}

async function findExistingDemandForPackage(packageId, templateId) {
  const marker = `矩阵包记录ID：${packageId}`
  const [rows] = await pool.query(
    `SELECT id, name
     FROM work_demands
     WHERE template_id = ?
       AND description LIKE ?
       AND status <> 'CANCELLED'
     ORDER BY created_at DESC
     LIMIT 1`,
    [templateId, `%${marker}%`],
  )
  return rows[0] || null
}

async function linkPackageDemand(packageId, demandId) {
  await pool.query(
    `UPDATE matrix_packages
     SET linked_demand_id = ?, updated_at = NOW()
     WHERE id = ? AND deleted_at IS NULL`,
    [demandId, packageId],
  )
}

async function resolveUserFeishuOpenId(userId) {
  const normalizedUserId = toPositiveInt(userId)
  if (!normalizedUserId) return ''

  try {
    const binding = await FeishuUserBinding.getByUserId(normalizedUserId)
    return normalizeText(binding?.open_id, 128)
  } catch {
    return ''
  }
}

async function resolveUserFeishuOpenIds(userIds = []) {
  const normalizedUserIds = Array.from(
    new Set((Array.isArray(userIds) ? userIds : []).map((item) => toPositiveInt(item)).filter(Boolean)),
  )
  if (normalizedUserIds.length === 0) return []

  try {
    const result = await FeishuUserBinding.listByUserIds(normalizedUserIds)
    return normalizedUserIds
      .map((userId) => normalizeText(result?.map?.[userId]?.open_id, 128))
      .filter(Boolean)
  } catch {
    return []
  }
}

async function resolveDemandGroupChat(demandId) {
  const normalizedDemandId = normalizeText(demandId, 64)
  if (!normalizedDemandId) return null

  const [rows] = await pool.query(
    `SELECT
       d.id,
       d.name,
       d.owner_user_id,
       d.group_chat_mode,
       d.group_chat_id,
       d.template_id,
       pt.group_chat_config AS template_group_chat_config
     FROM work_demands d
     LEFT JOIN project_templates pt
       ON pt.id = d.template_id
     WHERE d.id = ?
     LIMIT 1`,
    [normalizedDemandId],
  )
  return rows[0] || null
}

async function ensureDemandAutoGroupChat(demandId, ownerUserId) {
  const demand = await resolveDemandGroupChat(demandId)
  if (!demand) {
    return {
      created: false,
      reason: 'DEMAND_NOT_FOUND',
    }
  }

  const existingChatId = normalizeText(demand.group_chat_id, 128)
  if (existingChatId) {
    return {
      created: false,
      chat_id: existingChatId,
      mode: normalizeText(demand.group_chat_mode, 20) || 'none',
      reason: 'CHAT_ALREADY_EXISTS',
    }
  }

  const groupChatMode = normalizeText(demand.group_chat_mode, 20).toLowerCase()
  if (groupChatMode === 'bind') {
    return {
      created: false,
      mode: groupChatMode,
      reason: 'BIND_CHAT_ID_EMPTY',
    }
  }

  const templateGroupChatConfig = parseGroupChatConfig(demand.template_group_chat_config)
  if (!templateGroupChatConfig.auto_group_chat_enabled) {
    return {
      created: false,
      mode: groupChatMode || 'auto',
      reason: 'AUTO_GROUP_CHAT_DISABLED_BY_TEMPLATE',
    }
  }

  const finalOwnerUserId = toPositiveInt(ownerUserId) || toPositiveInt(demand.owner_user_id)
  const configuredMemberUserIds = templateGroupChatConfig.default_member_user_ids || []
  const memberUserIds = [
    ...(templateGroupChatConfig.include_owner ? [finalOwnerUserId] : []),
    ...configuredMemberUserIds,
  ].filter(Boolean)
  const memberOpenIds = await resolveUserFeishuOpenIds(memberUserIds)
  const ownerOpenId = memberOpenIds[0] || (
    templateGroupChatConfig.include_owner ? await resolveUserFeishuOpenId(finalOwnerUserId) : ''
  )
  if (!ownerOpenId || memberOpenIds.length === 0) {
    return {
      created: false,
      mode: groupChatMode || 'auto',
      reason: 'GROUP_CHAT_MEMBER_FEISHU_OPEN_ID_MISSING',
    }
  }
  const finalMemberOpenIds = Array.from(new Set(memberOpenIds.filter(Boolean)))

  const chatResult = await createFeishuDemandChat({
    demandId: demand.id,
    demandName: demand.name,
    ownerOpenId,
    memberOpenIds: finalMemberOpenIds,
  })
  if (!chatResult?.success || !chatResult?.data?.chat_id) {
    return {
      created: false,
      mode: groupChatMode || 'auto',
      reason: chatResult?.error_code || 'FEISHU_CHAT_CREATE_FAILED',
      error_message: chatResult?.error_message || '自动拉群失败',
    }
  }

  await Work.updateDemandGroupChatBinding(demand.id, {
    groupChatMode: 'auto',
    groupChatId: chatResult.data.chat_id,
  })

  return {
    created: true,
    mode: 'auto',
    chat_id: chatResult.data.chat_id,
    chat_name: chatResult.data.name || null,
  }
}

async function ensureDemandAutoGroupChatQuietly(demandId, ownerUserId) {
  try {
    return await ensureDemandAutoGroupChat(demandId, ownerUserId)
  } catch (error) {
    console.warn('矩阵包需求自动拉群失败（已忽略）:', {
      demandId: normalizeText(demandId, 64),
      message: error?.message || error,
    })
    return {
      created: false,
      reason: 'AUTO_GROUP_CHAT_ERROR',
      error_message: error?.message || '自动拉群异常',
    }
  }
}

async function addDemandGroupChatMembersQuietly(demandId, userIds = []) {
  const demand = await resolveDemandGroupChat(demandId)
  if (!demand) {
    return {
      success: false,
      skipped: true,
      reason: 'DEMAND_NOT_FOUND',
    }
  }

  const chatId = normalizeText(demand.group_chat_id, 128)
  const groupChatMode = normalizeText(demand.group_chat_mode, 20).toLowerCase()
  if ((groupChatMode !== 'auto' && groupChatMode !== 'bind') || !chatId) {
    return {
      success: false,
      skipped: true,
      reason: 'DEMAND_GROUP_CHAT_NOT_FOUND',
    }
  }

  const memberOpenIds = await resolveUserFeishuOpenIds(userIds)
  if (memberOpenIds.length === 0) {
    return {
      success: false,
      skipped: true,
      chat_id: chatId,
      reason: 'GROUP_CHAT_MEMBER_FEISHU_OPEN_ID_MISSING',
    }
  }

  try {
    const result = await addFeishuChatMembers({
      chatId,
      memberOpenIds,
    })
    return {
      ...result,
      chat_id: chatId,
    }
  } catch (error) {
    console.warn('矩阵包生产群补充成员失败（已忽略）:', {
      demandId: normalizeText(demandId, 64),
      chatId,
      message: error?.message || error,
    })
    return {
      success: false,
      skipped: true,
      chat_id: chatId,
      reason: 'ADD_GROUP_CHAT_MEMBERS_ERROR',
      error_message: error?.message || '补充群成员异常',
    }
  }
}

async function unlinkPackageDemand(packageId, demandId) {
  await pool.query(
    `UPDATE matrix_packages
     SET linked_demand_id = NULL, updated_at = NOW()
     WHERE id = ?
       AND deleted_at IS NULL
       AND linked_demand_id = ?`,
    [packageId, demandId],
  )
}

async function advanceStartNodeIfNeeded(demandId, packageId, operatorUserId) {
  const workflow = await Workflow.getDemandWorkflowByDemandId(demandId, { includeActionsLimit: 0 })
  const currentNodeKey = normalizeText(workflow?.current_node?.node_key, 64).toUpperCase()
  if (currentNodeKey !== NODE_KEYS.START) {
    return {
      advanced: false,
      current_node_key: currentNodeKey || null,
    }
  }

  const nextWorkflow = await Workflow.submitNode({
    demandId,
    nodeKey: NODE_KEYS.START,
    operatorUserId,
    comment: '矩阵包进入生产流水线，自动推进到生产阶段',
    sourceType: 'SYSTEM',
    sourceId: String(packageId),
    skipAssigneeCheck: true,
  })

  return {
    advanced: true,
    current_node_key: normalizeText(nextWorkflow?.current_node?.node_key, 64).toUpperCase() || null,
  }
}

function buildDemandDescription(matrixPackage) {
  return [
    '由矩阵包生产流水线自动创建。',
    `矩阵包记录ID：${matrixPackage.id}`,
    `矩阵包名：${matrixPackage.package_name || '-'}`,
    `包ID（应用ID）：${matrixPackage.app_id || '-'}`,
    `域名信息：${matrixPackage.domain_info || '-'}`,
  ].join('\n')
}

const MatrixPackageDemandService = {
  TEMPLATE_NAME,
  NODE_KEYS,
  PRODUCTION_STATUS_CODES: Array.from(PRODUCTION_STATUS_CODES),

  shouldEnsureDemand,

  async ensureProductionDemand(matrixPackageInput, operatorUserId = null) {
    const packageId = toPositiveInt(matrixPackageInput?.id)
    if (!packageId) return null

    const matrixPackage = matrixPackageInput?.package_name
      ? matrixPackageInput
      : await MatrixPackage.getById(packageId)
    if (!matrixPackage || !shouldEnsureDemand(matrixPackage)) return null

    const existingLinkedDemandId = normalizeText(matrixPackage.linked_demand_id, 64)
    if (existingLinkedDemandId) {
      const linkedDemand = await Work.findDemandById(existingLinkedDemandId)
      if (!linkedDemand) {
        await unlinkPackageDemand(packageId, existingLinkedDemandId)
      } else {
        const groupChat = await ensureDemandAutoGroupChatQuietly(
          existingLinkedDemandId,
          linkedDemand.owner_user_id || matrixPackage.owner_user_id,
        )
        return {
          demand_id: existingLinkedDemandId,
          created: false,
          linked: true,
          group_chat: groupChat,
        }
      }
    }

    const latestMatrixPackage = existingLinkedDemandId
      ? await MatrixPackage.getById(packageId)
      : matrixPackage
    if (!latestMatrixPackage || !shouldEnsureDemand(latestMatrixPackage)) return null

    const latestLinkedDemandId = normalizeText(latestMatrixPackage.linked_demand_id, 64)
    if (latestLinkedDemandId) {
      const groupChat = await ensureDemandAutoGroupChatQuietly(
        latestLinkedDemandId,
        latestMatrixPackage.owner_user_id || operatorUserId,
      )
      return {
        demand_id: latestLinkedDemandId,
        created: false,
        linked: true,
        group_chat: groupChat,
      }
    }

    const template = await findTemplate()
    if (!template?.id) {
      const err = new Error('matrix_package_production_template_missing')
      err.statusCode = 500
      err.message = '矩阵包生产流程模板不存在，请先执行矩阵包生产流程模板迁移'
      throw err
    }

    const existingDemand = await findExistingDemandForPackage(packageId, template.id)
    if (existingDemand?.id) {
      await linkPackageDemand(packageId, existingDemand.id)
      const groupChat = await ensureDemandAutoGroupChatQuietly(
        existingDemand.id,
        latestMatrixPackage.owner_user_id || operatorUserId,
      )
      return {
        demand_id: existingDemand.id,
        created: false,
        linked: true,
        group_chat: groupChat,
      }
    }

    const ownerUserId =
      toPositiveInt(latestMatrixPackage.owner_user_id) ||
      toPositiveInt(operatorUserId) ||
      toPositiveInt(latestMatrixPackage.updated_by) ||
      toPositiveInt(latestMatrixPackage.created_by) ||
      null
    if (!ownerUserId) {
      const err = new Error('matrix_package_demand_owner_missing')
      err.statusCode = 400
      err.message = '矩阵包缺少负责人，无法自动创建项目管理需求'
      throw err
    }
    const participantRoles = ['DEMAND_OWNER']
    const participantRoleUserMap = ownerUserId ? { DEMAND_OWNER: [ownerUserId] } : {}
    const demandId = await Work.createDemand({
      name: `【矩阵包生产】${normalizeText(latestMatrixPackage.package_name, 100) || packageId}`,
      ownerUserId,
      managementMode: 'advanced',
      templateId: template.id,
      participantRoles,
      participantRoleUserMap,
      projectManager: ownerUserId,
      healthStatus: 'green',
      status: 'TODO',
      priority: 'P2',
      description: buildDemandDescription(latestMatrixPackage),
      createdBy: toPositiveInt(operatorUserId) || ownerUserId,
    })

    await Workflow.initDemandWorkflow({
      demandId,
      ownerUserId,
      operatorUserId: toPositiveInt(operatorUserId) || ownerUserId,
      autoAssignCurrentNode: Boolean(ownerUserId),
    })

    await advanceStartNodeIfNeeded(
      demandId,
      packageId,
      toPositiveInt(operatorUserId) || ownerUserId,
    )

    await linkPackageDemand(packageId, demandId)
    const groupChat = await ensureDemandAutoGroupChatQuietly(demandId, ownerUserId)

    return {
      demand_id: demandId,
      created: true,
      linked: true,
      group_chat: groupChat,
    }
  },

  async completeProductionStage(matrixPackageInput, operatorUserId = null) {
    const packageId = toPositiveInt(matrixPackageInput?.id)
    if (!packageId) return null

    const ensureResult = await this.ensureProductionDemand(matrixPackageInput, operatorUserId)
    const demandId = normalizeText(
      ensureResult?.demand_id || matrixPackageInput?.linked_demand_id,
      64,
    )
    if (!demandId) {
      return {
        advanced: false,
        reason: 'NO_LINKED_DEMAND',
      }
    }

    const workflow = await Workflow.getDemandWorkflowByDemandId(demandId, { includeActionsLimit: 0 })
    const currentNodeKey = normalizeText(workflow?.current_node?.node_key, 64).toUpperCase()
    if (currentNodeKey !== NODE_KEYS.PRODUCTION) {
      return {
        demand_id: demandId,
        advanced: false,
        current_node_key: currentNodeKey || null,
        reason: 'CURRENT_NODE_NOT_PRODUCTION',
      }
    }

    const nextWorkflow = await Workflow.submitNode({
      demandId,
      nodeKey: NODE_KEYS.PRODUCTION,
      operatorUserId: toPositiveInt(operatorUserId) || toPositiveInt(matrixPackageInput?.owner_user_id) || null,
      comment: '矩阵包生产完成，自动进入测试验收阶段',
      sourceType: 'SYSTEM',
      sourceId: String(packageId),
      skipAssigneeCheck: true,
    })

    return {
      demand_id: demandId,
      advanced: true,
      from_node_key: NODE_KEYS.PRODUCTION,
      current_node_key: normalizeText(nextWorkflow?.current_node?.node_key, 64).toUpperCase() || null,
    }
  },

  async syncProductionGroupMembers(matrixPackageInput, userIds = [], operatorUserId = null) {
    try {
      const packageId = toPositiveInt(matrixPackageInput?.id)
      const normalizedUserIds = Array.from(
        new Set((Array.isArray(userIds) ? userIds : []).map((item) => toPositiveInt(item)).filter(Boolean)),
      )
      if (!packageId || normalizedUserIds.length === 0) {
        return {
          success: false,
          skipped: true,
          reason: 'EMPTY_MEMBER_USER_IDS',
        }
      }

      const matrixPackage = matrixPackageInput?.package_name
        ? matrixPackageInput
        : await MatrixPackage.getById(packageId)
      if (!matrixPackage || !shouldEnsureDemand(matrixPackage)) {
        return {
          success: false,
          skipped: true,
          reason: 'PACKAGE_NOT_IN_PRODUCTION_FLOW',
        }
      }

      const ensureResult = await this.ensureProductionDemand(matrixPackage, operatorUserId)
      const demandId = normalizeText(ensureResult?.demand_id || matrixPackage.linked_demand_id, 64)
      if (!demandId) {
        return {
          success: false,
          skipped: true,
          reason: 'NO_LINKED_DEMAND',
        }
      }

      return addDemandGroupChatMembersQuietly(demandId, normalizedUserIds)
    } catch (error) {
      console.warn('矩阵包生产群成员同步失败（已忽略）:', {
        packageId: toPositiveInt(matrixPackageInput?.id) || null,
        message: error?.message || error,
      })
      return {
        success: false,
        skipped: true,
        reason: 'SYNC_PRODUCTION_GROUP_MEMBERS_ERROR',
        error_message: error?.message || '生产群成员同步异常',
      }
    }
  },
}

module.exports = MatrixPackageDemandService
