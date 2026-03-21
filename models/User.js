const pool = require('../utils/db')

function isMissingTableError(err) {
  return err && (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146)
}

function isMissingColumnError(err) {
  return err && err.code === 'ER_BAD_FIELD_ERROR'
}

async function syncPrimaryDepartment(userId, departmentId) {
  try {
    try {
      await pool.query('DELETE FROM user_departments WHERE user_id = ? AND is_primary = 1', [userId])
    } catch (err) {
      if (isMissingColumnError(err)) {
        await pool.query('DELETE FROM user_departments WHERE user_id = ?', [userId])
      } else {
        throw err
      }
    }

    if (!departmentId) return

    try {
      await pool.query(
        `INSERT INTO user_departments (user_id, department_id, is_primary)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE is_primary = VALUES(is_primary)`,
        [userId, departmentId],
      )
    } catch (err) {
      if (isMissingColumnError(err)) {
        await pool.query(
          `INSERT INTO user_departments (user_id, department_id)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
          [userId, departmentId],
        )
      } else {
        throw err
      }
    }
  } catch (err) {
    if (!isMissingTableError(err) && !isMissingColumnError(err)) {
      throw err
    }
  }
}

async function queryWithFallback(primarySql, fallbackSql, params = []) {
  try {
    return await pool.query(primarySql, params)
  } catch (err) {
    if (!isMissingColumnError(err)) throw err
    return pool.query(fallbackSql, params)
  }
}

const User = {
  findByUsername: async (username) => {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username])
    return rows[0] || null
  },

  findAuthById: async (id) => {
    const [rows] = await queryWithFallback(
      'SELECT id, username, real_name, password FROM users WHERE id = ?',
      "SELECT id, username, '' AS real_name, password FROM users WHERE id = ?",
      [id],
    )
    return rows[0] || null
  },

  findById: async (id) => {
    const primarySql = `
      SELECT
        u.id,
        u.username,
        COALESCE(u.real_name, '') AS real_name,
        u.email,
        u.department_id,
        COALESCE(u.status_code, 'ACTIVE') AS status_code,
        u.created_at,
        u.last_login_at,
        d.name AS department_name,
        GROUP_CONCAT(DISTINCT r.id) AS role_ids,
        GROUP_CONCAT(DISTINCT r.name) AS role_names
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
      GROUP BY u.id
    `
    const fallbackSql = `
      SELECT
        u.id,
        u.username,
        '' AS real_name,
        u.email,
        u.department_id,
        'ACTIVE' AS status_code,
        u.created_at,
        NULL AS last_login_at,
        d.name AS department_name,
        GROUP_CONCAT(DISTINCT r.id) AS role_ids,
        GROUP_CONCAT(DISTINCT r.name) AS role_names
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
      GROUP BY u.id
    `
    const [rows] = await queryWithFallback(primarySql, fallbackSql, [id])
    return rows[0] || null
  },

  findAll: async ({ page = 1, pageSize = 10, keyword = '', sortBy = 'real_name', sortOrder = 'asc' }) => {
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const normalizedSortOrder = String(sortOrder || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC'
    const normalizedSortBy = String(sortBy || '').toLowerCase()

    const primarySortMap = {
      created_at: `u.created_at ${normalizedSortOrder}, u.id DESC`,
      username: `u.username ${normalizedSortOrder}, u.id DESC`,
      real_name: `COALESCE(NULLIF(u.real_name, ''), u.username) ${normalizedSortOrder}, u.id DESC`,
    }
    const fallbackSortMap = {
      created_at: `u.created_at ${normalizedSortOrder}, u.id DESC`,
      username: `u.username ${normalizedSortOrder}, u.id DESC`,
      real_name: `u.username ${normalizedSortOrder}, u.id DESC`,
    }
    const primaryOrderClause = primarySortMap[normalizedSortBy] || primarySortMap.real_name
    const fallbackOrderClause = fallbackSortMap[normalizedSortBy] || fallbackSortMap.real_name

    const primarySql = `
      SELECT
        u.id,
        u.username,
        COALESCE(u.real_name, '') AS real_name,
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
      WHERE u.username LIKE ? OR u.real_name LIKE ? OR u.email LIKE ?
      GROUP BY u.id
      ORDER BY ${primaryOrderClause}
      LIMIT ? OFFSET ?
    `
    const fallbackSql = `
      SELECT
        u.id,
        u.username,
        '' AS real_name,
        u.email,
        u.department_id,
        'ACTIVE' AS status_code,
        u.created_at,
        d.name AS department_name,
        GROUP_CONCAT(DISTINCT r.name) AS role_names
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.username LIKE ? OR u.email LIKE ?
      GROUP BY u.id
      ORDER BY ${fallbackOrderClause}
      LIMIT ? OFFSET ?
    `

    let rows
    try {
      ;[rows] = await pool.query(primarySql, [like, like, like, pageSize, offset])
    } catch (err) {
      if (!isMissingColumnError(err)) throw err
      ;[rows] = await pool.query(fallbackSql, [like, like, pageSize, offset])
    }

    let total = 0
    try {
      const [[row]] = await pool.query(
        'SELECT COUNT(*) AS total FROM users WHERE username LIKE ? OR real_name LIKE ? OR email LIKE ?',
        [like, like, like],
      )
      total = Number(row?.total || 0)
    } catch (err) {
      if (!isMissingColumnError(err)) throw err
      const [[row]] = await pool.query('SELECT COUNT(*) AS total FROM users WHERE username LIKE ? OR email LIKE ?', [
        like,
        like,
      ])
      total = Number(row?.total || 0)
    }

    return { rows, total }
  },

  create: async ({ username, password, real_name = '', email = null, department_id = null, status_code = 'ACTIVE' }) => {
    let result

    try {
      ;[result] = await pool.query(
        'INSERT INTO users (username, password, real_name, email, department_id, status_code) VALUES (?, ?, ?, ?, ?, ?)',
        [username, password, real_name || null, email, department_id, status_code],
      )
    } catch (err) {
      if (!isMissingColumnError(err)) throw err

      try {
        ;[result] = await pool.query(
          'INSERT INTO users (username, password, real_name, email, department_id) VALUES (?, ?, ?, ?, ?)',
          [username, password, real_name || null, email, department_id],
        )
      } catch (innerErr) {
        if (!isMissingColumnError(innerErr)) throw innerErr

        try {
          ;[result] = await pool.query(
            'INSERT INTO users (username, password, email, department_id, status_code) VALUES (?, ?, ?, ?, ?)',
            [username, password, email, department_id, status_code],
          )
        } catch (legacyErr) {
          if (!isMissingColumnError(legacyErr)) throw legacyErr
          ;[result] = await pool.query('INSERT INTO users (username, password, email, department_id) VALUES (?, ?, ?, ?)', [
            username,
            password,
            email,
            department_id,
          ])
        }
      }
    }

    await syncPrimaryDepartment(result.insertId, department_id)
    return result.insertId
  },

  update: async (id, { real_name = '', email, department_id, status_code = 'ACTIVE' }) => {
    let result

    try {
      ;[result] = await pool.query(
        'UPDATE users SET real_name = ?, email = ?, department_id = ?, status_code = ? WHERE id = ?',
        [real_name || null, email, department_id, status_code, id],
      )
    } catch (err) {
      if (!isMissingColumnError(err)) throw err

      try {
        ;[result] = await pool.query('UPDATE users SET real_name = ?, email = ?, department_id = ? WHERE id = ?', [
          real_name || null,
          email,
          department_id,
          id,
        ])
      } catch (innerErr) {
        if (!isMissingColumnError(innerErr)) throw innerErr
        try {
          ;[result] = await pool.query(
            'UPDATE users SET email = ?, department_id = ?, status_code = ? WHERE id = ?',
            [email, department_id, status_code, id],
          )
        } catch (legacyErr) {
          if (!isMissingColumnError(legacyErr)) throw legacyErr
          ;[result] = await pool.query('UPDATE users SET email = ?, department_id = ? WHERE id = ?', [
            email,
            department_id,
            id,
          ])
        }
      }
    }

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

  updateSelfProfile: async (id, { real_name = undefined, email = null }) => {
    let result
    try {
      ;[result] = await pool.query('UPDATE users SET real_name = ?, email = ? WHERE id = ?', [
        real_name === undefined ? null : real_name || null,
        email || null,
        id,
      ])
    } catch (err) {
      if (!isMissingColumnError(err)) throw err
      ;[result] = await pool.query('UPDATE users SET email = ? WHERE id = ?', [email || null, id])
    }
    return result.affectedRows
  },

  updatePasswordById: async (id, passwordHash) => {
    const [result] = await pool.query('UPDATE users SET password = ? WHERE id = ?', [passwordHash, id])
    return result.affectedRows
  },

  isEmailTaken: async (email, excludeUserId = null) => {
    if (!email) return false

    let sql = 'SELECT id FROM users WHERE email = ?'
    const params = [email]
    if (excludeUserId) {
      sql += ' AND id <> ?'
      params.push(excludeUserId)
    }
    sql += ' LIMIT 1'

    const [rows] = await pool.query(sql, params)
    return Boolean(rows[0])
  },

  updateLastLoginById: async (id) => {
    try {
      await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [id])
    } catch (err) {
      if (!isMissingColumnError(err)) throw err
    }
  },

  setRoles: async (userId, roleIds = []) => {
    await pool.query('DELETE FROM user_roles WHERE user_id = ?', [userId])
    if (roleIds.length === 0) return

    const values = roleIds.map((rid) => [userId, rid])
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ?', [values])
  },
}

module.exports = User
