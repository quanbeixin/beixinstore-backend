const pool = require('../utils/db')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

const Project = {
  async findAll({ page = 1, pageSize = 10, keyword = '', status = '', onlyProjectId = null }) {
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const params = [like]

    let where = 'WHERE p.is_deleted = 0 AND p.name LIKE ?'
    if (status) {
      where += ' AND p.status = ?'
      params.push(status)
    }
    if (toPositiveInt(onlyProjectId)) {
      where += ' AND p.id = ?'
      params.push(toPositiveInt(onlyProjectId))
    }

    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.project_code,
        p.description,
        p.status,
        p.owner_user_id,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS owner_name,
        p.start_date,
        p.end_date,
        p.created_at,
        COUNT(DISTINCT CASE WHEN pm.is_deleted = 0 THEN pm.id END) AS member_count
      FROM pm_projects p
      LEFT JOIN users u ON u.id = p.owner_user_id
      LEFT JOIN pm_project_members pm ON pm.project_id = p.id
      ${where}
      GROUP BY p.id
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, Number(pageSize), Number(offset)],
    )

    const [[countRow]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM pm_projects p
      ${where}
      `,
      params,
    )

    return {
      rows,
      total: Number(countRow?.total || 0),
    }
  },

  async findById(id) {
    const [rows] = await pool.query(
      `
      SELECT
        p.*,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS owner_name
      FROM pm_projects p
      LEFT JOIN users u ON u.id = p.owner_user_id
      WHERE p.id = ? AND p.is_deleted = 0
      LIMIT 1
      `,
      [id],
    )
    return rows[0] || null
  },

  async getSummaryById(id) {
    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        COUNT(DISTINCT CASE WHEN pm.is_deleted = 0 THEN pm.id END) AS member_count,
        COUNT(DISTINCT CASE WHEN r.is_deleted = 0 THEN r.id END) AS requirement_count,
        COUNT(DISTINCT CASE WHEN b.is_deleted = 0 THEN b.id END) AS bug_count
      FROM pm_projects p
      LEFT JOIN pm_project_members pm ON pm.project_id = p.id
      LEFT JOIN pm_requirements r ON r.project_id = p.id
      LEFT JOIN pm_bugs b ON b.project_id = p.id
      WHERE p.id = ? AND p.is_deleted = 0
      GROUP BY p.id
      LIMIT 1
      `,
      [id],
    )
    return rows[0] || null
  },

  async create(payload) {
    const [result] = await pool.query(
      `
      INSERT INTO pm_projects
      (name, project_code, description, status, owner_user_id, start_date, end_date, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.name,
        payload.project_code || null,
        payload.description || null,
        payload.status,
        toPositiveInt(payload.owner_user_id),
        payload.start_date || null,
        payload.end_date || null,
        toPositiveInt(payload.created_by),
        toPositiveInt(payload.updated_by),
      ],
    )
    return Number(result.insertId)
  },

  async update(id, payload) {
    const [result] = await pool.query(
      `
      UPDATE pm_projects
      SET
        name = ?,
        project_code = ?,
        description = ?,
        status = ?,
        owner_user_id = ?,
        start_date = ?,
        end_date = ?,
        updated_by = ?
      WHERE id = ? AND is_deleted = 0
      `,
      [
        payload.name,
        payload.project_code || null,
        payload.description || null,
        payload.status,
        toPositiveInt(payload.owner_user_id),
        payload.start_date || null,
        payload.end_date || null,
        toPositiveInt(payload.updated_by),
        id,
      ],
    )
    return Number(result.affectedRows || 0)
  },

  async softDelete(id, userId) {
    const [result] = await pool.query(
      `
      UPDATE pm_projects
      SET is_deleted = 1, updated_by = ?
      WHERE id = ? AND is_deleted = 0
      `,
      [toPositiveInt(userId), id],
    )
    return Number(result.affectedRows || 0)
  },
}

module.exports = Project
