const express = require('express')
const router = express.Router()

const authMiddleware = require('../middleware/auth')
const {
  getRoles,
  getPermissions,
  getRolePermissions,
  updateRolePermissions,
  getMenuVisibilityRules,
  getMenuVisibilityDepartments,
  updateMenuVisibilityRule,
  getMyMenuVisibility,
} = require('../controllers/rolePermissionController')

router.use(authMiddleware)

router.get('/roles', authMiddleware.requirePermission('option.view'), getRoles)
router.get('/permissions', authMiddleware.requirePermission('option.view'), getPermissions)
router.get('/roles/:roleId/permissions', authMiddleware.requirePermission('option.view'), getRolePermissions)
router.put('/roles/:roleId/permissions', authMiddleware.requirePermission('option.manage'), updateRolePermissions)
router.get('/menu-visibility/me', getMyMenuVisibility)
router.get('/menu-visibility', authMiddleware.requirePermission('option.view'), getMenuVisibilityRules)
router.get(
  '/menu-visibility/departments',
  authMiddleware.requirePermission('option.view'),
  getMenuVisibilityDepartments,
)
router.put('/menu-visibility', authMiddleware.requirePermission('option.manage'), updateMenuVisibilityRule)

module.exports = router
