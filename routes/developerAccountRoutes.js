const express = require('express')
const authMiddleware = require('../middleware/auth')
const {
  createDeveloperAccount,
  deleteDeveloperAccount,
  listDeveloperAccountOptions,
  listDeveloperAccounts,
  updateDeveloperAccount,
} = require('../controllers/developerAccountController')

const router = express.Router()

router.use(authMiddleware)

router.get('/', authMiddleware.requirePermission('matrix_package.view'), listDeveloperAccounts)
router.get('/options', authMiddleware.requirePermission('matrix_package.view'), listDeveloperAccountOptions)
router.post('/', authMiddleware.requirePermission('matrix_package.manage'), createDeveloperAccount)
router.put('/:id', authMiddleware.requirePermission('matrix_package.manage'), updateDeveloperAccount)
router.delete('/:id', authMiddleware.requirePermission('matrix_package.manage'), deleteDeveloperAccount)

module.exports = router
