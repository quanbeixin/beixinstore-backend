const pool = require('../utils/db')

function isMissingTableError(err) {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146)
}

function isMissingColumnError(err) {
  return err && err.code === 'ER_BAD_FIELD_ERROR'
}

function normalizeRoleKey(rawKey, fallbackName = '') {
  const key = (rawKey || '').trim().toUpperCase()
  if (key) return key

  const name = String(fallbackName || '').trim().toLowerCase()
  if (name.includes('超级') || name.includes('super')) return 'SUPER_ADMIN'
  if (name.includes('管理') || name.includes('admin')) return 'ADMIN'
  return 'USER'
}

const Permission = {
  async getUserRoles(userId) {
    try {
      const [rows] = await pool.query(
        `SELECT r.id, r.name, r.role_key, r.role_level
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ?
         ORDER BY r.id ASC`,
        [userId],
      )

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        role_key: normalizeRoleKey(row.role_key, row.name),
        role_level: Number.isFinite(Number(row.role_level)) ? Number(row.role_level) : 0,
      }))
    } catch (err) {
      if (isMissingColumnError(err)) {
        const [rows] = await pool.query(
          `SELECT r.id, r.name
           FROM user_roles ur
           INNER JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = ?
           ORDER BY r.id ASC`,
          [userId],
        )

        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          role_key: normalizeRoleKey('', row.name),
          role_level: 0,
        }))
      }

      if (!isMissingTableError(err)) {
        throw err
      }

      const [rows] = await pool.query(
        'SELECT id, username, role FROM users WHERE id = ?',
        [userId],
      )

      if (!rows[0]) return []

      const roleKey = normalizeRoleKey(rows[0].role, rows[0].role)
      return [
        {
          id: 0,
          name: rows[0].role || 'user',
          role_key: roleKey,
          role_level: roleKey === 'SUPER_ADMIN' ? 100 : roleKey === 'ADMIN' ? 50 : 10,
        },
      ]
    }
  },

  async getUserPermissionCodes(userId) {
    try {
      const [rows] = await pool.query(
        `SELECT DISTINCT p.permission_code
         FROM user_roles ur
         INNER JOIN role_permissions rp ON rp.role_id = ur.role_id
         INNER JOIN permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = ?
         ORDER BY p.permission_code ASC`,
        [userId],
      )

      return {
        codes: rows.map((row) => row.permission_code).filter(Boolean),
        permissionReady: true,
      }
    } catch (err) {
      if (isMissingTableError(err) || isMissingColumnError(err)) {
        return {
          codes: [],
          permissionReady: false,
        }
      }

      throw err
    }
  },

  async getUserAccess(userId) {
    const roles = await this.getUserRoles(userId)
    const { codes, permissionReady } = await this.getUserPermissionCodes(userId)

    const roleKeys = [...new Set(roles.map((item) => item.role_key).filter(Boolean))]
    const isSuperAdmin = roleKeys.includes('SUPER_ADMIN')

    return {
      user_id: Number(userId),
      roles,
      role_keys: roleKeys,
      role_names: roles.map((item) => item.name).filter(Boolean),
      is_super_admin: isSuperAdmin,
      permission_ready: permissionReady,
      permission_codes: isSuperAdmin ? ['*'] : codes,
    }
  },
}

module.exports = Permission
