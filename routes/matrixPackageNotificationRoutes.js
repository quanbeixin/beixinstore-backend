const express = require('express')
const authMiddleware = require('../middleware/auth')
const {
  listRules,
  getMeta,
  createRule,
  updateRule,
  deleteRule,
  getFeishuChatOptions,
  listTemplateFiles,
  upsertTemplateFile,
  deleteTemplateFile,
  getTemplateUploadPolicy,
} = require('../controllers/matrixPackageNotificationController')

const router = express.Router()

router.use(authMiddleware)

router.get('/meta', authMiddleware.requirePermission('matrix_package.notification.manage'), getMeta)
router.get('/feishu/chats', authMiddleware.requirePermission('matrix_package.notification.manage'), getFeishuChatOptions)
router.get('/', authMiddleware.requirePermission('matrix_package.notification.manage'), listRules)
router.post('/', authMiddleware.requirePermission('matrix_package.notification.manage'), createRule)
router.put('/:id', authMiddleware.requirePermission('matrix_package.notification.manage'), updateRule)
router.delete('/:id', authMiddleware.requirePermission('matrix_package.notification.manage'), deleteRule)
router.get('/template-files', authMiddleware.requirePermission('matrix_package.notification.manage'), listTemplateFiles)
router.put('/template-files/:templateKey', authMiddleware.requirePermission('matrix_package.notification.manage'), upsertTemplateFile)
router.delete('/template-files/:templateKey', authMiddleware.requirePermission('matrix_package.notification.manage'), deleteTemplateFile)
router.post('/template-files/upload-policy', authMiddleware.requirePermission('matrix_package.notification.manage'), getTemplateUploadPolicy)

module.exports = router
