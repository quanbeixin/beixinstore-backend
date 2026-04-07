const express = require('express')
const router = express.Router()

const authMiddleware = require('../middleware/auth')
const {
  listFeishuContacts,
  getFeishuContactDetail,
  syncFeishuContacts,
} = require('../controllers/integrationController')

router.use(authMiddleware)

router.get('/feishu/contacts', authMiddleware.requirePermission('option.view'), listFeishuContacts)
router.get('/feishu/contacts/:id', authMiddleware.requirePermission('option.view'), getFeishuContactDetail)
router.post('/feishu/contacts/sync', authMiddleware.requirePermission('option.manage'), syncFeishuContacts)

module.exports = router
