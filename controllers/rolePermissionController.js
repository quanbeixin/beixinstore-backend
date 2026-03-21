const RolePermission = require('../models/RolePermission')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizePermissionIds(value) {
  if (!Array.isArray(value)) return []
  return value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
}

function normalizeMenuKey(value) {
  return String(value || '').trim()
}

function normalizeRoleKeys(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
}

function normalizeDepartmentIds(value) {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .map((item) => toPositiveInt(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  ]
}

function normalizeScopeType(value, fallback = 'ALL') {
  const raw = String(value || fallback).trim().toUpperCase()
  return RolePermission.MENU_SCOPE_TYPES[raw] ? raw : fallback
}

const getRoles = async (req, res) => {
  try {
    const rows = await RolePermission.listRoles()
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Failed to list roles:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getPermissions = async (req, res) => {
  try {
    const rows = await RolePermission.listPermissions()
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('Failed to list permissions:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getRolePermissions = async (req, res) => {
  const roleId = toPositiveInt(req.params.roleId)
  if (!roleId) {
    return res.status(400).json({ success: false, message: '无效的角色 ID' })
  }

  try {
    const role = await RolePermission.getRoleById(roleId)
    if (!role) {
      return res.status(404).json({ success: false, message: '角色不存在' })
    }

    const permissionIds = await RolePermission.getRolePermissionIds(roleId)
    return res.json({
      success: true,
      data: {
        role,
        permission_ids: permissionIds,
      },
    })
  } catch (err) {
    console.error('Failed to get role permissions:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateRolePermissions = async (req, res) => {
  const roleId = toPositiveInt(req.params.roleId)
  if (!roleId) {
    return res.status(400).json({ success: false, message: '无效的角色 ID' })
  }

  const permissionIds = normalizePermissionIds(req.body.permission_ids)

  try {
    const role = await RolePermission.getRoleById(roleId)
    if (!role) {
      return res.status(404).json({ success: false, message: '角色不存在' })
    }

    if (role.role_key === 'SUPER_ADMIN') {
      return res.status(400).json({ success: false, message: '超级管理员角色权限不允许修改' })
    }

    const savedIds = await RolePermission.setRolePermissions(roleId, permissionIds)

    return res.json({
      success: true,
      message: '角色权限已更新',
      data: {
        role_id: roleId,
        permission_ids: savedIds,
      },
    })
  } catch (err) {
    if (err.code === 'INVALID_PERMISSION_IDS') {
      return res.status(400).json({ success: false, message: err.message })
    }

    console.error('Failed to update role permissions:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getMenuVisibilityRules = async (req, res) => {
  try {
    const rows = await RolePermission.listMenuVisibilityRules()
    return res.json({
      success: true,
      data: {
        rules: rows,
      },
    })
  } catch (err) {
    console.error('Failed to list menu visibility rules:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getMenuVisibilityDepartments = async (req, res) => {
  try {
    const rows = await RolePermission.listDepartmentsSimple()
    return res.json({
      success: true,
      data: rows,
    })
  } catch (err) {
    console.error('Failed to list departments for menu visibility:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateMenuVisibilityRule = async (req, res) => {
  const menuKey = normalizeMenuKey(req.body.menu_key)
  const roleKeys = normalizeRoleKeys(req.body.role_keys)
  const departmentId = toPositiveInt(req.body.department_id)
  const payloadDepartmentIds = normalizeDepartmentIds(req.body.department_ids)
  const departmentIds =
    payloadDepartmentIds.length > 0 ? payloadDepartmentIds : normalizeDepartmentIds([departmentId])

  // Backward compatibility:
  // old payload only had role_keys. role_keys present => ROLE, otherwise ALL.
  const fallbackScopeType = roleKeys.length > 0 ? 'ROLE' : 'ALL'
  const scopeType = normalizeScopeType(req.body.scope_type, fallbackScopeType)

  if (!menuKey) {
    return res.status(400).json({ success: false, message: 'menu_key 不能为空' })
  }

  if (menuKey.length > 128) {
    return res.status(400).json({ success: false, message: 'menu_key 长度不能超过 128' })
  }

  try {
    const savedRule = await RolePermission.setMenuVisibilityRule(menuKey, {
      scope_type: scopeType,
      department_id: departmentId,
      department_ids: departmentIds,
      role_keys: roleKeys,
    })

    return res.json({
      success: true,
      message: '菜单可见规则已更新',
      data: savedRule,
    })
  } catch (err) {
    if (['INVALID_MENU_KEY', 'INVALID_ROLE_KEYS', 'INVALID_DEPARTMENT_ID'].includes(err.code)) {
      return res.status(400).json({ success: false, message: err.message })
    }

    console.error('Failed to update menu visibility rule:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getMyMenuVisibility = async (req, res) => {
  try {
    const access = req.userAccess || {}
    const menuAccessMap = await RolePermission.getMyMenuAccessMap(req.user.id, {
      is_super_admin: access.is_super_admin,
      role_keys: Array.isArray(access.role_keys) ? access.role_keys : [],
    })

    return res.json({
      success: true,
      data: {
        menu_access_map: menuAccessMap,
      },
    })
  } catch (err) {
    console.error('Failed to compute my menu visibility:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  getRoles,
  getPermissions,
  getRolePermissions,
  updateRolePermissions,
  getMenuVisibilityRules,
  getMenuVisibilityDepartments,
  updateMenuVisibilityRule,
  getMyMenuVisibility,
}
