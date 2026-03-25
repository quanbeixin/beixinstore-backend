const ProjectStats = require('../models/ProjectStats')

const PROJECT_STATUS_SET = new Set(['IN_PROGRESS', 'COMPLETED'])

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeProjectStatus(value) {
  const status = String(value || '').trim().toUpperCase()
  return PROJECT_STATUS_SET.has(status) ? status : ''
}

function toScopeProjectId(req) {
  return toPositiveInt(req.businessLineScope?.active_project_id || req.businessLineScope?.project_id)
}

const getProjectStatsOverview = async (req, res) => {
  try {
    const data = await ProjectStats.getOverview({ accessProjectId: toScopeProjectId(req) })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取项目统计总览失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getProjectStatsByProject = async (req, res) => {
  const status = req.query.status ? normalizeProjectStatus(req.query.status) : ''
  const ownerUserId = toPositiveInt(req.query.owner_user_id)

  if (req.query.owner_user_id !== undefined && req.query.owner_user_id !== null && req.query.owner_user_id !== '' && !ownerUserId) {
    return res.status(400).json({ success: false, message: 'owner_user_id 无效' })
  }

  try {
    const data = await ProjectStats.getProjectStats({
      status,
      ownerUserId,
      accessProjectId: toScopeProjectId(req),
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取按项目统计失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getProjectStatsByMember = async (req, res) => {
  const projectId = toPositiveInt(req.query.project_id)
  const userId = toPositiveInt(req.query.user_id)

  if (req.query.project_id !== undefined && req.query.project_id !== null && req.query.project_id !== '' && !projectId) {
    return res.status(400).json({ success: false, message: 'project_id 无效' })
  }

  if (req.query.user_id !== undefined && req.query.user_id !== null && req.query.user_id !== '' && !userId) {
    return res.status(400).json({ success: false, message: 'user_id 无效' })
  }

  try {
    const data = await ProjectStats.getMemberStats({
      projectId,
      userId,
      accessProjectId: toScopeProjectId(req),
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取按成员统计失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  getProjectStatsOverview,
  getProjectStatsByProject,
  getProjectStatsByMember,
}
