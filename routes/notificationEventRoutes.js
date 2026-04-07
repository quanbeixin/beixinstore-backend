const express = require('express')

const authMiddleware = require('../middleware/auth')
const { receiveEvent } = require('../controllers/notificationEventController')

const router = express.Router()

router.use(authMiddleware)
router.post('/event', authMiddleware.requirePermission('notification.rule.manage'), receiveEvent)

module.exports = router
