const express = require('express')
const authMiddleware = require('../middleware/auth')
const {
  createAppVersionReleaseApplications,
  deleteAppVersionRelease,
  listGroupedAppVersionReleases,
  listAppVersionReleases,
  updateAppVersionRelease,
} = require('../controllers/appVersionReleaseController')

const router = express.Router()
const APP_RELEASE_MANAGER_ROLE_KEYS = new Set([
  'APP_RELEASE_MANAGER',
  'RELEASE_MANAGER',
  'APP_VERSION_RELEASE_MANAGER',
])

function requireAppReleaseManager(req, res, next) {
  if (req.userAccess?.is_super_admin) return next()
  const roleKeys = Array.isArray(req.userAccess?.role_keys) ? req.userAccess.role_keys : []
  const allowed = roleKeys.some((roleKey) => APP_RELEASE_MANAGER_ROLE_KEYS.has(String(roleKey || '').trim().toUpperCase()))
  if (!allowed) {
    return res.status(403).json({
      success: false,
      message: '仅超级管理员或发版管理员可执行该操作',
    })
  }
  return next()
}

router.use(authMiddleware)

router.get('/', authMiddleware.requirePermission('demand.view'), listAppVersionReleases)
router.get('/grouped', authMiddleware.requirePermission('demand.view'), listGroupedAppVersionReleases)
router.post('/applications', authMiddleware.requirePermission('demand.manage'), createAppVersionReleaseApplications)
router.put('/:id', authMiddleware.requirePermission('demand.manage'), requireAppReleaseManager, updateAppVersionRelease)
router.delete('/:id', authMiddleware.requirePermission('demand.manage'), requireAppReleaseManager, deleteAppVersionRelease)

module.exports = router
