const express = require('express')
const router = express.Router()

const authMiddleware = require('../middleware/auth')
const {
  listNotificationTemplateFiles,
  upsertNotificationTemplateFile,
  getNotificationTemplateFileUploadPolicy,
} = require('../controllers/notificationTemplateController')

router.use(authMiddleware)

router.get(
  '/notification-template-files',
  authMiddleware.requirePermission('notification.config.view'),
  listNotificationTemplateFiles,
)
router.put(
  '/notification-template-files/:templateKey',
  authMiddleware.requirePermission('notification.config.manage'),
  upsertNotificationTemplateFile,
)
router.post(
  '/notification-template-files/upload-policy',
  authMiddleware.requirePermission('notification.config.manage'),
  getNotificationTemplateFileUploadPolicy,
)

module.exports = router
