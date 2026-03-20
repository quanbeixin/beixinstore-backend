const pool = require('../utils/db')

const MENU_SCOPE_TYPES = Object.freeze({
  ALL: 'ALL',
  ROLE: 'ROLE',
  DEPT_MEMBERS: 'DEPT_MEMBERS',
  DEPT_MANAGERS: 'DEPT_MANAGERS',
})

const MENU_SCOPE_SET = new Set(Object.values(MENU_SCOPE_TYPES))

let menuVisibilityTableReady = false

function isMissingTableError(err) {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146)
}

function isMissingColumnError(err) {
  return err && err.code === 'ER_BAD_FIELD_ERROR'
}

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeRoleKeys(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
}

function normalizeScopeType(value) {
  const scopeType = String(value || MENU_SCOPE_TYPES.ALL).trim().toUpperCase()
  return MENU_SCOPE_SET.has(scopeType) ? scopeType : MENU_SCOPE_TYPES.ALL
}

function parseRoleKeysJson(value) {
  if (Array.isArray(value)) {
    return normalizeRoleKeys(value)
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return normalizeRoleKeys(parsed)
    } catch {
      return []
    }
  }

  return []
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  )
  return Number(rows[0]?.total || 0) > 0
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [tableName, indexName],
  )
  return Number(rows[0]?.total || 0) > 0
}

