const Project = require('../models/Project')
const ProjectMember = require('../models/ProjectMember')
const ProjectActivityLog = require('../models/ProjectActivityLog')
const User = require('../models/User')

const PROJECT_STATUS_SET = new Set(['IN_PROGRESS', 'COMPLETED'])
const PROJECT_ROLE_SET = new Set(['PM', 'DEV', 'QA'])

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeText(value, maxLen = 200) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeProjectStatus(value) {
  const status = String(value || 'IN_PROGRESS').trim().toUpperCase()
  return PROJECT_STATUS_SET.has(status) ? status : 'IN_PROGRESS'
}

function normalizeProjectRole(value) {
  const role = String(value || 'DEV').trim().toUpperCase()
  return PROJECT_ROLE_SET.has(role) ? role : 'DEV'
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function getScopeProjectId(req) {
  return req.businessLineScope?.is_super_admin ? null : toPositiveInt(req.businessLineScope?.project_id)
}

function assertProjectInScope(req, projectId) {
  const scopeProjectId = getScopeProjectId(req)
  if (!scopeProjectId) return true
  return Number(scopeProjectId) === Number(projectId)
}

async function loadProjectDetail(projectId) {
  const project = await Project.findById(projectId)
  if (!project) return null

  const summary = await Project.getSummaryById(projectId)
  const members = await ProjectMember.listByProjectId(projectId)

  return {
    ...project,
    member_count: Number(summary?.member_count || 0),
    requirement_count: Number(summary?.requirement_count || 0),
    bug_count: Number(summary?.bug_count || 0),
    members,
  }
}

const listProjects = async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1)
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 10), 1), 100)
  const keyword = normalizeText(req.query.keyword, 100)
  const status = req.query.status ? normalizeProjectStatus(req.query.status) : ''

  try {
    const result = await Project.findAll({
      page,
      pageSize,
      keyword,
      status,
      onlyProjectId: getScopeProjectId(req),
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
    console.error('获取项目列表失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getProjectById = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) {
    return res.status(400).json({ success: false, message: '项目ID无效' })
  }

  try {
    if (!assertProjectInScope(req, id)) {
      return res.status(403).json({ success: false, message: '无权限访问该业务线' })
    }
    const project = await loadProjectDetail(id)
    if (!project) {
      return res.status(404).json({ success: false, message: '项目不存在' })
    }
    return res.json({ success: true, data: project })
  } catch (err) {
    console.error('获取项目详情失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createProject = async (req, res) => {
  const name = normalizeText(req.body.name, 100)
  const projectCode = normalizeText(req.body.project_code, 50)
  const description = normalizeText(req.body.description, 2000)
  const status = normalizeProjectStatus(req.body.status)
  const ownerUserId =
    req.body.owner_user_id === undefined || req.body.owner_user_id === null || req.body.owner_user_id === ''
      ? null
      : toPositiveInt(req.body.owner_user_id)
  const startDate = normalizeDate(req.body.start_date)
  const endDate = normalizeDate(req.body.end_date)

  if (!name) {
    return res.status(400).json({ success: false, message: '项目名称不能为空' })
  }
  if (req.body.owner_user_id !== undefined && req.body.owner_user_id !== null && req.body.owner_user_id !== '' && !ownerUserId) {
    return res.status(400).json({ success: false, message: 'owner_user_id 无效' })
  }
  if (startDate === '' || endDate === '') {
    return res.status(400).json({ success: false, message: '日期格式错误，需为 YYYY-MM-DD' })
  }
  if (startDate && endDate && startDate > endDate) {
    return res.status(400).json({ success: false, message: '开始日期不能晚于结束日期' })
  }

  try {
    if (getScopeProjectId(req)) {
      return res.status(403).json({ success: false, message: '当前账号仅允许管理所属业务线，不支持新建业务线' })
    }
    if (ownerUserId) {
      const owner = await User.findById(ownerUserId)
      if (!owner) {
        return res.status(400).json({ success: false, message: '项目负责人不存在' })
      }
    }

    const projectId = await Project.create({
      name,
      project_code: projectCode || null,
      description: description || null,
      status,
      owner_user_id: ownerUserId,
      start_date: startDate,
      end_date: endDate,
      created_by: req.user.id,
      updated_by: req.user.id,
    })

    await ProjectActivityLog.create({
      project_id: projectId,
      entity_type: 'PROJECT',
      entity_id: projectId,
      action: 'CREATE',
      action_detail: `创建项目：${name}`,
      operator_user_id: req.user.id,
    })

    const project = await loadProjectDetail(projectId)
    return res.status(201).json({ success: true, message: '创建成功', data: project })
  } catch (err) {
    console.error('创建项目失败:', err)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '项目名称或项目编码已存在' })
    }
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateProject = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) {
    return res.status(400).json({ success: false, message: '项目ID无效' })
  }

  const name = normalizeText(req.body.name, 100)
  const projectCode = normalizeText(req.body.project_code, 50)
  const description = normalizeText(req.body.description, 2000)
  const status = normalizeProjectStatus(req.body.status)
  const ownerUserId =
    req.body.owner_user_id === undefined || req.body.owner_user_id === null || req.body.owner_user_id === ''
      ? null
      : toPositiveInt(req.body.owner_user_id)
  const startDate = normalizeDate(req.body.start_date)
  const endDate = normalizeDate(req.body.end_date)

  if (!name) {
    return res.status(400).json({ success: false, message: '项目名称不能为空' })
  }
  if (req.body.owner_user_id !== undefined && req.body.owner_user_id !== null && req.body.owner_user_id !== '' && !ownerUserId) {
    return res.status(400).json({ success: false, message: 'owner_user_id 无效' })
  }
  if (startDate === '' || endDate === '') {
    return res.status(400).json({ success: false, message: '日期格式错误，需为 YYYY-MM-DD' })
  }
  if (startDate && endDate && startDate > endDate) {
    return res.status(400).json({ success: false, message: '开始日期不能晚于结束日期' })
  }

  try {
    if (!assertProjectInScope(req, id)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线' })
    }
    const existing = await Project.findById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '项目不存在' })
    }
    if (ownerUserId) {
      const owner = await User.findById(ownerUserId)
      if (!owner) {
        return res.status(400).json({ success: false, message: '项目负责人不存在' })
      }
    }

    await Project.update(id, {
      name,
      project_code: projectCode || null,
      description: description || null,
      status,
      owner_user_id: ownerUserId,
      start_date: startDate,
      end_date: endDate,
      updated_by: req.user.id,
    })

    await ProjectActivityLog.create({
      project_id: id,
      entity_type: 'PROJECT',
      entity_id: id,
      action: 'UPDATE',
      action_detail: `更新项目：${name}`,
      operator_user_id: req.user.id,
    })

    const project = await loadProjectDetail(id)
    return res.json({ success: true, message: '更新成功', data: project })
  } catch (err) {
    console.error('更新项目失败:', err)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '项目名称或项目编码已存在' })
    }
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteProject = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) {
    return res.status(400).json({ success: false, message: '项目ID无效' })
  }

  try {
    if (!assertProjectInScope(req, id)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线' })
    }
    const existing = await Project.findById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '项目不存在' })
    }

    await Project.softDelete(id, req.user.id)
    await ProjectActivityLog.create({
      project_id: id,
      entity_type: 'PROJECT',
      entity_id: id,
      action: 'DELETE',
      action_detail: `删除项目：${existing.name}`,
      operator_user_id: req.user.id,
    })

    return res.json({ success: true, message: '删除成功' })
  } catch (err) {
    console.error('删除项目失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listProjectMembers = async (req, res) => {
  const projectId = toPositiveInt(req.params.id)
  if (!projectId) {
    return res.status(400).json({ success: false, message: '项目ID无效' })
  }

  try {
    if (!assertProjectInScope(req, projectId)) {
      return res.status(403).json({ success: false, message: '无权限访问该业务线' })
    }
    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ success: false, message: '项目不存在' })
    }
    const rows = await ProjectMember.listByProjectId(projectId)
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('获取项目成员失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const addProjectMember = async (req, res) => {
  const projectId = toPositiveInt(req.params.id)
  const userId = toPositiveInt(req.body.user_id)
  const projectRole = normalizeProjectRole(req.body.project_role)

  if (!projectId) {
    return res.status(400).json({ success: false, message: '项目ID无效' })
  }
  if (!userId) {
    return res.status(400).json({ success: false, message: 'user_id 无效' })
  }

  try {
    if (!assertProjectInScope(req, projectId)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线' })
    }
    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ success: false, message: '项目不存在' })
    }
    const user = await User.findById(userId)
    if (!user) {
      return res.status(400).json({ success: false, message: '用户不存在' })
    }
    const existing = await ProjectMember.findByProjectAndUser(projectId, userId)
    if (existing) {
      return res.status(409).json({ success: false, message: '该用户已是项目成员' })
    }

    const memberId = await ProjectMember.create({
      project_id: projectId,
      user_id: userId,
      project_role: projectRole,
      created_by: req.user.id,
      updated_by: req.user.id,
    })

    await ProjectActivityLog.create({
      project_id: projectId,
      entity_type: 'PROJECT',
      entity_id: projectId,
      action: 'ADD_MEMBER',
      action_detail: `添加项目成员：${user.username}（${projectRole}）`,
      operator_user_id: req.user.id,
    })

    const member = await ProjectMember.findById(memberId)
    return res.status(201).json({ success: true, message: '添加成功', data: member })
  } catch (err) {
    console.error('添加项目成员失败:', err)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '该用户已是项目成员' })
    }
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateProjectMember = async (req, res) => {
  const projectId = toPositiveInt(req.params.id)
  const memberId = toPositiveInt(req.params.memberId)
  const projectRole = normalizeProjectRole(req.body.project_role)

  if (!projectId || !memberId) {
    return res.status(400).json({ success: false, message: '参数无效' })
  }

  try {
    if (!assertProjectInScope(req, projectId)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线' })
    }
    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ success: false, message: '项目不存在' })
    }
    const member = await ProjectMember.findById(memberId)
    if (!member || Number(member.project_id) !== projectId) {
      return res.status(404).json({ success: false, message: '项目成员不存在' })
    }

    await ProjectMember.updateRole(memberId, projectRole, req.user.id)
    await ProjectActivityLog.create({
      project_id: projectId,
      entity_type: 'PROJECT',
      entity_id: projectId,
      action: 'UPDATE_MEMBER',
      action_detail: `更新成员角色：用户 ${member.user_id} -> ${projectRole}`,
      operator_user_id: req.user.id,
    })

    const updated = await ProjectMember.findById(memberId)
    return res.json({ success: true, message: '更新成功', data: updated })
  } catch (err) {
    console.error('更新项目成员失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteProjectMember = async (req, res) => {
  const projectId = toPositiveInt(req.params.id)
  const memberId = toPositiveInt(req.params.memberId)

  if (!projectId || !memberId) {
    return res.status(400).json({ success: false, message: '参数无效' })
  }

  try {
    if (!assertProjectInScope(req, projectId)) {
      return res.status(403).json({ success: false, message: '无权限操作该业务线' })
    }
    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ success: false, message: '项目不存在' })
    }
    const member = await ProjectMember.findById(memberId)
    if (!member || Number(member.project_id) !== projectId) {
      return res.status(404).json({ success: false, message: '项目成员不存在' })
    }

    await ProjectMember.softDelete(memberId, req.user.id)
    await ProjectActivityLog.create({
      project_id: projectId,
      entity_type: 'PROJECT',
      entity_id: projectId,
      action: 'REMOVE_MEMBER',
      action_detail: `移除项目成员：用户 ${member.user_id}`,
      operator_user_id: req.user.id,
    })

    return res.json({ success: true, message: '移除成功' })
  } catch (err) {
    console.error('移除项目成员失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listProjectActivityLogs = async (req, res) => {
  const projectId = toPositiveInt(req.params.id)
  const page = Math.max(Number(req.query.page || 1), 1)
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 20), 1), 100)

  if (!projectId) {
    return res.status(400).json({ success: false, message: '项目ID无效' })
  }

  try {
    if (!assertProjectInScope(req, projectId)) {
      return res.status(403).json({ success: false, message: '无权限访问该业务线' })
    }
    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ success: false, message: '项目不存在' })
    }
    const rows = await ProjectActivityLog.listByProject(projectId, { page, pageSize })
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('获取项目日志失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  listProjectMembers,
  addProjectMember,
  updateProjectMember,
  deleteProjectMember,
  listProjectActivityLogs,
}
