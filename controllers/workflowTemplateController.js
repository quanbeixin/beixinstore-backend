const WorkflowTemplate = require('../models/WorkflowTemplate')
const WorkflowOperationLog = require('../models/WorkflowOperationLog')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function toScopeProjectId(req) {
  return toPositiveInt(req.businessLineScope?.active_project_id || req.businessLineScope?.project_id)
}

const listTemplates = async (req, res) => {
  try {
    const projectId = toScopeProjectId(req)
    if (!projectId) {
      return res.status(400).json({ success: false, message: '当前业务线无效' })
    }
    const list = await WorkflowTemplate.listByProject(projectId)
    return res.json({ success: true, data: list })
  } catch (err) {
    console.error('获取流程模板列表失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getTemplateDetail = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) return res.status(400).json({ success: false, message: '模板ID无效' })

  try {
    const template = await WorkflowTemplate.getById(id)
    if (!template) return res.status(404).json({ success: false, message: '模板不存在' })
    if (Number(template.project_id) !== Number(toScopeProjectId(req))) {
      return res.status(403).json({ success: false, message: '无权限访问该业务线模板' })
    }
    const nodes = await WorkflowTemplate.getNodes(id)
    return res.json({ success: true, data: { ...template, nodes } })
  } catch (err) {
    console.error('获取流程模板详情失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createTemplate = async (req, res) => {
  const projectId = toScopeProjectId(req)
  if (!projectId) return res.status(400).json({ success: false, message: '当前业务线无效' })

  try {
    const id = await WorkflowTemplate.createDraft({
      projectId,
      templateName: req.body.template_name,
      createdBy: req.user?.id || null,
    })

    await WorkflowOperationLog.create({
      projectId,
      operatorUserId: req.user?.id || null,
      entityType: 'TEMPLATE',
      entityId: id,
      action: 'CREATE',
      detail: '创建流程模板草稿',
    })

    return res.status(201).json({ success: true, data: { id } })
  } catch (err) {
    console.error('创建流程模板失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateTemplateNodes = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) return res.status(400).json({ success: false, message: '模板ID无效' })

  try {
    const template = await WorkflowTemplate.getById(id)
    if (!template) return res.status(404).json({ success: false, message: '模板不存在' })
    if (Number(template.project_id) !== Number(toScopeProjectId(req))) {
      return res.status(403).json({ success: false, message: '无权限编辑该业务线模板' })
    }

    const nodes = Array.isArray(req.body.nodes) ? req.body.nodes : []
    if (nodes.length === 0) {
      return res.status(400).json({ success: false, message: '流程节点不能为空' })
    }

    await WorkflowTemplate.replaceNodes(id, nodes)
    await WorkflowOperationLog.create({
      projectId: template.project_id,
      operatorUserId: req.user?.id || null,
      entityType: 'TEMPLATE',
      entityId: id,
      action: 'UPDATE_NODES',
      detail: `更新流程节点，共 ${nodes.length} 个`,
    })
    return res.json({ success: true, message: '更新成功' })
  } catch (err) {
    console.error('更新流程模板节点失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const publishTemplate = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) return res.status(400).json({ success: false, message: '模板ID无效' })

  try {
    const template = await WorkflowTemplate.getById(id)
    if (!template) return res.status(404).json({ success: false, message: '模板不存在' })
    if (Number(template.project_id) !== Number(toScopeProjectId(req))) {
      return res.status(403).json({ success: false, message: '无权限发布该业务线模板' })
    }

    await WorkflowTemplate.updateStatus(id, 'PUBLISHED', req.user?.id || null)
    await WorkflowOperationLog.create({
      projectId: template.project_id,
      operatorUserId: req.user?.id || null,
      entityType: 'TEMPLATE',
      entityId: id,
      action: 'PUBLISH',
      detail: '发布流程模板',
    })
    return res.json({ success: true, message: '发布成功' })
  } catch (err) {
    console.error('发布流程模板失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const setDefaultTemplate = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) return res.status(400).json({ success: false, message: '模板ID无效' })

  try {
    const template = await WorkflowTemplate.getById(id)
    if (!template) return res.status(404).json({ success: false, message: '模板不存在' })
    if (Number(template.project_id) !== Number(toScopeProjectId(req))) {
      return res.status(403).json({ success: false, message: '无权限设置该业务线模板' })
    }

    await WorkflowTemplate.setDefault(id, template.project_id, req.user?.id || null)
    await WorkflowOperationLog.create({
      projectId: template.project_id,
      operatorUserId: req.user?.id || null,
      entityType: 'TEMPLATE',
      entityId: id,
      action: 'SET_DEFAULT',
      detail: '设为默认流程模板',
    })
    return res.json({ success: true, message: '设置成功' })
  } catch (err) {
    console.error('设置默认流程模板失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  listTemplates,
  getTemplateDetail,
  createTemplate,
  updateTemplateNodes,
  publishTemplate,
  setDefaultTemplate,
}
