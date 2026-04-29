const express = require('express')

const authMiddleware = require('../middleware/auth')
const {
  getPromptConfig,
  updatePromptConfig,
  getImportantEmailConfig,
  updateImportantEmailConfig,
} = require('../controllers/userFeedbackController')

const router = express.Router()

router.use(authMiddleware)

router.get('/prompt', authMiddleware.requirePermission('feedback.view'), getPromptConfig)
router.put('/prompt', authMiddleware.requirePermission('feedback.manage'), updatePromptConfig)
router.get('/important-emails', authMiddleware.requirePermission('feedback.view'), getImportantEmailConfig)
router.put('/important-emails', authMiddleware.requirePermission('feedback.manage'), updateImportantEmailConfig)

module.exports = router
