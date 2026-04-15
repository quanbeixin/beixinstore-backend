const express = require('express')
const router = express.Router()

const { receiveFeishuBugCommentAction } = require('../controllers/bugController')

router.post('/card/action', receiveFeishuBugCommentAction)

module.exports = router