async function ensureMenuVisibilityTable() {
  if (menuVisibilityTableReady) return

  await pool.query(
    `CREATE TABLE IF NOT EXISTS menu_visibility_rules (
      menu_key VARCHAR(128) NOT NULL,
      scope_type VARCHAR(32) NOT NULL DEFAULT 'ALL',
      department_id INT DEFAULT NULL,
      role_keys_json JSON DEFAULT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (menu_key),
      KEY idx_scope_dept (scope_type, department_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  )

  if (!(await columnExists('menu_visibility_rules', 'scope_type'))) {
    await pool.query(
      "ALTER TABLE menu_visibility_rules ADD COLUMN scope_type VARCHAR(32) NOT NULL DEFAULT 'ALL' AFTER menu_key",
    )
  }

  if (!(await columnExists('menu_visibility_rules', 'department_id'))) {
    await pool.query('ALTER TABLE menu_visibility_rules ADD COLUMN department_id INT NULL AFTER scope_type')
  }

  if (!(await columnExists('menu_visibility_rules', 'role_keys_json'))) {
    await pool.query('ALTER TABLE menu_visibility_rules ADD COLUMN role_keys_json JSON NULL AFTER department_id')
  }

  if (!(await indexExists('menu_visibility_rules', 'idx_scope_dept'))) {
    await pool.query('CREATE INDEX idx_scope_dept ON menu_visibility_rules(scope_type, department_id)')
  }

  // Backward compatibility: old records only had role_keys_json; treat them as ROLE scope.
  await pool.query(
    `UPDATE menu_visibility_rules
     SET scope_type = 'ROLE'
     WHERE scope_type = 'ALL'
       AND role_keys_json IS NOT NULL
       AND JSON_VALID(role_keys_json)
       AND JSON_LENGTH(role_keys_json) > 0`,
  )

  menuVisibilityTableReady = true
}

const RolePermission = {
  MENU_SCOPE_TYPES,

  async listRoles() {
    const [rows] = await pool.query(
      `SELECT id, name, role_key, role_level, enabled, is_builtin
       FROM roles
       ORDER BY role_level DESC, id ASC`,
    )
    return rows
  },

  async listPermissions() {
    const [rows] = await pool.query(
      `SELECT id, permission_code, permission_name, module_key, enabled
       FROM permissions
       ORDER BY module_key ASC, permission_code ASC`,
    )
    return rows
  },

  async listDepartmentsSimple() {
    try {
      const [rows] = await pool.query(
        `SELECT id, name, parent_id, manager_user_id, enabled
         FROM departments
         ORDER BY id ASC`,
      )
      return rows
    } catch (err) {
      if (isMissingTableError(err)) {
        return []
      }

      if (isMissingColumnError(err)) {
        const [rows] = await pool.query(
          `SELECT id, name
           FROM departments
           ORDER BY id ASC`,
        )
        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          parent_id: null,
          manager_user_id: null,
          enabled: 1,
        }))
      }

      throw err
    }
  },

  async getRoleById(roleId) {
    const [rows] = await pool.query(
      `SELECT id, name, role_key, role_level, enabled, is_builtin
       FROM roles
       WHERE id = ?`,
      [roleId],
    )
    return rows[0] || null
  },

  async getRolePermissionIds(roleId) {
    const [rows] = await pool.query(
      'SELECT permission_id FROM role_permissions WHERE role_id = ? ORDER BY permission_id ASC',
      [roleId],
    )
    return rows.map((row) => Number(row.permission_id)).filter((id) => Number.isInteger(id))
  },

  async setRolePermissions(roleId, permissionIds = []) {
    const conn = await pool.getConnection()

    try {
      await conn.beginTransaction()

      const normalizedIds = [
        ...new Set(
          permissionIds
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      ]

      if (normalizedIds.length > 0) {
        const [existingRows] = await conn.query(
          `SELECT id FROM permissions WHERE id IN (${normalizedIds.map(() => '?').join(',')})`,
          normalizedIds,
        )

        const existingIds = new Set(existingRows.map((row) => Number(row.id)))
        const invalidIds = normalizedIds.filter((id) => !existingIds.has(id))

        if (invalidIds.length > 0) {
          const err = new Error(`无效的权限 ID: ${invalidIds.join(',')}`)
          err.code = 'INVALID_PERMISSION_IDS'
          throw err
        }
      }

      await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId])

      if (normalizedIds.length > 0) {
        const values = normalizedIds.map((permissionId) => [roleId, permissionId])
        await conn.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [values])
      }

      await conn.commit()
      return normalizedIds
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async listMenuVisibilityRules() {
    await ensureMenuVisibilityTable()

    const [rows] = await pool.query(
      `SELECT menu_key, scope_type, department_id, role_keys_json
       FROM menu_visibility_rules
       ORDER BY menu_key ASC`,
    )

    return rows.map((row) => ({
      menu_key: String(row.menu_key || ''),
      scope_type: normalizeScopeType(row.scope_type),
      department_id: toPositiveInt(row.department_id),
      role_keys: parseRoleKeysJson(row.role_keys_json),
    }))
  },

  async setMenuVisibilityRule(menuKey, payload = {}) {
    await ensureMenuVisibilityTable()

    const normalizedMenuKey = String(menuKey || '').trim()
    const scopeType = normalizeScopeType(payload.scope_type)
    const roleKeys = normalizeRoleKeys(payload.role_keys)
    const departmentId = toPositiveInt(payload.department_id)

    if (!normalizedMenuKey) {
      const err = new Error('menu_key 不能为空')
      err.code = 'INVALID_MENU_KEY'
      throw err
    }

    if (scopeType === MENU_SCOPE_TYPES.ALL) {
      await pool.query('DELETE FROM menu_visibility_rules WHERE menu_key = ?', [normalizedMenuKey])
      return {
        menu_key: normalizedMenuKey,
        scope_type: MENU_SCOPE_TYPES.ALL,
        department_id: null,
        role_keys: [],
      }
    }

    if (scopeType === MENU_SCOPE_TYPES.ROLE) {
      if (roleKeys.length === 0) {
        const err = new Error('ROLE 范围必须配置 role_keys')
        err.code = 'INVALID_ROLE_KEYS'
        throw err
      }

      const [existingRows] = await pool.query(
        `SELECT role_key
         FROM roles
         WHERE role_key IN (${roleKeys.map(() => '?').join(',')})`,
        roleKeys,
      )

      const existingRoleKeySet = new Set(existingRows.map((item) => item.role_key))
      const invalidRoleKeys = roleKeys.filter((item) => !existingRoleKeySet.has(item))

      if (invalidRoleKeys.length > 0) {
        const err = new Error(`无效的角色标识: ${invalidRoleKeys.join(',')}`)
        err.code = 'INVALID_ROLE_KEYS'
        throw err
      }
    }

    if (scopeType === MENU_SCOPE_TYPES.DEPT_MEMBERS || scopeType === MENU_SCOPE_TYPES.DEPT_MANAGERS) {
      if (!departmentId) {
        const err = new Error(`${scopeType} 范围必须配置 department_id`)
        err.code = 'INVALID_DEPARTMENT_ID'
        throw err
      }

      const [deptRows] = await pool.query('SELECT id FROM departments WHERE id = ? LIMIT 1', [departmentId])
      if (deptRows.length === 0) {
        const err = new Error('部门不存在')
        err.code = 'INVALID_DEPARTMENT_ID'
        throw err
      }
    }

    const roleKeysJson = scopeType === MENU_SCOPE_TYPES.ROLE ? JSON.stringify(roleKeys) : null
    const departmentIdValue =
      scopeType === MENU_SCOPE_TYPES.DEPT_MEMBERS || scopeType === MENU_SCOPE_TYPES.DEPT_MANAGERS
        ? departmentId
        : null

    await pool.query(
      `INSERT INTO menu_visibility_rules (menu_key, scope_type, department_id, role_keys_json)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         scope_type = VALUES(scope_type),
         department_id = VALUES(department_id),
         role_keys_json = VALUES(role_keys_json)`,
      [normalizedMenuKey, scopeType, departmentIdValue, roleKeysJson],
    )

    return {
      menu_key: normalizedMenuKey,
      scope_type: scopeType,
      department_id: departmentIdValue,
      role_keys: scopeType === MENU_SCOPE_TYPES.ROLE ? roleKeys : [],
    }
  },

  async getUserMenuContext(userId) {
    const [userRows] = await pool.query('SELECT id, department_id FROM users WHERE id = ? LIMIT 1', [userId])
    const user = userRows[0] || null
    if (!user) return null

    let managerRows = []

    try {
      const [rows] = await pool.query(
        'SELECT id FROM departments WHERE manager_user_id = ? ORDER BY id ASC',
        [userId],
      )
      managerRows = rows
    } catch (err) {
      if (!isMissingTableError(err) && !isMissingColumnError(err)) {
        throw err
      }
    }

    return {
      user_id: Number(user.id),
      department_id: toPositiveInt(user.department_id),
      managed_department_ids: managerRows
        .map((row) => toPositiveInt(row.id))
        .filter((id) => Number.isInteger(id)),
    }
  },

  async getMyMenuAccessMap(userId, access = {}) {
    const rules = await this.listMenuVisibilityRules()
    const roleKeys = normalizeRoleKeys(access.role_keys)
    const isSuperAdmin = Boolean(access.is_super_admin)

    if (isSuperAdmin) {
      const map = {}
      rules.forEach((rule) => {
        map[rule.menu_key] = true
      })
      return map
    }

    const userContext = await this.getUserMenuContext(userId)
    const userDepartmentId = userContext?.department_id || null
    const managedDepartmentIdSet = new Set(userContext?.managed_department_ids || [])

    const accessMap = {}

    rules.forEach((rule) => {
      let allowed = true

      if (rule.scope_type === MENU_SCOPE_TYPES.ROLE) {
        allowed = rule.role_keys.some((roleKey) => roleKeys.includes(roleKey))
      } else if (rule.scope_type === MENU_SCOPE_TYPES.DEPT_MEMBERS) {
        allowed = Boolean(userDepartmentId) && userDepartmentId === rule.department_id
      } else if (rule.scope_type === MENU_SCOPE_TYPES.DEPT_MANAGERS) {
        allowed = Boolean(rule.department_id) && managedDepartmentIdSet.has(rule.department_id)
      }

      accessMap[rule.menu_key] = Boolean(allowed)
    })

    return accessMap
  },
}

module.exports = RolePermission
