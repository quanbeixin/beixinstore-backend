const express = require('express')
const router = express.Router()

const { getUsers, listUserChangeLogs, getUserById, createUser, updateUser, deleteUser } = require('../controllers/userController')
const authMiddleware = require('../middleware/auth')

router.use(authMiddleware)

router.get('/', authMiddleware.requirePermission('user.view'), getUsers)
router.get('/change-logs', authMiddleware.requirePermission('user.view'), listUserChangeLogs)
router.get('/:id', authMiddleware.requirePermission('user.view'), getUserById)
router.post('/', authMiddleware.requirePermission('user.create'), createUser)
router.post('/:id/update', authMiddleware.requirePermission('user.update'), updateUser)
router.post('/:id/delete', authMiddleware.requirePermission('user.delete'), deleteUser)

module.exports = router
