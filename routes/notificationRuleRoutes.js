const express = require('express')

const authMiddleware = require('../middleware/auth')
const {
  createRule,
  getRules,
  updateRule,
  deleteRule,
  getSendControl,
  updateSendControl,
  getFeishuChatOptions,
} = require('../controllers/notificationRuleController')

const router = express.Router()

router.use(authMiddleware)

router.get(
  '/feishu/chats',
  authMiddleware.requireAnyPermission(['notification.rule.manage', 'demand.view']),
  getFeishuChatOptions,
)

router.use(authMiddleware.requirePermission('notification.rule.manage'))

router.post('/', createRule)
router.get('/', getRules)
router.get('/send-control', getSendControl)
router.put('/send-control', updateSendControl)
router.put('/:id', updateRule)
router.delete('/:id', deleteRule)

module.exports = router
