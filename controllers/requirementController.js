const Requirement = require('../models/Requirement')
const Project = require('../models/Project')
const ProjectActivityLog = require('../models/ProjectActivityLog')
const User = require('../models/User')

const PRIORITY_SET = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
const STATUS_SET = new Set(['TODO', 'IN_PROGRESS', 'DONE'])
const STAGE_SET = new Set(['REQUIREMENT', 'DEVELOPMENT', 'TEST', 'RELEASE'])

const NEXT_STATUS_MAP = {
  TODO: new Set(['IN_PROGRESS']),
  IN_PROGRESS: new Set(['DONE']),
  DONE: new Set(['IN_PROGRESS']),
}

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeText(value, maxLen = 2000) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeEnum(value, allowedSet, fallback) {
  const next = String(value || fallback).trim().toUpperCase()
  return allowedSet.has(next) ? next : fallback
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function normalizeHours(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return NaN
  return Number(num.toFixed(2))
}

function toScopeProjectId(req) {
  return toPositiveInt(req.businessLineScope?.active_project_id || req.businessLineScope?.project_id)
}

function isRequirementAccessible(req, requirement) {
  const scopeProjectId = toScopeProjectId(req)
  if (!scopeProjectId) return true
  return Number(requirement?.project_id) === Number(scopeProjectId)
}

async function validateProjectAndAssignee(projectId, assigneeUserId) {
  const project = await Project.findById(projectId)
  if (!project) {
    return { error: '项目不存在' }
  }
  if (assigneeUserId) {
    const user = await User.findById(assigneeUserId)
    if (!user) {
      return { error: '负责人不存在' }
    }
  }
  return { project }
}

const listRequirements = async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1)
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 10), 1), 100)
  const keyword = normalizeText(req.query.keyword, 100)
  const projectId = toPositiveInt(req.query.project_id)
  const assigneeUserId = toPositiveInt(req.query.assignee_user_id)
  const status = req.query.status ? normalizeEnum(req.query.status, STATUS_SET, 'TODO') : ''
  const priority = req.query.priority ? normalizeEnum(req.query.priority, PRIORITY_SET, 'MEDIUM') : ''
  const stage = req.query.stage ? normalizeEnum(req.query.stage, STAGE_SET, 'REQUIREMENT') : ''

  try {
    const result = await Requirement.findAll({
      page,
      pageSize,
      keyword,
      projectId,
      status,
      priority,
      assigneeUserId,
      stage,
      accessProjectId: toScopeProjectId(req),
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
    console.error('获取需求列表失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getRequirementById = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) {
    return res.status(400).json({ success: false, message: '需求ID无效' })
  }

  try {
    const requirement = await Requirement.findById(id)
    if (!requirement) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }
    if (!isRequirementAccessible(req, requirement)) {
      return res.status(403).json({ success: false, message: '无权限访问该业务线需求' })
    }
    return res.json({ success: true, data: requirement })
  } catch (err) {
    console.error('获取需求详情失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createRequirement = async (req, res) => {
  const projectId = toPositiveInt(req.body.project_id)
  const title = normalizeText(req.body.title, 200)
  const description = normalizeText(req.body.description, 5000)
  const priority = normalizeEnum(req.body.priority, PRIORITY_SET, 'MEDIUM')
  const status = normalizeEnum(req.body.status, STATUS_SET, 'TODO')
  const stage = normalizeEnum(req.body.stage, STAGE_SET, 'REQUIREMENT')
  const assigneeUserId =
    req.body.assignee_user_id === undefined || req.body.assignee_user_id === null || req.body.assignee_user_id === ''
      ? null
      : toPositiveInt(req.body.assignee_user_id)
  const estimatedHours = normalizeHours(req.body.estimated_hours, 0)
  const actualHours = normalizeHours(req.body.actual_hours, 0)
  const startDate = normalizeDate(req.body.start_date)
  const dueDate = normalizeDate(req.body.due_date)

  if (!projectId) return res.status(400).json({ success: false, message: 'project_id 无效' })
  if (!title) return res.status(400).json({ success: false, message: '需求标题不能为空' })
  if (req.body.assignee_user_id !== undefined && req.body.assignee_user_id !== null && req.body.assignee_user_id !== '' && !assigneeUserId) {
    return res.status(400).json({ success: false, message: 'assignee_user_id 无效' })
  }
  if (Number.isNaN(estimatedHours) || Number.isNaN(actualHours)) {
    return res.status(400).json({ success: false, message: '工时必须是大于等于 0 的数字' })
  }
  if (startDate === '' || dueDate === '') {
    return res.status(400).json({ success: false, message: '日期格式错误，需为 YYYY-MM-DD' })
  }
  if (startDate && dueDate && startDate > dueDate) {
    return res.status(400).json({ success: false, message: '开始日期不能晚于截止日期' })
  }

  try {
    const scopeProjectId = toScopeProjectId(req)
    if (scopeProjectId && Number(scopeProjectId) !== Number(projectId)) {
      return res.status(403).json({ success: false, message: '无权限在其他业务线创建需求' })
    }
    const { error, project } = await validateProjectAndAssignee(projectId, assigneeUserId)
    if (error) return res.status(400).json({ success: false, message: error })

    const id = await Requirement.create({
      project_id: projectId,
      title,
      description,
      priority,
      status,
      stage,
      assignee_user_id: assigneeUserId,
      estimated_hours: estimatedHours,
      actual_hours: actualHours,
      start_date: startDate,
      due_date: dueDate,
      created_by: req.user.id,
      updated_by: req.user.id,
    })

    await ProjectActivityLog.create({
      project_id: projectId,
      requirement_id: id,
      entity_type: 'REQUIREMENT',
      entity_id: id,
      action: 'CREATE',
      action_detail: `创建需求：${title}`,
      operator_user_id: req.user.id,
    })

    const created = await Requirement.findById(id)
    return res.status(201).json({ success: true, message: '创建成功', data: created })
  } catch (err) {
    console.error('创建需求失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateRequirement = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) return res.status(400).json({ success: false, message: '需求ID无效' })

  const projectId = toPositiveInt(req.body.project_id)
  const title = normalizeText(req.body.title, 200)
  const description = normalizeText(req.body.description, 5000)
  const priority = normalizeEnum(req.body.priority, PRIORITY_SET, 'MEDIUM')
  const status = normalizeEnum(req.body.status, STATUS_SET, 'TODO')
  const stage = normalizeEnum(req.body.stage, STAGE_SET, 'REQUIREMENT')
  const assigneeUserId =
    req.body.assignee_user_id === undefined || req.body.assignee_user_id === null || req.body.assignee_user_id === ''
      ? null
      : toPositiveInt(req.body.assignee_user_id)
  const estimatedHours = normalizeHours(req.body.estimated_hours, 0)
  const actualHours = normalizeHours(req.body.actual_hours, 0)
  const startDate = normalizeDate(req.body.start_date)
  const dueDate = normalizeDate(req.body.due_date)

  if (!projectId) return res.status(400).json({ success: false, message: 'project_id 无效' })
  if (!title) return res.status(400).json({ success: false, message: '需求标题不能为空' })
  if (req.body.assignee_user_id !== undefined && req.body.assignee_user_id !== null && req.body.assignee_user_id !== '' && !assigneeUserId) {
    return res.status(400).json({ success: false, message: 'assignee_user_id 无效' })
  }
  if (Number.isNaN(estimatedHours) || Number.isNaN(actualHours)) {
    return res.status(400).json({ success: false, message: '工时必须是大于等于 0 的数字' })
  }
  if (startDate === '' || dueDate === '') {
    return res.status(400).json({ success: false, message: '日期格式错误，需为 YYYY-MM-DD' })
  }
  if (startDate && dueDate && startDate > dueDate) {
    return res.status(400).json({ success: false, message: '开始日期不能晚于截止日期' })
  }

  try {
    const existing = await Requirement.findById(id)
    if (!existing) return res.status(404).json({ success: false, message: '需求不存在' })
    if (!isRequirementAccessible(req, existing)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线需求' })
    }
    const scopeProjectId = toScopeProjectId(req)
    if (scopeProjectId && Number(scopeProjectId) !== Number(projectId)) {
      return res.status(403).json({ success: false, message: '无权限将需求转移到其他业务线' })
    }

    const { error } = await validateProjectAndAssignee(projectId, assigneeUserId)
    if (error) return res.status(400).json({ success: false, message: error })

    await Requirement.update(id, {
      project_id: projectId,
      title,
      description,
      priority,
      status,
      stage,
      assignee_user_id: assigneeUserId,
      estimated_hours: estimatedHours,
      actual_hours: actualHours,
      start_date: startDate,
      due_date: dueDate,
      updated_by: req.user.id,
    })

    await ProjectActivityLog.create({
      project_id: projectId,
      requirement_id: id,
      entity_type: 'REQUIREMENT',
      entity_id: id,
      action: 'UPDATE',
      action_detail: `更新需求：${title}`,
      operator_user_id: req.user.id,
    })

    const updated = await Requirement.findById(id)
    return res.json({ success: true, message: '更新成功', data: updated })
  } catch (err) {
    console.error('更新需求失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteRequirement = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) return res.status(400).json({ success: false, message: '需求ID无效' })

  try {
    const existing = await Requirement.findById(id)
    if (!existing) return res.status(404).json({ success: false, message: '需求不存在' })
    if (!isRequirementAccessible(req, existing)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线需求' })
    }

    await Requirement.softDelete(id, req.user.id)
    await ProjectActivityLog.create({
      project_id: existing.project_id,
      requirement_id: id,
      entity_type: 'REQUIREMENT',
      entity_id: id,
      action: 'DELETE',
      action_detail: `删除需求：${existing.title}`,
      operator_user_id: req.user.id,
    })

    return res.json({ success: true, message: '删除成功' })
  } catch (err) {
    console.error('删除需求失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateRequirementStatus = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  const nextStatus = normalizeEnum(req.body.status, STATUS_SET, '')
  if (!id || !nextStatus) return res.status(400).json({ success: false, message: '参数无效' })

  try {
    const requirement = await Requirement.findById(id)
    if (!requirement) return res.status(404).json({ success: false, message: '需求不存在' })
    if (!isRequirementAccessible(req, requirement)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线需求' })
    }

    const currentStatus = String(requirement.status || '').toUpperCase()
    const allowed = NEXT_STATUS_MAP[currentStatus]
    if (!allowed || !allowed.has(nextStatus)) {
      return res.status(400).json({ success: false, message: '当前状态不允许流转到目标状态' })
    }

    await Requirement.updateStatus(id, nextStatus, req.user.id)
    await ProjectActivityLog.create({
      project_id: requirement.project_id,
      requirement_id: id,
      entity_type: 'REQUIREMENT',
      entity_id: id,
      action: 'STATUS_CHANGE',
      action_detail: `需求状态从 ${currentStatus} 更新为 ${nextStatus}`,
      operator_user_id: req.user.id,
    })

    const updated = await Requirement.findById(id)
    return res.json({ success: true, message: '状态更新成功', data: updated })
  } catch (err) {
    console.error('更新需求状态失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateRequirementStage = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  const stage = normalizeEnum(req.body.stage, STAGE_SET, '')
  if (!id || !stage) return res.status(400).json({ success: false, message: '参数无效' })

  try {
    const requirement = await Requirement.findById(id)
    if (!requirement) return res.status(404).json({ success: false, message: '需求不存在' })
    if (!isRequirementAccessible(req, requirement)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线需求' })
    }

    await Requirement.updateStage(id, stage, req.user.id)
    await ProjectActivityLog.create({
      project_id: requirement.project_id,
      requirement_id: id,
      entity_type: 'REQUIREMENT',
      entity_id: id,
      action: 'STAGE_CHANGE',
      action_detail: `需求阶段更新为 ${stage}`,
      operator_user_id: req.user.id,
    })

    const updated = await Requirement.findById(id)
    return res.json({ success: true, message: '阶段更新成功', data: updated })
  } catch (err) {
    console.error('更新需求阶段失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateRequirementAssignee = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  const assigneeUserId =
    req.body.assignee_user_id === undefined || req.body.assignee_user_id === null || req.body.assignee_user_id === ''
      ? null
      : toPositiveInt(req.body.assignee_user_id)

  if (!id) return res.status(400).json({ success: false, message: '需求ID无效' })
  if (req.body.assignee_user_id !== undefined && req.body.assignee_user_id !== null && req.body.assignee_user_id !== '' && !assigneeUserId) {
    return res.status(400).json({ success: false, message: 'assignee_user_id 无效' })
  }

  try {
    const requirement = await Requirement.findById(id)
    if (!requirement) return res.status(404).json({ success: false, message: '需求不存在' })
    if (!isRequirementAccessible(req, requirement)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线需求' })
    }
    if (assigneeUserId) {
      const user = await User.findById(assigneeUserId)
      if (!user) return res.status(400).json({ success: false, message: '负责人不存在' })
    }

    await Requirement.updateAssignee(id, assigneeUserId, req.user.id)
    await ProjectActivityLog.create({
      project_id: requirement.project_id,
      requirement_id: id,
      entity_type: 'REQUIREMENT',
      entity_id: id,
      action: 'ASSIGN',
      action_detail: assigneeUserId ? `指派负责人为用户 ${assigneeUserId}` : '清空需求负责人',
      operator_user_id: req.user.id,
    })

    const updated = await Requirement.findById(id)
    return res.json({ success: true, message: '负责人更新成功', data: updated })
  } catch (err) {
    console.error('更新需求负责人失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateRequirementHours = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  const estimatedHours = normalizeHours(req.body.estimated_hours, 0)
  const actualHours = normalizeHours(req.body.actual_hours, 0)

  if (!id) return res.status(400).json({ success: false, message: '需求ID无效' })
  if (Number.isNaN(estimatedHours) || Number.isNaN(actualHours)) {
    return res.status(400).json({ success: false, message: '工时必须是大于等于 0 的数字' })
  }

  try {
    const requirement = await Requirement.findById(id)
    if (!requirement) return res.status(404).json({ success: false, message: '需求不存在' })
    if (!isRequirementAccessible(req, requirement)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线需求' })
    }

    await Requirement.updateHours(id, estimatedHours, actualHours, req.user.id)
    await ProjectActivityLog.create({
      project_id: requirement.project_id,
      requirement_id: id,
      entity_type: 'REQUIREMENT',
      entity_id: id,
      action: 'HOURS_UPDATE',
      action_detail: `更新工时：预计 ${estimatedHours} 小时，实际 ${actualHours} 小时`,
      operator_user_id: req.user.id,
    })

    const updated = await Requirement.findById(id)
    return res.json({ success: true, message: '工时更新成功', data: updated })
  } catch (err) {
    console.error('更新需求工时失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  listRequirements,
  getRequirementById,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  updateRequirementStatus,
  updateRequirementStage,
  updateRequirementAssignee,
  updateRequirementHours,
}
