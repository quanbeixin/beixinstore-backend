const bcrypt = require('bcryptjs')
const User = require('../models/User')
const Permission = require('../models/Permission')
const UserPreference = require('../models/UserPreference')
const { generateToken } = require('../utils/jwt')

function normalizeStatusCode(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return code || 'ACTIVE'
}

function getStatusBlockMessage(statusCode) {
  if (statusCode === 'INACTIVE') return '璐﹀彿鏈縺娲伙紝璇疯仈绯荤鐞嗗憳'
  if (statusCode === 'DISABLED') return '璐﹀彿宸插仠鐢紝璇疯仈绯荤鐞嗗憳'
  if (statusCode === 'LOCKED') return '璐﹀彿宸查攣瀹氾紝璇疯仈绯荤鐞嗗憳'
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
  const allowed = new Set(['/work-logs', '/work-demands', '/owner-workbench', '/performance-dashboard'])
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
    return res.status(400).json({ success: false, message: '鐢ㄦ埛鍚嶉暱搴﹀繀椤诲湪 3-20 涓瓧绗︿箣闂?' })
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ success: false, message: '鐢ㄦ埛鍚嶅彧鑳藉寘鍚瓧姣嶃€佹暟瀛楀拰涓嬪垝绾?' })
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: '瀵嗙爜闀垮害鑷冲皯 6 涓瓧绗?' })
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, message: '涓ゆ杈撳叆鐨勫瘑鐮佷笉涓€鑷?' })
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: '閭鏍煎紡涓嶆纭?' })
  }

  try {
    const existing = await User.findByUsername(username)
    if (existing) {
      return res.status(409).json({ success: false, message: '鐢ㄦ埛鍚嶅凡瀛樺湪' })
    }

    if (email && (await User.isEmailTaken(email))) {
      return res.status(409).json({ success: false, message: '閭宸茶鍗犵敤' })
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
        return res.status(500).json({ success: false, message: '绯荤粺鏈厤缃粯璁よ鑹诧紝璇疯仈绯荤鐞嗗憳' })
      }
      await User.setRoles(userId, [defaultRoleId])
    } catch (roleErr) {
      await User.delete(userId).catch(() => {})
      throw roleErr
    }

    return res.status(201).json({
      success: true,
      message: '娉ㄥ唽鎴愬姛锛岃鐧诲綍',
      data: { id: userId, username, real_name: realName, email: email || null },
    })
  } catch (err) {
    console.error('娉ㄥ唽澶辫触:', err)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '鐢ㄦ埛鍚嶆垨閭宸插瓨鍦?' })
    }
    return res.status(500).json({ success: false, message: '鏈嶅姟鍣ㄩ敊璇?' })
  }
}

const login = async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ success: false, message: '鐢ㄦ埛鍚嶅拰瀵嗙爜涓嶈兘涓虹┖' })
  }

  try {
    const user = await User.findByUsername(username)
    if (!user) {
      return res.status(401).json({ success: false, message: '鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒' })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ success: false, message: '鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒' })
    }

    const statusCode = normalizeStatusCode(user.status_code)
    if (statusCode !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: getStatusBlockMessage(statusCode) || '璐﹀彿鐘舵€佸紓甯革紝绂佹鐧诲綍',
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
      message: '鐧诲綍鎴愬姛',
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
    console.error('鐧诲綍澶辫触:', err)
    return res.status(500).json({ success: false, message: '鏈嶅姟鍣ㄩ敊璇?' })
  }
}

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ success: false, message: '鐢ㄦ埛涓嶅瓨鍦?' })
    }

    const preference = await UserPreference.getByUserId(req.user.id)
    return res.json({ success: true, data: buildProfileResponse(user, preference) })
  } catch (err) {
    console.error('鑾峰彇鐢ㄦ埛淇℃伅澶辫触:', err)
    return res.status(500).json({ success: false, message: '鏈嶅姟鍣ㄩ敊璇?' })
  }
}

