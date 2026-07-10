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

router.get('/meta', authMiddleware.requirePermission('demand.view'), getMeta)
router.get('/feishu/chats', authMiddleware.requirePermission('demand.manage'), getFeishuChatOptions)
router.get('/', authMiddleware.requirePermission('demand.view'), listRules)
router.post('/', authMiddleware.requirePermission('demand.manage'), createRule)
router.put('/:id', authMiddleware.requirePermission('demand.manage'), updateRule)
router.delete('/:id', authMiddleware.requirePermission('demand.manage'), deleteRule)
router.get('/template-files', authMiddleware.requirePermission('demand.view'), listTemplateFiles)
router.put('/template-files/:templateKey', authMiddleware.requirePermission('demand.manage'), upsertTemplateFile)
router.delete('/template-files/:templateKey', authMiddleware.requirePermission('demand.manage'), deleteTemplateFile)
router.post('/template-files/upload-policy', authMiddleware.requirePermission('demand.manage'), getTemplateUploadPolicy)

module.exports = router
