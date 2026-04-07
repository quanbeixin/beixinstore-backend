const express = require('express')
const router = express.Router()

const authMiddleware = require('../middleware/auth')
const {
  batchBindFeishuUsers,
  bindFeishuUser,
  listFeishuBindingRecommendations,
  listFeishuContacts,
  listFeishuBindingCandidates,
  listFeishuUserBindings,
  unbindFeishuUser,
  getFeishuContactDetail,
  syncFeishuContacts,
} = require('../controllers/integrationController')

router.use(authMiddleware)

router.get('/feishu/contacts', authMiddleware.requirePermission('option.view'), listFeishuContacts)
router.get('/feishu/contacts/:id', authMiddleware.requirePermission('option.view'), getFeishuContactDetail)
router.post('/feishu/contacts/sync', authMiddleware.requirePermission('option.manage'), syncFeishuContacts)
router.get('/feishu/user-bindings', authMiddleware.requirePermission('option.view'), listFeishuUserBindings)
router.get('/feishu/user-binding-candidates', authMiddleware.requirePermission('option.view'), listFeishuBindingCandidates)
router.get('/feishu/user-binding-recommendations', authMiddleware.requirePermission('option.view'), listFeishuBindingRecommendations)
router.post('/feishu/user-bindings/bind', authMiddleware.requirePermission('option.manage'), bindFeishuUser)
router.post('/feishu/user-bindings/batch-bind', authMiddleware.requirePermission('option.manage'), batchBindFeishuUsers)
router.post('/feishu/user-bindings/unbind', authMiddleware.requirePermission('option.manage'), unbindFeishuUser)

module.exports = router
