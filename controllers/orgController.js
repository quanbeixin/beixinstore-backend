const Department = require('../models/Department')
const User = require('../models/User')

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOptionalId(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeBool(value, defaultValue = 1) {
  if (value === undefined || value === null || value === '') return defaultValue
  return value === true || value === 'true' || value === 1 || value === '1' ? 1 : 0
}

function normalizeSort(value, defaultValue = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : defaultValue
}

const getDepartments = async (req, res) => {
  try {
    const mode = req.query.mode === 'tree' ? 'tree' : 'flat'
    const rows = mode === 'tree' ? await Department.listTree() : await Department.listFlat()
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('获取部门失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createDepartment = async (req, res) => {
  const name = normalizeText(req.body.name)
  const parentId = normalizeOptionalId(req.body.parent_id)
  const managerUserId = normalizeOptionalId(req.body.manager_user_id)
  const sortOrder = normalizeSort(req.body.sort_order, 0)
  const enabled = normalizeBool(req.body.enabled, 1)

  if (!name) {
    return res.status(400).json({ success: false, message: '部门名称不能为空' })
  }

  try {
    if (parentId) {
      const parent = await Department.findById(parentId)
      if (!parent) {
        return res.status(400).json({ success: false, message: '上级部门不存在' })
      }
    }

    if (managerUserId) {
      const manager = await User.findById(managerUserId)
      if (!manager) {
        return res.status(400).json({ success: false, message: '部门负责人不存在' })
      }
    }

    const id = await Department.create({
      name,
      parentId,
      managerUserId,
      sortOrder,
      enabled,
    })

    const created = await Department.findById(id)
    return res.status(201).json({ success: true, message: '创建成功', data: created })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '部门名称重复' })
    }

    console.error('创建部门失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateDepartment = async (req, res) => {
  const id = Number(req.params.id)
  const name = normalizeText(req.body.name)
  const parentId = normalizeOptionalId(req.body.parent_id)
  const managerUserId = normalizeOptionalId(req.body.manager_user_id)
  const sortOrder = normalizeSort(req.body.sort_order, 0)
  const enabled = normalizeBool(req.body.enabled, 1)

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: '无效的部门 ID' })
  }

  if (!name) {
    return res.status(400).json({ success: false, message: '部门名称不能为空' })
  }

  if (parentId && parentId === id) {
    return res.status(400).json({ success: false, message: '上级部门不能是自己' })
  }

  try {
    const existing = await Department.findById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '部门不存在' })
    }

    if (parentId) {
      const parent = await Department.findById(parentId)
      if (!parent) {
        return res.status(400).json({ success: false, message: '上级部门不存在' })
      }
    }

    if (managerUserId) {
      const manager = await User.findById(managerUserId)
      if (!manager) {
        return res.status(400).json({ success: false, message: '部门负责人不存在' })
      }
    }

    await Department.update(id, {
      name,
      parentId,
      managerUserId,
      sortOrder,
      enabled,
    })

    const updated = await Department.findById(id)
    return res.json({ success: true, message: '更新成功', data: updated })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '部门名称重复' })
    }

    console.error('更新部门失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteDepartment = async (req, res) => {
  const id = Number(req.params.id)

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: '无效的部门 ID' })
  }

  try {
    const existing = await Department.findById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '部门不存在' })
    }

    const childrenCount = await Department.countChildren(id)
    if (childrenCount > 0) {
      return res.status(409).json({ success: false, message: '请先删除子部门' })
    }

    const userCount = await Department.countUsersInDepartment(id)
    if (userCount > 0) {
      return res.status(409).json({ success: false, message: '部门下仍有关联用户，无法删除' })
    }

    await Department.remove(id)
    return res.json({ success: true, message: '删除成功' })
  } catch (err) {
    console.error('删除部门失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getUserDepartments = async (req, res) => {
  const userId = Number(req.params.userId)

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, message: '无效的用户 ID' })
  }

  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' })
    }

    const departments = await Department.listUserDepartments(userId)
    return res.json({
      success: true,
      data: {
        user_id: userId,
        departments,
      },
    })
  } catch (err) {
    console.error('获取用户部门关系失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const setUserDepartments = async (req, res) => {
  const userId = Number(req.params.userId)
  const departmentIds = Array.isArray(req.body.department_ids) ? req.body.department_ids : []
  const primaryDepartmentId = normalizeOptionalId(req.body.primary_department_id)

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, message: '无效的用户 ID' })
  }

  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' })
    }

    for (const deptId of departmentIds) {
      const dept = await Department.findById(deptId)
      if (!dept) {
        return res.status(400).json({ success: false, message: `部门不存在: ${deptId}` })
      }
    }

    if (primaryDepartmentId) {
      const primaryDept = await Department.findById(primaryDepartmentId)
      if (!primaryDept) {
        return res.status(400).json({ success: false, message: '主部门不存在' })
      }
    }

    const result = await Department.setUserDepartments(userId, {
      departmentIds,
      primaryDepartmentId,
    })

    const departments = await Department.listUserDepartments(userId)

    return res.json({
      success: true,
      message: '用户部门分配成功',
      data: {
        ...result,
        departments,
      },
    })
  } catch (err) {
    console.error('设置用户部门关系失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getUserDepartments,
  setUserDepartments,
}
