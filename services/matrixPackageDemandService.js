const pool = require('../utils/db')
const Work = require('../models/Work')
const Workflow = require('../models/Workflow')
const MatrixPackage = require('../models/MatrixPackage')

const TEMPLATE_NAME = '矩阵包生产流程'
const NODE_KEYS = {
  START: 'START',
  PRODUCTION: 'MATRIX_PRODUCTION',
  TEST_ACCEPTANCE: 'TEST_ACCEPTANCE',
}
const PRODUCTION_STATUS_CODES = new Set(['PENDING_DEV', 'IN_DEVELOPMENT', 'COLD_STANDBY'])

function toPositiveInt(value) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function normalizeText(value, maxLength = 255) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
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
        return {
          demand_id: existingLinkedDemandId,
          created: false,
          linked: true,
        }
      }
    }

    const latestMatrixPackage = existingLinkedDemandId
      ? await MatrixPackage.getById(packageId)
      : matrixPackage
    if (!latestMatrixPackage || !shouldEnsureDemand(latestMatrixPackage)) return null

    const latestLinkedDemandId = normalizeText(latestMatrixPackage.linked_demand_id, 64)
    if (latestLinkedDemandId) {
      return {
        demand_id: latestLinkedDemandId,
        created: false,
        linked: true,
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
      return {
        demand_id: existingDemand.id,
        created: false,
        linked: true,
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

    return {
      demand_id: demandId,
      created: true,
      linked: true,
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
}

module.exports = MatrixPackageDemandService
