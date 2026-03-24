const UserBusinessLine = require('../models/UserBusinessLine')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

async function businessLineScope(req, res, next) {
  try {
    const userId = toPositiveInt(req.user?.id)
    if (!userId) {
      return res.status(401).json({ success: false, message: '未授权' })
    }

    const isSuperAdmin = Boolean(req.userAccess?.is_super_admin)
    if (isSuperAdmin) {
      req.businessLineScope = {
        is_super_admin: true,
        project_id: null,
      }
      return next()
    }

    const binding = await UserBusinessLine.getByUserId(userId)
    if (!binding?.project_id) {
      return res.status(403).json({ success: false, message: '当前账号未绑定业务线，无法访问项目管理数据' })
    }

    req.businessLineScope = {
      is_super_admin: false,
      project_id: Number(binding.project_id),
    }
    return next()
  } catch (err) {
    console.error('加载业务线数据权限失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = businessLineScope

