const express = require('express')

const authMiddleware = require('../middleware/auth')
const {
  getPromptConfig,
  updatePromptConfig,
} = require('../controllers/userFeedbackController')

const router = express.Router()

router.use(authMiddleware)

router.get('/prompt', authMiddleware.requirePermission('feedback.view'), getPromptConfig)
router.put('/prompt', authMiddleware.requirePermission('feedback.manage'), updatePromptConfig)

module.exports = router
