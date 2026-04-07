const express = require('express')
const router = express.Router()

const authMiddleware = require('../middleware/auth')
const {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getUserDepartments,
  setUserDepartments,
} = require('../controllers/orgController')

router.use(authMiddleware)

router.get('/departments', authMiddleware.requirePermission('dept.view'), getDepartments)
router.post('/departments', authMiddleware.requirePermission('dept.manage'), createDepartment)
router.put('/departments/:id', authMiddleware.requirePermission('dept.manage'), updateDepartment)
router.delete('/departments/:id', authMiddleware.requirePermission('dept.manage'), deleteDepartment)

router.get('/users/:userId/departments', authMiddleware.requirePermission('dept.view'), getUserDepartments)
router.put('/users/:userId/departments', authMiddleware.requirePermission('dept.manage'), setUserDepartments)

module.exports = router
