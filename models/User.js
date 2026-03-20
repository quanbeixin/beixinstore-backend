const pool = require('../utils/db')

function isMissingTableError(err) {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146)
}

async function syncPrimaryDepartment(userId, departmentId) {
  try {
    await pool.query('DELETE FROM user_departments WHERE user_id = ? AND is_primary = 1', [userId])

    if (!departmentId) return

    await pool.query(
      `INSERT INTO user_departments (user_id, department_id, is_primary)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE is_primary = VALUES(is_primary)`,
      [userId, departmentId],
    )
  } catch (err) {
    if (!isMissingTableError(err)) {
      throw err
    }
  }
}

const User = {
  findByUsername: async (username) => {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username])
    return rows[0] || null
  },

  findById: async (id) => {
    const [rows] = await pool.query(
      `SELECT
         u.id,
         u.username,
         u.email,
         u.department_id,
         COALESCE(u.status_code, 'ACTIVE') AS status_code,
         u.created_at,
         d.name AS department_name,
         GROUP_CONCAT(DISTINCT r.id) AS role_ids,
         GROUP_CONCAT(DISTINCT r.name) AS role_names
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.id = ?
       GROUP BY u.id`,
      [id],
    )
    return rows[0] || null
  },

  findAll: async ({ page = 1, pageSize = 10, keyword = '' }) => {
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`

    const [rows] = await pool.query(
      `SELECT
         u.id,
         u.username,
         u.email,
         u.department_id,
         COALESCE(u.status_code, 'ACTIVE') AS status_code,
         u.created_at,
         d.name AS department_name,
         GROUP_CONCAT(DISTINCT r.name) AS role_names
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.username LIKE ? OR u.email LIKE ?
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [like, like, pageSize, offset],
    )

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM users WHERE username LIKE ? OR email LIKE ?',
      [like, like],
    )

    return { rows, total }
  },

  create: async ({ username, password, email = null, department_id = null, status_code = 'ACTIVE' }) => {
    const [result] = await pool.query(
      'INSERT INTO users (username, password, email, department_id, status_code) VALUES (?, ?, ?, ?, ?)',
      [username, password, email, department_id, status_code],
    )

    await syncPrimaryDepartment(result.insertId, department_id)

    return result.insertId
  },

  update: async (id, { email, department_id, status_code = 'ACTIVE' }) => {
    const [result] = await pool.query(
      'UPDATE users SET email = ?, department_id = ?, status_code = ? WHERE id = ?',
      [email, department_id, status_code, id],
    )

    await syncPrimaryDepartment(id, department_id)

    return result.affectedRows
  },

  delete: async (id) => {
    await pool.query('DELETE FROM user_roles WHERE user_id = ?', [id])

    try {
      await pool.query('DELETE FROM user_departments WHERE user_id = ?', [id])
    } catch (err) {
      if (!isMissingTableError(err)) {
        throw err
      }
    }

    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id])
    return result.affectedRows
  },

  setRoles: async (userId, roleIds = []) => {
    await pool.query('DELETE FROM user_roles WHERE user_id = ?', [userId])
    if (roleIds.length === 0) return

    const values = roleIds.map((rid) => [userId, rid])
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ?', [values])
  },
}

module.exports = User
