const express = require('express')
const authMiddleware = require('../middleware/auth')
const {
  createConfig,
  deleteConfig,
  getFeishuChatOptions,
  getImageUploadPolicy,
  listConfigs,
  listLogs,
  sendTest,
  updateConfig,
  updateEnabled,
} = require('../controllers/culturePushController')

const router = express.Router()

router.use(authMiddleware)

router.get('/feishu/chats', getFeishuChatOptions)
router.post('/push-configs/image-upload-policy', getImageUploadPolicy)
router.get('/push-configs', listConfigs)
router.post('/push-configs', createConfig)
router.put('/push-configs/:id', updateConfig)
router.patch('/push-configs/:id/enabled', updateEnabled)
router.post('/push-configs/:id/test-send', sendTest)
router.get('/push-configs/:id/logs', listLogs)
router.delete('/push-configs/:id', deleteConfig)

module.exports = router