const updateProfile = async (req, res) => {
  const email = normalizeEmail(req.body.email)
  const realName = normalizeRealName(req.body.real_name)
  const mobile = normalizePhone(req.body.mobile)

  if (email !== undefined && email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: '閭鏍煎紡涓嶆纭?' })
  }
  if (mobile !== undefined && mobile && !/^[0-9+\-\s]{6,20}$/.test(mobile)) {
    return res.status(400).json({ success: false, message: '鎵嬫満鍙锋牸寮忎笉姝ｇ‘' })
  }
  if (realName !== undefined && (realName.length < 2 || realName.length > 32)) {
    return res.status(400).json({ success: false, message: '鐪熷疄濮撳悕闀垮害闇€鍦?2-32 涓瓧绗︿箣闂?' })
  }

  try {
    const existing = await User.findById(req.user.id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '鐢ㄦ埛涓嶅瓨鍦?' })
    }

    const existingPreference = await UserPreference.getByUserId(req.user.id)

    const nextEmail = email === undefined ? existing.email || null : email
    const currentEmail = existing.email || null
    if (nextEmail && nextEmail !== currentEmail && (await User.isEmailTaken(nextEmail, req.user.id))) {
      return res.status(409).json({ success: false, message: '閭宸茶鍗犵敤' })
    }

    const nextMobile = mobile === undefined ? existingPreference.mobile || '' : mobile
    const currentMobile = existingPreference.mobile || ''
    if (nextMobile && nextMobile !== currentMobile && (await UserPreference.isMobileTaken(nextMobile, req.user.id))) {
      return res.status(409).json({ success: false, message: '鎵嬫満鍙峰凡琚崰鐢?' })
    }

    const nextRealName = realName === undefined ? String(existing.real_name || '').trim() : realName
    if (!nextRealName) {
      return res.status(400).json({ success: false, message: '鐪熷疄濮撳悕涓嶈兘涓虹┖' })
    }

    await User.updateSelfProfile(req.user.id, { real_name: nextRealName, email: nextEmail })
    await UserPreference.upsertByUserId(req.user.id, { mobile: nextMobile })

    const updatedUser = await User.findById(req.user.id)
    const updatedPreference = await UserPreference.getByUserId(req.user.id)
    return res.json({
      success: true,
      message: '涓汉淇℃伅鏇存柊鎴愬姛',
      data: buildProfileResponse(updatedUser, updatedPreference),
    })
  } catch (err) {
    console.error('鏇存柊涓汉淇℃伅澶辫触:', err)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '閭鎴栨墜鏈哄彿宸茶鍗犵敤' })
    }
    return res.status(500).json({ success: false, message: '鏈嶅姟鍣ㄩ敊璇?' })
  }
}

const updatePassword = async (req, res) => {
  const oldPassword = String(req.body.old_password || '')
  const newPassword = String(req.body.new_password || '')
  const confirmPassword = String(req.body.confirm_password || '')

  if (!oldPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ success: false, message: '鏃у瘑鐮併€佹柊瀵嗙爜鍜岀‘璁ゅ瘑鐮佷笉鑳戒负绌?' })
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: '鏂板瘑鐮侀暱搴﹁嚦灏?6 涓瓧绗?' })
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, message: '涓ゆ杈撳叆鐨勬柊瀵嗙爜涓嶄竴鑷?' })
  }

  try {
    const authUser = await User.findAuthById(req.user.id)
    if (!authUser) {
      return res.status(404).json({ success: false, message: '鐢ㄦ埛涓嶅瓨鍦?' })
    }

    const matched = await bcrypt.compare(oldPassword, authUser.password)
    if (!matched) {
      return res.status(400).json({ success: false, message: '鏃у瘑鐮佷笉姝ｇ‘' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await User.updatePasswordById(req.user.id, passwordHash)
    return res.json({ success: true, message: '瀵嗙爜淇敼鎴愬姛' })
  } catch (err) {
    console.error('淇敼瀵嗙爜澶辫触:', err)
    return res.status(500).json({ success: false, message: '鏈嶅姟鍣ㄩ敊璇?' })
  }
}

const getPreferences = async (req, res) => {
  try {
    const preferences = await UserPreference.getByUserId(req.user.id)
    return res.json({ success: true, data: preferences })
  } catch (err) {
    console.error('鑾峰彇涓汉鍋忓ソ澶辫触:', err)
    return res.status(500).json({ success: false, message: '鏈嶅姟鍣ㄩ敊璇?' })
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
    return res.status(400).json({ success: false, message: 'default_home 閰嶇疆涓嶅悎娉?' })
  }
  if (rawDateDisplayMode !== undefined && !dateDisplayMode) {
    return res.status(400).json({ success: false, message: 'date_display_mode 閰嶇疆涓嶅悎娉?' })
  }
  if (rawCompactDefault !== undefined && compactDefault === null) {
    return res.status(400).json({ success: false, message: 'demand_list_compact_default 閰嶇疆涓嶅悎娉?' })
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
    console.error('鏇存柊涓汉鍋忓ソ澶辫触:', err)
    return res.status(500).json({ success: false, message: '鏈嶅姟鍣ㄩ敊璇?' })
  }
}

const getAccess = async (req, res) => {
  try {
    const access = req.userAccess || (await Permission.getUserAccess(req.user.id))
    return res.json({ success: true, data: access })
  } catch (err) {
    console.error('鑾峰彇璁块棶鏉冮檺澶辫触:', err)
    return res.status(500).json({ success: false, message: '鏈嶅姟鍣ㄩ敊璇?' })
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


