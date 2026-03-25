const UserBusinessLine = require('../models/UserBusinessLine')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeHeaderProjectId(req) {
  const rawValue = req.headers['x-business-line-id']
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return null
  }
  return toPositiveInt(rawValue)
}

function mapScopePayload({
  isSuperAdmin,
  activeProject,
  availableProjects,
  canSwitchBusinessLine,
}) {
  const activeProjectId = toPositiveInt(activeProject?.project_id)

  return {
    is_super_admin: Boolean(isSuperAdmin),
    project_id: activeProjectId,
    active_project_id: activeProjectId,
    active_project_name: activeProject?.project_name || '',
    active_project_code: activeProject?.project_code || '',
    can_switch_business_line: Boolean(canSwitchBusinessLine),
    available_projects: Array.isArray(availableProjects) ? availableProjects : [],
  }
}

async function businessLineScope(req, res, next) {
  try {
    const userId = toPositiveInt(req.user?.id)
    if (!userId) {
      return res.status(401).json({ success: false, message: '未授权访问' })
    }

    const isSuperAdmin = Boolean(req.userAccess?.is_super_admin)
    const availableProjects = await UserBusinessLine.listAvailableProjectsForUser({
      userId,
      isSuperAdmin,
    })
    const headerProjectId = normalizeHeaderProjectId(req)

    if (isSuperAdmin) {
      if (availableProjects.length === 0) {
        req.businessLineScope = mapScopePayload({
          isSuperAdmin: true,
          activeProject: null,
          availableProjects: [],
          canSwitchBusinessLine: true,
        })
        return next()
      }

      const selectedProject =
        headerProjectId === null
          ? availableProjects[0]
          : availableProjects.find((item) => Number(item.project_id) === Number(headerProjectId))

      if (!selectedProject) {
        return res.status(400).json({
          success: false,
          message: '业务线选择无效，请刷新后重试',
        })
      }

      req.businessLineScope = mapScopePayload({
        isSuperAdmin: true,
        activeProject: selectedProject,
        availableProjects,
        canSwitchBusinessLine: true,
      })
      return next()
    }

    const binding = await UserBusinessLine.getByUserId(userId)
    if (!binding?.project_id) {
      return res.status(403).json({
        success: false,
        message: '当前账号未绑定业务线，无法访问业务线数据',
      })
    }

    if (headerProjectId !== null && Number(headerProjectId) !== Number(binding.project_id)) {
      return res.status(403).json({
        success: false,
        message: '无权切换到其他业务线',
      })
    }

    req.businessLineScope = mapScopePayload({
      isSuperAdmin: false,
      activeProject: binding,
      availableProjects: [binding],
      canSwitchBusinessLine: false,
    })
    return next()
  } catch (err) {
    console.error('加载业务线权限失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = businessLineScope
