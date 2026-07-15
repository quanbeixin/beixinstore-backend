const express = require('express')
const authMiddleware = require('../middleware/auth')
const { proxyDebugRequest } = require('../controllers/matrixPackageDebugController')

const router = express.Router()

router.use(authMiddleware)

router.post('/request', authMiddleware.requirePermission('matrix_package.manage'), proxyDebugRequest)

module.exports = router
