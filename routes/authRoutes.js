const express = require('express')
const router = express.Router()

const {
  register,
  login,
  getProfile,
  updateProfile,
  updatePassword,
  getPreferences,
  updatePreferences,
  getAccess,
} = require('../controllers/authController')
const authMiddleware = require('../middleware/auth')

router.post('/register', register)
router.post('/login', login)
router.get('/profile', authMiddleware, getProfile)
router.put('/profile', authMiddleware, updateProfile)
router.put('/password', authMiddleware, updatePassword)
router.get('/preferences', authMiddleware, getPreferences)
router.put('/preferences', authMiddleware, updatePreferences)
router.get('/access', authMiddleware, getAccess)

module.exports = router
