const bcrypt = require('bcryptjs')
const User = require('../models/User')
const Department = require('../models/Department')

function normalizeStatusCode(value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return normalized || 'ACTIVE'
}

function normalizeOptionalId(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeRoleIds(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => Number(item)).filter((num) => Number.isInteger(num) && num > 0))]
}

function normalizeRealName(value) {
  return String(value || '').trim().slice(0, 32)
}

function normalizeEmail(value) {
  if (value === undefined) return undefined
  const email = String(value || '').trim()
  return email || null
}

function normalizeIncludeInMetrics(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 1 || value === '1') return 1
  if (value === false || value === 0 || value === '0') return 0

  const normalized = String(value).trim().toLowerCase()
  if (['true', 'yes', 'y', 'on'].includes(normalized)) return 1
  if (['false', 'no', 'n', 'off'].includes(normalized)) return 0
  return fallback
}

function normalizeSortBy(value) {
  const sortBy = String(value || '').trim().toLowerCase()
  if (!sortBy) return 'real_name'
  const allowList = new Set(['created_at', 'username', 'real_name'])
  return allowList.has(sortBy) ? sortBy : 'real_name'
}

function normalizeSortOrder(value) {
  const sortOrder = String(value || '').trim().toLowerCase()
  if (sortOrder === 'asc' || sortOrder === 'desc') return sortOrder
  return 'asc'
}

// 获取用户列表（支持分页和关键字搜索）
const getUsers = async (req, res) => {
  const { page = 1, pageSize = 10, keyword = '' } = req.query
  const sortBy = normalizeSortBy(req.query.sort_by)
  const sortOrder = normalizeSortOrder(req.query.sort_order)

  try {
    const { rows, total } = await User.findAll({
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
      keyword,
      sortBy,
      sortOrder,
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
  const { username, password, email, department_id, role_ids, status_code, include_in_metrics } = req.body
  const realName = normalizeRealName(req.body.real_name)
  const normalizedEmail = normalizeEmail(email)

  if (!username || !password || !realName) {
    return res.status(400).json({ success: false, message: '用户名、真实姓名和密码不能为空' })
  }

  if (realName.length < 2 || realName.length > 32) {
    return res.status(400).json({ success: false, message: '真实姓名长度需在 2-32 个字符之间' })
  }

  try {
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: '邮箱格式不正确' })
    }

    const departmentId = normalizeOptionalId(department_id)
    if (department_id !== undefined && department_id !== null && department_id !== '' && !departmentId) {
      return res.status(400).json({ success: false, message: 'department_id 无效' })
    }

    if (departmentId) {
      const department = await Department.findById(departmentId)
      if (!department) {
        return res.status(400).json({ success: false, message: '部门不存在' })
      }
    }

    const roleIds = normalizeRoleIds(role_ids)

    const existing = await User.findByUsername(username)
    if (existing) {
      return res.status(409).json({ success: false, message: '用户名已存在' })
    }
    if (normalizedEmail && (await User.isEmailTaken(normalizedEmail))) {
      return res.status(409).json({ success: false, message: '邮箱已被占用' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const userId = await User.create({
      username,
      real_name: realName,
      password: hashedPassword,
      email: normalizedEmail,
      department_id: departmentId,
      status_code: normalizeStatusCode(status_code),
      include_in_metrics: normalizeIncludeInMetrics(include_in_metrics, 1),
    })

    if (roleIds.length > 0) {
      await User.setRoles(userId, roleIds)
    }

    const user = await User.findById(userId)
    return res.status(201).json({ success: true, message: '创建成功', data: user })
  } catch (err) {
    console.error('创建用户失败:', err)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '用户名已存在' })
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ success: false, message: '部门或角色数据无效，请刷新后重试' })
    }
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

// 通过 POST 更新用户信息（POST /api/users/:id/update）
const updateUser = async (req, res) => {
  const { id } = req.params
  const { email, department_id, role_ids, status_code, include_in_metrics } = req.body
  const realNameRaw = req.body.real_name
  const realName = normalizeRealName(realNameRaw)
  const normalizedEmail = normalizeEmail(email)

  try {
    const departmentId = normalizeOptionalId(department_id)
    if (department_id !== undefined && department_id !== null && department_id !== '' && !departmentId) {
      return res.status(400).json({ success: false, message: 'department_id 无效' })
    }

    if (departmentId) {
      const department = await Department.findById(departmentId)
      if (!department) {
        return res.status(400).json({ success: false, message: '部门不存在' })
      }
    }

    const roleIds = normalizeRoleIds(role_ids)

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' })
    }

    const nextEmail = normalizedEmail === undefined ? user.email || null : normalizedEmail
    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      return res.status(400).json({ success: false, message: '邮箱格式不正确' })
    }
    if (nextEmail && nextEmail !== (user.email || null) && (await User.isEmailTaken(nextEmail, Number(id)))) {
      return res.status(409).json({ success: false, message: '邮箱已被占用' })
    }

    const nextRealName = realNameRaw === undefined ? String(user.real_name || '').trim() : realName
    if (!nextRealName) {
      return res.status(400).json({ success: false, message: '真实姓名不能为空' })
    }
    if (nextRealName.length < 2 || nextRealName.length > 32) {
      return res.status(400).json({ success: false, message: '真实姓名长度需在 2-32 个字符之间' })
    }

    await User.update(id, {
      real_name: nextRealName,
      email: nextEmail,
      department_id: departmentId,
      status_code: normalizeStatusCode(status_code),
      include_in_metrics: normalizeIncludeInMetrics(
        include_in_metrics,
        Number(user?.include_in_metrics ?? 1) === 1 ? 1 : 0,
      ),
    })

    if (Array.isArray(role_ids)) {
      await User.setRoles(id, roleIds)
    }

    const updated = await User.findById(id)
    return res.json({ success: true, message: '更新成功', data: updated })
  } catch (err) {
    console.error('更新用户失败:', err)
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '邮箱已被占用' })
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({ success: false, message: '部门或角色数据无效，请刷新后重试' })
    }
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
