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

router.get('/', authMiddleware.requirePermission('demand.view'), listDeveloperAccounts)
router.get('/options', authMiddleware.requirePermission('demand.view'), listDeveloperAccountOptions)
router.post('/', authMiddleware.requirePermission('demand.manage'), createDeveloperAccount)
router.put('/:id', authMiddleware.requirePermission('demand.manage'), updateDeveloperAccount)
router.delete('/:id', authMiddleware.requirePermission('demand.manage'), deleteDeveloperAccount)

module.exports = router
