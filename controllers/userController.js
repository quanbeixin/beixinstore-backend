const bcrypt = require('bcryptjs')
const User = require('../models/User')

function normalizeStatusCode(value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return normalized || 'ACTIVE'
}

// 获取用户列表（支持分页和关键字搜索）
const getUsers = async (req, res) => {
  const { page = 1, pageSize = 10, keyword = '' } = req.query

  try {
    const { rows, total } = await User.findAll({
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      keyword,
    })

    res.json({
      success: true,
      data: {
        list: rows,
        total,
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10),
      },
    })
  } catch (err) {
    console.error('获取用户列表失败:', err)
    res.status(500).json({ success: false, message: '服务器错误' })
  }
}

// 获取单个用户信息（含角色和部门）
const getUserById = async (req, res) => {
  const { id } = req.params

  try {
    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' })
    }

    return res.json({ success: true, data: user })
  } catch (err) {
    console.error('获取用户信息失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

// 创建新用户（POST /api/users）
const createUser = async (req, res) => {
  const { username, password, email, department_id, role_ids, status_code } = req.body

  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' })
  }

  try {
    const existing = await User.findByUsername(username)
    if (existing) {
      return res.status(409).json({ success: false, message: '用户名已存在' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const userId = await User.create({
      username,
      password: hashedPassword,
      email,
      department_id,
      status_code: normalizeStatusCode(status_code),
    })

    if (Array.isArray(role_ids) && role_ids.length > 0) {
      await User.setRoles(userId, role_ids)
    }

    const user = await User.findById(userId)
    return res.status(201).json({ success: true, message: '创建成功', data: user })
  } catch (err) {
    console.error('创建用户失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

// 通过 POST 更新用户信息（POST /api/users/:id/update）
const updateUser = async (req, res) => {
  const { id } = req.params
  const { email, department_id, role_ids, status_code } = req.body

  try {
    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' })
    }

    await User.update(id, {
      email,
      department_id,
      status_code: normalizeStatusCode(status_code),
    })

    if (Array.isArray(role_ids)) {
      await User.setRoles(id, role_ids)
    }

    const updated = await User.findById(id)
    return res.json({ success: true, message: '更新成功', data: updated })
  } catch (err) {
    console.error('更新用户失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

// 通过 POST 删除用户（POST /api/users/:id/delete）
const deleteUser = async (req, res) => {
  const { id } = req.params

  try {
    if (parseInt(id, 10) === req.user.id) {
      return res.status(400).json({ success: false, message: '不能删除当前登录用户' })
    }

    const affected = await User.delete(id)
    if (!affected) {
      return res.status(404).json({ success: false, message: '用户不存在' })
    }

    return res.json({ success: true, message: '删除成功' })
  } catch (err) {
    console.error('删除用户失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = { getUsers, getUserById, createUser, updateUser, deleteUser }
