const bcrypt = require('bcryptjs')
const User = require('../models/User')
const Permission = require('../models/Permission')
const UserPreference = require('../models/UserPreference')
const UserChangeLog = require('../models/UserChangeLog')
const { generateToken } = require('../utils/jwt')

function normalizeStatusCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return code || 'ACTIVE'
}

function getStatusBlockMessage(statusCode) {
  if (statusCode === 'INACTIVE') return '账号未激活，请联系管理员'
  if (statusCode === 'DISABLED') return '账号已停用，请联系管理员'
  if (statusCode === 'LOCKED') return '账号已锁定，请联系管理员'
  return null
}

function parseRoleIds(value) {
  if (!value) return []
  return String(value)
    .split(',')
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)
}

function parseRoleNames(value) {
  if (!value) return []
  return String(value)
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function normalizeText(value, maxLen = 64) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeEmail(value) {
  if (value === undefined) return undefined
  const email = String(value || '').trim()
  if (!email) return null
  return email
}

function normalizePhone(value) {
  if (value === undefined) return undefined
  const phone = String(value || '').trim()
  if (!phone) return ''
  return phone.slice(0, 20)
}

function normalizeRealName(value) {
  if (value === undefined) return undefined
  return normalizeText(value, 32)
}

function normalizeDefaultHome(value) {
  const path = String(value || '').trim()
  if (!path) return ''
  const allowed = new Set(['/work-logs', '/my-demands', '/work-demands', '/owner-workbench', '/performance-dashboard'])
  return allowed.has(path) ? path : ''
}

function normalizeDateDisplayMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  if (!mode) return ''
  return mode === 'date' || mode === 'datetime' ? mode : ''
}

