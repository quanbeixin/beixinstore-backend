const express = require('express');
const router = express.Router();
const { getUsers, getUserById, createUser, updateUser, deleteUser } = require('../controllers/userController');
const authMiddleware = require('../middleware/auth');

// 所有用户接口都需要 JWT 验证
router.use(authMiddleware);

// GET  /api/users               - 获取用户列表（支持 ?page=1&pageSize=10&keyword=）
router.get('/', getUsers);

// GET  /api/users/:id           - 获取单个用户信息
router.get('/:id', getUserById);

// POST /api/users               - 创建新用户
router.post('/', createUser);

// POST /api/users/:id/update    - 更新用户信息（邮箱、部门、角色）
router.post('/:id/update', updateUser);

// POST /api/users/:id/delete    - 删除用户
router.post('/:id/delete', deleteUser);

module.exports = router;
