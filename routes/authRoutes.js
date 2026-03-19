const express = require('express');
const router = express.Router();
const { register, login, getProfile } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// POST /api/auth/register - 用户注册
router.post('/register', register);

// POST /api/auth/login - 用户登录
router.post('/login', login);

// GET /api/auth/profile - 获取当前用户信息（需要 Token）
router.get('/profile', authMiddleware, getProfile);

module.exports = router;