function toBoolInt(value) {
  if (value === undefined || value === null || value === '') return null
  if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return 1
  if (value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false') return 0
  return null
}

function buildProfileResponse(user, preference) {
  return {
    id: Number(user?.id || 0),
    username: user?.username || '',
    real_name: user?.real_name || '',
    email: user?.email || '',
    department_id: user?.department_id ? Number(user.department_id) : null,
    department_name: user?.department_name || '',
    status_code: normalizeStatusCode(user?.status_code),
    role_ids: Array.isArray(user?.role_ids) ? user.role_ids : parseRoleIds(user?.role_ids),
    role_names: Array.isArray(user?.role_names) ? user.role_names : parseRoleNames(user?.role_names),
    created_at: user?.created_at || null,
    last_login_at: user?.last_login_at || null,
    mobile: preference?.mobile || '',
  }
}

const register = async (req, res) => {
  const { username, password, confirmPassword, email } = req.body
  const realName = normalizeRealName(req.body.real_name)

  if (!username || !realName || !password || !confirmPassword) {
    return res.status(400).json({ success: false, message: '用户名、真实姓名、密码和确认密码不能为空' })
  }

  if (realName.length < 2 || realName.length > 32) {
    return res.status(400).json({ success: false, message: 'real_name length must be 2-32 characters' })
  }

  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ success: false, message: '用户名长度必须在 3-20 个字符之间' })
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ success: false, message: '用户名只能包含字母、数字和下划线' })
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: '密码长度至少 6 个字符' })
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, message: '两次输入的密码不一致' })
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: '邮箱格式不正确' })
  }

  try {
    const existing = await User.findByUsername(username)
    if (existing) {
      return res.status(409).json({ success: false, message: '用户名已存在' })
    }

    if (email && (await User.isEmailTaken(email))) {
      return res.status(409).json({ success: false, message: '邮箱已被占用' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const userId = await User.create({
      username,
      real_name: realName,
      password: hashedPassword,
      email: email || null,
      status_code: 'ACTIVE',
    })

    try {
      const defaultRoleId = await User.findDefaultRegisterRoleId()
      if (!defaultRoleId) {
        await User.delete(userId)
        return res.status(500).json({ success: false, message: '系统未配置默认角色，请联系管理员' })
      }
      await User.setRoles(userId, [defaultRoleId])
    } catch (roleErr) {
      await User.delete(userId).catch(() => {})
      throw roleErr
    }

    const createdUser = await User.findById(userId)
    await UserChangeLog.create({
      actionType: UserChangeLog.ACTION_TYPES.REGISTER,
      source: 'SELF_REGISTER',
      targetUserId: userId,
      afterSnapshot: createdUser,
      operatorName: '系统',
    }).catch((error) => {
      console.error('写入注册日志失败:', error)
    })

    return res.status(201).json({
      success: true,
      message: '注册成功，请登录',
      data: { id: userId, username, real_name: realName, email: email || null },
    })
  } catch (err) {
    console.error('注册失败:', err)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '用户名或邮箱已存在' })
    }
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const login = async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' })
  }

  try {
    const user = await User.findByUsername(username)
    if (!user) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' })
    }

    const statusCode = normalizeStatusCode(user.status_code)
    if (statusCode !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: getStatusBlockMessage(statusCode) || '账号状态异常，禁止登录',
        data: { status_code: statusCode },
      })
    }

    await User.updateLastLoginById(user.id)

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
          real_name: user.real_name || '',
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

    const preference = await UserPreference.getByUserId(req.user.id)
    return res.json({ success: true, data: buildProfileResponse(user, preference) })
  } catch (err) {
    console.error('获取用户信息失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateProfile = async (req, res) => {
  const email = normalizeEmail(req.body.email)
  const realName = normalizeRealName(req.body.real_name)
  const mobile = normalizePhone(req.body.mobile)

  if (email !== undefined && email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: '邮箱格式不正确' })
  }
  if (mobile !== undefined && mobile && !/^[0-9+\-\s]{6,20}$/.test(mobile)) {
    return res.status(400).json({ success: false, message: '手机号格式不正确' })
  }
  if (realName !== undefined && (realName.length < 2 || realName.length > 32)) {
    return res.status(400).json({ success: false, message: '真实姓名长度需在 2-32 个字符之间' })
  }

  try {
    const existing = await User.findById(req.user.id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '用户不存在' })
    }

    const existingPreference = await UserPreference.getByUserId(req.user.id)

    const nextEmail = email === undefined ? existing.email || null : email
    const currentEmail = existing.email || null
    if (nextEmail && nextEmail !== currentEmail && (await User.isEmailTaken(nextEmail, req.user.id))) {
      return res.status(409).json({ success: false, message: '邮箱已被占用' })
    }

    const nextMobile = mobile === undefined ? existingPreference.mobile || '' : mobile
    const currentMobile = existingPreference.mobile || ''
    if (nextMobile && nextMobile !== currentMobile && (await UserPreference.isMobileTaken(nextMobile, req.user.id))) {
      return res.status(409).json({ success: false, message: '手机号已被占用' })
    }

    const nextRealName = realName === undefined ? String(existing.real_name || '').trim() : realName
    if (!nextRealName) {
      return res.status(400).json({ success: false, message: '真实姓名不能为空' })
    }

    await User.updateSelfProfile(req.user.id, { real_name: nextRealName, email: nextEmail })
    await UserPreference.upsertByUserId(req.user.id, { mobile: nextMobile })

    const updatedUser = await User.findById(req.user.id)
    const updatedPreference = await UserPreference.getByUserId(req.user.id)
    return res.json({
      success: true,
      message: '个人信息更新成功',
      data: buildProfileResponse(updatedUser, updatedPreference),
    })
  } catch (err) {
    console.error('更新个人信息失败:', err)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '邮箱或手机号已被占用' })
    }
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updatePassword = async (req, res) => {
  const oldPassword = String(req.body.old_password || '')
  const newPassword = String(req.body.new_password || '')
  const confirmPassword = String(req.body.confirm_password || '')

  if (!oldPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ success: false, message: '旧密码、新密码和确认密码不能为空' })
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: '新密码长度至少 6 个字符' })
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, message: '两次输入的新密码不一致' })
  }

  try {
    const authUser = await User.findAuthById(req.user.id)
    if (!authUser) {
      return res.status(404).json({ success: false, message: '用户不存在' })
    }

    const matched = await bcrypt.compare(oldPassword, authUser.password)
    if (!matched) {
      return res.status(400).json({ success: false, message: '旧密码不正确' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await User.updatePasswordById(req.user.id, passwordHash)
    return res.json({ success: true, message: '密码修改成功' })
  } catch (err) {
    console.error('修改密码失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getPreferences = async (req, res) => {
  try {
    const preferences = await UserPreference.getByUserId(req.user.id)
    return res.json({ success: true, data: preferences })
  } catch (err) {
    console.error('获取个人偏好失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updatePreferences = async (req, res) => {
  const rawDefaultHome = req.body.default_home
  const rawDateDisplayMode = req.body.date_display_mode
  const rawCompactDefault = req.body.demand_list_compact_default

  const defaultHome = rawDefaultHome === undefined ? undefined : normalizeDefaultHome(rawDefaultHome)
  const dateDisplayMode =
    rawDateDisplayMode === undefined ? undefined : normalizeDateDisplayMode(rawDateDisplayMode)
  const compactDefault = rawCompactDefault === undefined ? undefined : toBoolInt(rawCompactDefault)

  if (rawDefaultHome !== undefined && !defaultHome) {
    return res.status(400).json({ success: false, message: 'default_home 配置不合法' })
  }
  if (rawDateDisplayMode !== undefined && !dateDisplayMode) {
    return res.status(400).json({ success: false, message: 'date_display_mode 配置不合法' })
  }
  if (rawCompactDefault !== undefined && compactDefault === null) {
    return res.status(400).json({ success: false, message: 'demand_list_compact_default 配置不合法' })
  }

  try {
    const preferences = await UserPreference.upsertByUserId(req.user.id, {
      default_home: defaultHome,
      date_display_mode: dateDisplayMode,
      demand_list_compact_default: compactDefault,
    })

    return res.json({
      success: true,
      message: '偏好设置已保存',
      data: preferences,
    })
  } catch (err) {
    console.error('更新个人偏好失败:', err)
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

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  updatePassword,
  getPreferences,
  updatePreferences,
  getAccess,
}
