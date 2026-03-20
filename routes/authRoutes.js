const express = require('express')
const router = express.Router()

const { register, login, getProfile, getAccess } = require('../controllers/authController')
const authMiddleware = require('../middleware/auth')

router.post('/register', register)
router.post('/login', login)
router.get('/profile', authMiddleware, getProfile)
router.get('/access', authMiddleware, getAccess)

module.exports = router
