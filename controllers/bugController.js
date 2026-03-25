const Bug = require('../models/Bug')
const Project = require('../models/Project')
const Requirement = require('../models/Requirement')
const Work = require('../models/Work')
const ProjectActivityLog = require('../models/ProjectActivityLog')
const User = require('../models/User')

const SEVERITY_SET = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
const STATUS_SET = new Set(['OPEN', 'FIXING', 'VERIFIED', 'CLOSED'])
const STAGE_SET = new Set(['DEVELOPMENT', 'TEST', 'RELEASE'])

const NEXT_STATUS_MAP = {
  OPEN: new Set(['FIXING']),
  FIXING: new Set(['VERIFIED']),
  VERIFIED: new Set(['CLOSED', 'FIXING']),
  CLOSED: new Set([]),
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

function normalizeDemandId(value) {
  const demandId = String(value || '').trim().toUpperCase()
  if (!demandId) return null
  return /^[A-Z][A-Z0-9_]{1,63}$/.test(demandId) ? demandId : ''
}

function normalizeBugCode(value) {
  const bugCode = String(value || '').trim().toUpperCase()
  if (!bugCode) return null
  return /^BUG\d{3,}$/.test(bugCode) ? bugCode : ''
}

function toScopeProjectId(req) {
  return toPositiveInt(req.businessLineScope?.active_project_id || req.businessLineScope?.project_id)
}

function isBugAccessible(req, bug) {
  const scopeProjectId = toScopeProjectId(req)
  if (!scopeProjectId) return true
  return Number(bug?.project_id) === Number(scopeProjectId)
}

async function validateReferences({ projectId, requirementId, demandId, assigneeUserId }) {
  const project = await Project.findById(projectId)
  if (!project) {
    return { error: '项目不存在' }
  }

  let requirement = null
  if (requirementId) {
    requirement = await Requirement.findById(requirementId)
    if (!requirement) {
      return { error: '关联需求不存在（旧需求模块）' }
    }
    if (Number(requirement.project_id) !== Number(projectId)) {
      return { error: '关联需求不属于当前业务线' }
    }
  }

  let demand = null
  if (demandId) {
    demand = await Work.findDemandById(demandId)
    if (!demand) {
      return { error: '关联需求池条目不存在' }
    }
  }

  if (assigneeUserId) {
    const user = await User.findById(assigneeUserId)
    if (!user) {
      return { error: '指派开发人员不存在' }
    }
  }

  return { project, requirement, demand }
}

const listBugs = async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1)
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 10), 1), 100)
  const keyword = normalizeText(req.query.keyword, 100)
  const bugCode = normalizeBugCode(req.query.bug_code)
  const projectId = toPositiveInt(req.query.project_id)
  const requirementId = toPositiveInt(req.query.requirement_id)
  const demandId = normalizeDemandId(req.query.demand_id)
  const assigneeUserId = toPositiveInt(req.query.assignee_user_id)
  const status = req.query.status ? normalizeEnum(req.query.status, STATUS_SET, 'OPEN') : ''
  const severity = req.query.severity ? normalizeEnum(req.query.severity, SEVERITY_SET, 'MEDIUM') : ''
  const stage = req.query.stage ? normalizeEnum(req.query.stage, STAGE_SET, 'DEVELOPMENT') : ''

  if (req.query.bug_code !== undefined && req.query.bug_code !== '' && bugCode === '') {
    return res.status(400).json({ success: false, message: 'bug_code 格式无效，示例：BUG001' })
  }

  if (req.query.demand_id !== undefined && req.query.demand_id !== '' && demandId === '') {
    return res.status(400).json({ success: false, message: 'demand_id 格式无效' })
  }

  try {
    const result = await Bug.findAll({
      page,
      pageSize,
      keyword,
      bugCode: bugCode || '',
      projectId,
      requirementId,
      demandId: demandId || '',
      status,
      severity,
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
    console.error('获取 Bug 列表失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getBugById = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) {
    return res.status(400).json({ success: false, message: 'Bug ID 无效' })
  }

  try {
    const bug = await Bug.findById(id)
    if (!bug) {
      return res.status(404).json({ success: false, message: 'Bug 不存在' })
    }
    if (!isBugAccessible(req, bug)) {
      return res.status(403).json({ success: false, message: '无权限访问该业务线 Bug' })
    }
    return res.json({ success: true, data: bug })
  } catch (err) {
    console.error('获取 Bug 详情失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createBug = async (req, res) => {
  const bugCodeRaw = req.body.bug_code
  const bugCode = normalizeBugCode(bugCodeRaw)
  const projectId = toPositiveInt(req.body.project_id)
  const requirementId =
    req.body.requirement_id === undefined || req.body.requirement_id === null || req.body.requirement_id === ''
      ? null
      : toPositiveInt(req.body.requirement_id)
  const demandIdRaw =
    req.body.demand_id === undefined || req.body.demand_id === null ? '' : String(req.body.demand_id)
  const demandId = normalizeDemandId(demandIdRaw)
  const title = normalizeText(req.body.title, 200)
  const description = normalizeText(req.body.description, 5000)
  const reproduceSteps = normalizeText(req.body.reproduce_steps, 5000)
  const severity = normalizeEnum(req.body.severity, SEVERITY_SET, 'MEDIUM')
  const status = normalizeEnum(req.body.status, STATUS_SET, 'OPEN')
  const stage = normalizeEnum(req.body.stage, STAGE_SET, 'DEVELOPMENT')
  const assigneeUserId =
    req.body.assignee_user_id === undefined || req.body.assignee_user_id === null || req.body.assignee_user_id === ''
      ? null
      : toPositiveInt(req.body.assignee_user_id)
  const estimatedHours = normalizeHours(req.body.estimated_hours, 0)
  const actualHours = normalizeHours(req.body.actual_hours, 0)
  const dueDate = normalizeDate(req.body.due_date)
  if (bugCodeRaw !== undefined && bugCodeRaw !== null && String(bugCodeRaw).trim() !== '' && bugCode === '') {
    return res.status(400).json({ success: false, message: 'bug_code 格式无效，示例：BUG001' })
  }
  if (bugCodeRaw !== undefined && bugCodeRaw !== null && String(bugCodeRaw).trim() !== '' && bugCode === '') {
    return res.status(400).json({ success: false, message: 'bug_code 格式无效，示例：BUG001' })
  }
  if (bugCodeRaw !== undefined && bugCodeRaw !== null && String(bugCodeRaw).trim() !== '' && bugCode === '') {
    return res.status(400).json({ success: false, message: 'bug_code 格式无效，示例：BUG001' })
  }
  if (bugCodeRaw !== undefined && bugCodeRaw !== null && String(bugCodeRaw).trim() !== '' && bugCode === '') {
    return res.status(400).json({ success: false, message: 'bug_code 格式无效，示例：BUG001' })
  }

  if (!projectId) return res.status(400).json({ success: false, message: 'project_id 无效' })
  if (!title) return res.status(400).json({ success: false, message: 'Bug 标题不能为空' })
  if (req.body.requirement_id !== undefined && req.body.requirement_id !== null && req.body.requirement_id !== '' && !requirementId) {
    return res.status(400).json({ success: false, message: 'requirement_id 无效' })
  }
  if (demandIdRaw !== '' && demandId === '') {
    return res.status(400).json({ success: false, message: 'demand_id 格式无效' })
  }
  if (req.body.assignee_user_id !== undefined && req.body.assignee_user_id !== null && req.body.assignee_user_id !== '' && !assigneeUserId) {
    return res.status(400).json({ success: false, message: 'assignee_user_id 无效' })
  }
  if (Number.isNaN(estimatedHours) || Number.isNaN(actualHours)) {
    return res.status(400).json({ success: false, message: '工时必须是大于等于 0 的数字' })
  }
  if (dueDate === '') {
    return res.status(400).json({ success: false, message: '日期格式错误，需要为 YYYY-MM-DD' })
  }

  try {
    const scopeProjectId = toScopeProjectId(req)
    if (scopeProjectId && Number(scopeProjectId) !== Number(projectId)) {
      return res.status(403).json({ success: false, message: '无权限在其他业务线创建 Bug' })
    }
    const { error } = await validateReferences({
      projectId,
      requirementId,
      demandId: demandId || null,
      assigneeUserId,
    })
    if (error) return res.status(400).json({ success: false, message: error })

    const id = await Bug.create({
      bug_code: bugCode || null,
      project_id: projectId,
      requirement_id: requirementId,
      demand_id: demandId || null,
      title,
      description,
      reproduce_steps: reproduceSteps,
      severity,
      status,
      stage,
      assignee_user_id: assigneeUserId,
      estimated_hours: estimatedHours,
      actual_hours: actualHours,
      due_date: dueDate,
      created_by: req.user.id,
      updated_by: req.user.id,
    })

    await ProjectActivityLog.create({
      project_id: projectId,
      requirement_id: requirementId,
      bug_id: id,
      entity_type: 'BUG',
      entity_id: id,
      action: 'CREATE',
      action_detail: `创建 Bug：${title}${demandId ? `（需求池：${demandId}）` : ''}`,
      operator_user_id: req.user.id,
    })

    const created = await Bug.findById(id)
    return res.status(201).json({ success: true, message: '创建成功', data: created })
  } catch (err) {
    console.error('创建 Bug 失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateBug = async (req, res) => {
  const bugCodeRaw = req.body.bug_code
  const bugCode = normalizeBugCode(bugCodeRaw)
  const id = toPositiveInt(req.params.id)
  if (!id) return res.status(400).json({ success: false, message: 'Bug ID 无效' })

  const projectId = toPositiveInt(req.body.project_id)
  const requirementId =
    req.body.requirement_id === undefined || req.body.requirement_id === null || req.body.requirement_id === ''
      ? null
      : toPositiveInt(req.body.requirement_id)
  const demandIdRaw =
    req.body.demand_id === undefined || req.body.demand_id === null ? '' : String(req.body.demand_id)
  const demandId = normalizeDemandId(demandIdRaw)
  const title = normalizeText(req.body.title, 200)
  const description = normalizeText(req.body.description, 5000)
  const reproduceSteps = normalizeText(req.body.reproduce_steps, 5000)
  const severity = normalizeEnum(req.body.severity, SEVERITY_SET, 'MEDIUM')
  const status = normalizeEnum(req.body.status, STATUS_SET, 'OPEN')
  const stage = normalizeEnum(req.body.stage, STAGE_SET, 'DEVELOPMENT')
  const assigneeUserId =
    req.body.assignee_user_id === undefined || req.body.assignee_user_id === null || req.body.assignee_user_id === ''
      ? null
      : toPositiveInt(req.body.assignee_user_id)
  const estimatedHours = normalizeHours(req.body.estimated_hours, 0)
  const actualHours = normalizeHours(req.body.actual_hours, 0)
  const dueDate = normalizeDate(req.body.due_date)

  if (!projectId) return res.status(400).json({ success: false, message: 'project_id 无效' })
  if (!title) return res.status(400).json({ success: false, message: 'Bug 标题不能为空' })
  if (req.body.requirement_id !== undefined && req.body.requirement_id !== null && req.body.requirement_id !== '' && !requirementId) {
    return res.status(400).json({ success: false, message: 'requirement_id 无效' })
  }
  if (demandIdRaw !== '' && demandId === '') {
    return res.status(400).json({ success: false, message: 'demand_id 格式无效' })
  }
  if (req.body.assignee_user_id !== undefined && req.body.assignee_user_id !== null && req.body.assignee_user_id !== '' && !assigneeUserId) {
    return res.status(400).json({ success: false, message: 'assignee_user_id 无效' })
  }
  if (Number.isNaN(estimatedHours) || Number.isNaN(actualHours)) {
    return res.status(400).json({ success: false, message: '工时必须是大于等于 0 的数字' })
  }
  if (dueDate === '') {
    return res.status(400).json({ success: false, message: '日期格式错误，需要为 YYYY-MM-DD' })
  }

  try {
    const existing = await Bug.findById(id)
    if (!existing) return res.status(404).json({ success: false, message: 'Bug 不存在' })
    if (!isBugAccessible(req, existing)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线 Bug' })
    }
    const scopeProjectId = toScopeProjectId(req)
    if (scopeProjectId && Number(scopeProjectId) !== Number(projectId)) {
      return res.status(403).json({ success: false, message: '无权限将 Bug 转移到其他业务线' })
    }

    const { error } = await validateReferences({
      projectId,
      requirementId,
      demandId: demandId || null,
      assigneeUserId,
    })
    if (error) return res.status(400).json({ success: false, message: error })

    await Bug.update(id, {
      bug_code:
        bugCodeRaw === undefined
          ? existing.bug_code || null
          : bugCodeRaw === null || String(bugCodeRaw).trim() === ''
            ? null
            : bugCode || existing.bug_code || null,
      project_id: projectId,
      requirement_id: requirementId,
      demand_id: demandId || null,
      title,
      description,
      reproduce_steps: reproduceSteps,
      severity,
      status,
      stage,
      assignee_user_id: assigneeUserId,
      estimated_hours: estimatedHours,
      actual_hours: actualHours,
      due_date: dueDate,
      updated_by: req.user.id,
    })

    await ProjectActivityLog.create({
      project_id: projectId,
      requirement_id: requirementId,
      bug_id: id,
      entity_type: 'BUG',
      entity_id: id,
      action: 'UPDATE',
      action_detail: `更新 Bug：${title}${demandId ? `（需求池：${demandId}）` : ''}`,
      operator_user_id: req.user.id,
    })

    const updated = await Bug.findById(id)
    return res.json({ success: true, message: '更新成功', data: updated })
  } catch (err) {
    console.error('更新 Bug 失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteBug = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) return res.status(400).json({ success: false, message: 'Bug ID 无效' })

  try {
    const existing = await Bug.findById(id)
    if (!existing) return res.status(404).json({ success: false, message: 'Bug 不存在' })
    if (!isBugAccessible(req, existing)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线 Bug' })
    }

    await Bug.softDelete(id, req.user.id)
    await ProjectActivityLog.create({
      project_id: existing.project_id,
      requirement_id: existing.requirement_id,
      bug_id: id,
      entity_type: 'BUG',
      entity_id: id,
      action: 'DELETE',
      action_detail: `删除 Bug：${existing.title}`,
      operator_user_id: req.user.id,
    })

    return res.json({ success: true, message: '删除成功' })
  } catch (err) {
    console.error('删除 Bug 失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateBugStatus = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  const nextStatus = normalizeEnum(req.body.status, STATUS_SET, '')
  if (!id || !nextStatus) return res.status(400).json({ success: false, message: '参数无效' })

  try {
    const bug = await Bug.findById(id)
    if (!bug) return res.status(404).json({ success: false, message: 'Bug 不存在' })
    if (!isBugAccessible(req, bug)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线 Bug' })
    }

    const currentStatus = String(bug.status || '').toUpperCase()
    const allowed = NEXT_STATUS_MAP[currentStatus]
    if (!allowed || !allowed.has(nextStatus)) {
      return res.status(400).json({ success: false, message: '当前状态不允许流转到目标状态' })
    }

    await Bug.updateStatus(id, nextStatus, req.user.id)
    await ProjectActivityLog.create({
      project_id: bug.project_id,
      requirement_id: bug.requirement_id,
      bug_id: id,
      entity_type: 'BUG',
      entity_id: id,
      action: 'STATUS_CHANGE',
      action_detail: `Bug 状态从 ${currentStatus} 更新为 ${nextStatus}`,
      operator_user_id: req.user.id,
    })

    const updated = await Bug.findById(id)
    return res.json({ success: true, message: '状态更新成功', data: updated })
  } catch (err) {
    console.error('更新 Bug 状态失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateBugStage = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  const stage = normalizeEnum(req.body.stage, STAGE_SET, '')
  if (!id || !stage) return res.status(400).json({ success: false, message: '参数无效' })

  try {
    const bug = await Bug.findById(id)
    if (!bug) return res.status(404).json({ success: false, message: 'Bug 不存在' })
    if (!isBugAccessible(req, bug)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线 Bug' })
    }

    await Bug.updateStage(id, stage, req.user.id)
    await ProjectActivityLog.create({
      project_id: bug.project_id,
      requirement_id: bug.requirement_id,
      bug_id: id,
      entity_type: 'BUG',
      entity_id: id,
      action: 'STAGE_CHANGE',
      action_detail: `Bug 阶段更新为 ${stage}`,
      operator_user_id: req.user.id,
    })

    const updated = await Bug.findById(id)
    return res.json({ success: true, message: '阶段更新成功', data: updated })
  } catch (err) {
    console.error('更新 Bug 阶段失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateBugAssignee = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  const assigneeUserId =
    req.body.assignee_user_id === undefined || req.body.assignee_user_id === null || req.body.assignee_user_id === ''
      ? null
      : toPositiveInt(req.body.assignee_user_id)

  if (!id) return res.status(400).json({ success: false, message: 'Bug ID 无效' })
  if (req.body.assignee_user_id !== undefined && req.body.assignee_user_id !== null && req.body.assignee_user_id !== '' && !assigneeUserId) {
    return res.status(400).json({ success: false, message: 'assignee_user_id 无效' })
  }

  try {
    const bug = await Bug.findById(id)
    if (!bug) return res.status(404).json({ success: false, message: 'Bug 不存在' })
    if (!isBugAccessible(req, bug)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线 Bug' })
    }
    if (assigneeUserId) {
      const user = await User.findById(assigneeUserId)
      if (!user) return res.status(400).json({ success: false, message: '指派开发人员不存在' })
    }

    await Bug.updateAssignee(id, assigneeUserId, req.user.id)
    await ProjectActivityLog.create({
      project_id: bug.project_id,
      requirement_id: bug.requirement_id,
      bug_id: id,
      entity_type: 'BUG',
      entity_id: id,
      action: 'ASSIGN',
      action_detail: assigneeUserId ? `指派处理人为用户 ${assigneeUserId}` : '清空 Bug 负责人',
      operator_user_id: req.user.id,
    })

    const updated = await Bug.findById(id)
    return res.json({ success: true, message: '负责人更新成功', data: updated })
  } catch (err) {
    console.error('更新 Bug 负责人失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateBugHours = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  const estimatedHours = normalizeHours(req.body.estimated_hours, 0)
  const actualHours = normalizeHours(req.body.actual_hours, 0)

  if (!id) return res.status(400).json({ success: false, message: 'Bug ID 无效' })
  if (Number.isNaN(estimatedHours) || Number.isNaN(actualHours)) {
    return res.status(400).json({ success: false, message: '工时必须是大于等于 0 的数字' })
  }

  try {
    const bug = await Bug.findById(id)
    if (!bug) return res.status(404).json({ success: false, message: 'Bug 不存在' })
    if (!isBugAccessible(req, bug)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线 Bug' })
    }

    await Bug.updateHours(id, estimatedHours, actualHours, req.user.id)
    await ProjectActivityLog.create({
      project_id: bug.project_id,
      requirement_id: bug.requirement_id,
      bug_id: id,
      entity_type: 'BUG',
      entity_id: id,
      action: 'HOURS_UPDATE',
      action_detail: `更新工时：预估 ${estimatedHours} 小时，实际 ${actualHours} 小时`,
      operator_user_id: req.user.id,
    })

    const updated = await Bug.findById(id)
    return res.json({ success: true, message: '工时更新成功', data: updated })
  } catch (err) {
    console.error('更新 Bug 工时失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  listBugs,
  getBugById,
  createBug,
  updateBug,
  deleteBug,
  updateBugStatus,
  updateBugStage,
  updateBugAssignee,
  updateBugHours,
}
