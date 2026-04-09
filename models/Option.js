const pool = require('../utils/db')

const TYPE_CONFIG = {
  roles: {
    table: 'roles',
    refChecks: [{ table: 'user_roles', field: 'role_id' }],
  },
}

function getTypeConfig(type) {
  return TYPE_CONFIG[type] || null
}

function normalizeRoleKey(value) {
  return String(value || '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 64)
}

async function isRoleKeyTaken(roleKey, excludeId = null) {
  if (!roleKey) return false
  if (excludeId) {
    const [rows] = await pool.query('SELECT id FROM roles WHERE role_key = ? AND id <> ? LIMIT 1', [
      roleKey,
      excludeId,
    ])
    return rows.length > 0
  }

  const [rows] = await pool.query('SELECT id FROM roles WHERE role_key = ? LIMIT 1', [roleKey])
  return rows.length > 0
}

function buildDefaultRoleKey(id) {
  return `ROLE_${Number(id) || 0}`
}

const Option = {
  types: Object.keys(TYPE_CONFIG),

  isValidType(type) {
    return Boolean(getTypeConfig(type))
  },

  async listByType(type) {
    const config = getTypeConfig(type)
    if (type === 'roles') {
      const [rows] = await pool.query(
        `SELECT id, name, role_key, enabled, role_level, is_builtin
         FROM ${config.table}
         ORDER BY id ASC`,
      )
      return rows
    }
    const [rows] = await pool.query(`SELECT id, name FROM ${config.table} ORDER BY id ASC`)
    return rows
  },

  async findById(type, id) {
    const config = getTypeConfig(type)
    if (type === 'roles') {
      const [rows] = await pool.query(
        `SELECT id, name, role_key, enabled, role_level, is_builtin
         FROM ${config.table}
         WHERE id = ?`,
        [id],
      )
      return rows[0] || null
    }
    const [rows] = await pool.query(`SELECT id, name FROM ${config.table} WHERE id = ?`, [id])
    return rows[0] || null
  },

  async findByName(type, name) {
    const config = getTypeConfig(type)
    const [rows] = await pool.query(`SELECT id, name FROM ${config.table} WHERE name = ?`, [name])
    return rows[0] || null
  },

  async create(type, payload) {
    const config = getTypeConfig(type)
    const name = typeof payload === 'object' ? payload?.name : payload
    const roleKeyRaw = typeof payload === 'object' ? payload?.role_key : ''
    const normalizedRoleKey = normalizeRoleKey(roleKeyRaw)

    if (type !== 'roles') {
      const [result] = await pool.query(`INSERT INTO ${config.table} (name) VALUES (?)`, [name])
      return result.insertId
    }

    if (normalizedRoleKey && (await isRoleKeyTaken(normalizedRoleKey))) {
      const err = new Error('角色标识已存在')
      err.code = 'ROLE_KEY_EXISTS'
      throw err
    }

    const [result] = await pool.query(`INSERT INTO ${config.table} (name) VALUES (?)`, [name])
    const insertedId = Number(result.insertId)
    const finalRoleKey = normalizedRoleKey || buildDefaultRoleKey(insertedId)

    await pool.query(`UPDATE ${config.table} SET role_key = ? WHERE id = ?`, [finalRoleKey, insertedId])
    return insertedId
  },

  async update(type, id, payload) {
    const config = getTypeConfig(type)
    const name = typeof payload === 'object' ? payload?.name : payload
    const hasRoleKeyField = typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'role_key')
    const roleKeyRaw = hasRoleKeyField ? payload?.role_key : undefined

    if (type !== 'roles') {
      const [result] = await pool.query(`UPDATE ${config.table} SET name = ? WHERE id = ?`, [name, id])
      return result.affectedRows
    }

    const [rows] = await pool.query(`SELECT id, role_key FROM ${config.table} WHERE id = ? LIMIT 1`, [id])
    const existing = rows[0]
    if (!existing) return 0

    const currentRoleKey = normalizeRoleKey(existing.role_key)
    const nextRoleKey = hasRoleKeyField
      ? normalizeRoleKey(roleKeyRaw) || buildDefaultRoleKey(id)
      : currentRoleKey || buildDefaultRoleKey(id)

    if (await isRoleKeyTaken(nextRoleKey, id)) {
      const err = new Error('角色标识已存在')
      err.code = 'ROLE_KEY_EXISTS'
      throw err
    }

    const [result] = await pool.query(`UPDATE ${config.table} SET name = ?, role_key = ? WHERE id = ?`, [
      name,
      nextRoleKey,
      id,
    ])
    return result.affectedRows
  },

  async remove(type, id) {
    const config = getTypeConfig(type)

    if (Array.isArray(config.refChecks) && config.refChecks.length > 0) {
      for (const refCheck of config.refChecks) {
        const [rows] = await pool.query(
          `SELECT COUNT(*) AS total FROM ${refCheck.table} WHERE ${refCheck.field} = ?`,
          [id],
        )

        if (rows[0].total > 0) {
          const err = new Error('选项正在被使用，无法删除')
          err.code = 'OPTION_IN_USE'
          throw err
        }
      }
    }

    const [result] = await pool.query(`DELETE FROM ${config.table} WHERE id = ?`, [id])
    return result.affectedRows
  },
}

module.exports = Option
