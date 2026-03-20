const { verifyToken } = require('../utils/jwt')
const Permission = require('../models/Permission')

const RBAC_STRICT = process.env.RBAC_STRICT === 'true'

async function attachUserAccess(req) {
  if (!req.user?.id) return
  req.userAccess = await Permission.getUserAccess(req.user.id)
}

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!token) {
    return res.status(401).json({
      success: false,
      message: '未提供认证 Token',
    })
  }

  try {
    const decoded = verifyToken(token)
    req.user = decoded
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Token 无效或已过期',
    })
  }

  try {
    await attachUserAccess(req)
    return next()
  } catch (err) {
    console.error('加载用户权限失败:', err)
    return res.status(500).json({
      success: false,
      message: '用户权限加载失败',
    })
  }
}

function toCodeList(codes) {
  if (Array.isArray(codes)) return codes.filter(Boolean)
  if (typeof codes === 'string' && codes.trim()) return [codes.trim()]
  return []
}

function checkPermissions(userAccess, requiredCodes, mode = 'all') {
  if (userAccess?.is_super_admin) return true

  const userCodes = new Set(userAccess?.permission_codes || [])
  if (requiredCodes.length === 0) return true

  if (mode === 'any') {
    return requiredCodes.some((code) => userCodes.has(code))
  }

  return requiredCodes.every((code) => userCodes.has(code))
}

function createPermissionGuard(requiredCodes, mode) {
  const codeList = toCodeList(requiredCodes)

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: '未登录或登录状态已失效',
        })
      }

      if (!req.userAccess) {
        await attachUserAccess(req)
      }

      if (!req.userAccess?.permission_ready && !RBAC_STRICT) {
        return next()
      }

      const allowed = checkPermissions(req.userAccess, codeList, mode)
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: '无权限执行该操作',
          data: {
            required: codeList,
            mode,
          },
        })
      }

      return next()
    } catch (err) {
      console.error('权限校验失败:', err)
      return res.status(500).json({
        success: false,
        message: '权限校验失败',
      })
    }
  }
}

const requirePermission = (requiredCodes) => createPermissionGuard(requiredCodes, 'all')
const requireAnyPermission = (requiredCodes) => createPermissionGuard(requiredCodes, 'any')

authMiddleware.requirePermission = requirePermission
authMiddleware.requireAnyPermission = requireAnyPermission

module.exports = authMiddleware
