const pool = require('../utils/db')

function normalizeParentId(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function buildDepartmentTree(flatRows = []) {
  const nodeMap = new Map()
  const roots = []

  flatRows.forEach((row) => {
    nodeMap.set(row.id, {
      ...row,
      children: [],
    })
  })

  flatRows.forEach((row) => {
    const node = nodeMap.get(row.id)
    const parentId = normalizeParentId(row.parent_id)

    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId).children.push(node)
      return
    }

    roots.push(node)
  })

  return roots
}

const Department = {
  async listFlat() {
    const [rows] = await pool.query(
      `SELECT
         d.id,
         d.name,
         d.parent_id,
         d.manager_user_id,
         d.sort_order,
         d.enabled,
         COALESCE(NULLIF(TRIM(u.real_name), ''), u.username) AS manager_name
       FROM departments d
       LEFT JOIN users u ON u.id = d.manager_user_id
       ORDER BY d.sort_order ASC, d.id ASC`,
    )

    return rows
  },

  async listTree() {
    const rows = await this.listFlat()
    return buildDepartmentTree(rows)
  },

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT
         d.id,
         d.name,
         d.parent_id,
         d.manager_user_id,
         d.sort_order,
         d.enabled,
         COALESCE(NULLIF(TRIM(u.real_name), ''), u.username) AS manager_name
       FROM departments d
       LEFT JOIN users u ON u.id = d.manager_user_id
       WHERE d.id = ?`,
      [id],
    )

    return rows[0] || null
  },

  async create({ name, parentId = null, managerUserId = null, sortOrder = 0, enabled = 1 }) {
    const [result] = await pool.query(
      `INSERT INTO departments (name, parent_id, manager_user_id, sort_order, enabled)
       VALUES (?, ?, ?, ?, ?)`,
      [name, parentId, managerUserId, sortOrder, enabled],
    )

    return result.insertId
  },

  async update(id, { name, parentId = null, managerUserId = null, sortOrder = 0, enabled = 1 }) {
    const [result] = await pool.query(
      `UPDATE departments
       SET name = ?, parent_id = ?, manager_user_id = ?, sort_order = ?, enabled = ?
       WHERE id = ?`,
      [name, parentId, managerUserId, sortOrder, enabled, id],
    )

    return result.affectedRows
  },

  async remove(id) {
    const [result] = await pool.query('DELETE FROM departments WHERE id = ?', [id])
    return result.affectedRows
  },

  async countChildren(parentId) {
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM departments WHERE parent_id = ?',
      [parentId],
    )
    return total
  },

  async countUsersInDepartment(departmentId) {
    const [[baseCount]] = await pool.query(
      'SELECT COUNT(*) AS total FROM users WHERE department_id = ?',
      [departmentId],
    )

    const [[extraCount]] = await pool.query(
      'SELECT COUNT(*) AS total FROM user_departments WHERE department_id = ?',
      [departmentId],
    )

    return Number(baseCount.total || 0) + Number(extraCount.total || 0)
  },

  async listUserDepartments(userId) {
    const [rows] = await pool.query(
      `SELECT
         d.id,
         d.name,
         d.parent_id,
         d.manager_user_id,
         d.sort_order,
         d.enabled,
         ud.is_primary
       FROM user_departments ud
       INNER JOIN departments d ON d.id = ud.department_id
       WHERE ud.user_id = ?
       ORDER BY ud.is_primary DESC, d.sort_order ASC, d.id ASC`,
      [userId],
    )

    return rows
  },

  async setUserDepartments(userId, { departmentIds = [], primaryDepartmentId = null }) {
    const conn = await pool.getConnection()

    try {
      await conn.beginTransaction()

      const normalizedIds = [...new Set(departmentIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]

      const fallbackPrimary = normalizedIds[0] || null
      const selectedPrimary = Number.isInteger(Number(primaryDepartmentId)) && Number(primaryDepartmentId) > 0
        ? Number(primaryDepartmentId)
        : fallbackPrimary

      const finalDepartmentIds = selectedPrimary
        ? [...new Set([selectedPrimary, ...normalizedIds])]
        : normalizedIds

      await conn.query('DELETE FROM user_departments WHERE user_id = ?', [userId])

      if (finalDepartmentIds.length > 0) {
        const values = finalDepartmentIds.map((departmentId) => [
          userId,
          departmentId,
          selectedPrimary === departmentId ? 1 : 0,
        ])

        await conn.query(
          'INSERT INTO user_departments (user_id, department_id, is_primary) VALUES ?',
          [values],
        )
      }

      await conn.query(
        'UPDATE users SET department_id = ? WHERE id = ?',
        [selectedPrimary, userId],
      )

      await conn.commit()

      return {
        department_ids: finalDepartmentIds,
        primary_department_id: selectedPrimary,
      }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },
}

module.exports = Department
