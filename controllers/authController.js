const bcrypt = require('bcryptjs')
const User = require('../models/User')
const Permission = require('../models/Permission')
const { generateToken } = require('../utils/jwt')

function normalizeStatusCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return code || 'ACTIVE'
}

function getStatusBlockMessage(statusCode) {
  if (statusCode === 'INACTIVE') {
    return '账号未激活，请联系管理员'
  }

  if (statusCode === 'DISABLED') {
    return '账号已停用，请联系管理员'
  }

  if (statusCode === 'LOCKED') {
    return '账号已锁定，请联系管理员'
  }

  return null
}

const register = async (req, res) => {
  const { username, password, confirmPassword, email } = req.body

  if (!username || !password || !confirmPassword) {
    return res.status(400).json({
      success: false,
      message: '用户名、密码和确认密码不能为空',
    })
  }

  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({
      success: false,
      message: '用户名长度必须在 3-20 个字符之间',
    })
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({
      success: false,
      message: '用户名只能包含字母、数字和下划线',
    })
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: '密码长度至少 6 个字符',
    })
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      success: false,
      message: '两次输入的密码不一致',
    })
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: '邮箱格式不正确',
    })
  }

  try {
    const existing = await User.findByUsername(username)
    if (existing) {
      return res.status(409).json({
        success: false,
        message: '用户名已存在',
      })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const userId = await User.create({
      username,
      password: hashedPassword,
      email: email || null,
      status_code: 'ACTIVE',
    })

    return res.status(201).json({
      success: true,
      message: '注册成功，请登录',
      data: { id: userId, username, email: email || null },
    })
  } catch (err) {
    console.error('注册失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const login = async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: '用户名和密码不能为空',
    })
  }

  try {
    const user = await User.findByUsername(username)
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误',
      })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误',
      })
    }

    const statusCode = normalizeStatusCode(user.status_code)
    if (statusCode !== 'ACTIVE') {
      const statusBlockMessage = getStatusBlockMessage(statusCode) || '账号状态异常，禁止登录'
      return res.status(403).json({
        success: false,
        message: statusBlockMessage,
        data: {
          status_code: statusCode,
        },
      })
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
    })

    return res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          status_code: statusCode,
        },
      },
    })
  } catch (err) {
    console.error('登录失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' })
    }

    return res.json({ success: true, data: user })
  } catch (err) {
    console.error('获取用户信息失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getAccess = async (req, res) => {
  try {
    const access = req.userAccess || (await Permission.getUserAccess(req.user.id))
    return res.json({ success: true, data: access })
  } catch (err) {
    console.error('获取访问权限失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = { register, login, getProfile, getAccess }
