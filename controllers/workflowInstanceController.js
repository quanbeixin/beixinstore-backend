const WorkflowInstance = require('../models/WorkflowInstance')
const WorkflowOperationLog = require('../models/WorkflowOperationLog')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeDemandId(value) {
  const id = String(value || '').trim().toUpperCase()
  return id || ''
}

function toScopeProjectId(req) {
  return toPositiveInt(req.businessLineScope?.active_project_id || req.businessLineScope?.project_id)
}

const getWorkflowByDemand = async (req, res) => {
  const demandId = normalizeDemandId(req.params.demandId)
  if (!demandId) return res.status(400).json({ success: false, message: 'demandId 无效' })

  try {
    const data = await WorkflowInstance.getByDemandId(demandId)
    if (!data) return res.status(404).json({ success: false, message: '流程实例不存在' })
    if (Number(data.project_id) !== Number(toScopeProjectId(req))) {
      return res.status(403).json({ success: false, message: '无权限访问该业务线流程实例' })
    }
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取流程实例失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const transitionWorkflow = async (req, res) => {
  const demandId = normalizeDemandId(req.params.demandId)
  const toNodeKey = String(req.body.to_node_key || '').trim().toUpperCase()
  const comment = String(req.body.comment || '').trim()
  if (!demandId || !toNodeKey) {
    return res.status(400).json({ success: false, message: 'demandId 或 to_node_key 无效' })
  }

  try {
    const existing = await WorkflowInstance.getByDemandId(demandId)
    if (!existing) return res.status(404).json({ success: false, message: '流程实例不存在' })
    if (Number(existing.project_id) !== Number(toScopeProjectId(req))) {
      return res.status(403).json({ success: false, message: '无权限流转该业务线流程实例' })
    }

    const data = await WorkflowInstance.transition({
      demandId,
      toNodeKey,
      operatorUserId: req.user?.id || null,
      comment,
    })

    return res.json({ success: true, data, message: '流程流转成功' })
  } catch (err) {
    const code = String(err?.code || '')
    if (
      code === 'WORKFLOW_TARGET_NODE_INVALID' ||
      code === 'WORKFLOW_TARGET_NODE_NOT_FOUND' ||
      code === 'WORKFLOW_CURRENT_NODE_NOT_FOUND' ||
      code === 'WORKFLOW_TARGET_NODE_SAME_AS_CURRENT' ||
      code === 'WORKFLOW_TRANSITION_INVALID_DIRECTION' ||
      code === 'WORKFLOW_RETURN_NOT_ALLOWED' ||
      code === 'WORKFLOW_INSTANCE_NOT_IN_PROGRESS'
    ) {
      return res.status(400).json({ success: false, message: err.message, code })
    }
    console.error('流程流转失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getWorkflowLogs = async (req, res) => {
  const projectId = toScopeProjectId(req)
  if (!projectId) return res.status(400).json({ success: false, message: '当前业务线无效' })

  const demandId = normalizeDemandId(req.query.demand_id)
  const page = Math.max(Number(req.query.page || 1), 1)
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100)

  try {
    const result = await WorkflowOperationLog.list({
      projectId,
      demandId,
      page,
      pageSize,
    })
    return res.json({
      success: true,
      data: {
        list: result.rows,
        total: result.total,
        page,
        pageSize,
      },
    })
  } catch (err) {
    console.error('获取流程日志失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  getWorkflowByDemand,
  transitionWorkflow,
  getWorkflowLogs,
}
