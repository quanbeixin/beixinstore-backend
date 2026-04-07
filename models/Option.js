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

const Option = {
  types: Object.keys(TYPE_CONFIG),

  isValidType(type) {
    return Boolean(getTypeConfig(type))
  },

  async listByType(type) {
    const config = getTypeConfig(type)
    const [rows] = await pool.query(`SELECT id, name FROM ${config.table} ORDER BY id ASC`)
    return rows
  },

  async findById(type, id) {
    const config = getTypeConfig(type)
    const [rows] = await pool.query(`SELECT id, name FROM ${config.table} WHERE id = ?`, [id])
    return rows[0] || null
  },

  async findByName(type, name) {
    const config = getTypeConfig(type)
    const [rows] = await pool.query(`SELECT id, name FROM ${config.table} WHERE name = ?`, [name])
    return rows[0] || null
  },

  async create(type, name) {
    const config = getTypeConfig(type)
    const [result] = await pool.query(`INSERT INTO ${config.table} (name) VALUES (?)`, [name])
    return result.insertId
  },

  async update(type, id, name) {
    const config = getTypeConfig(type)
    const [result] = await pool.query(`UPDATE ${config.table} SET name = ? WHERE id = ?`, [name, id])
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
