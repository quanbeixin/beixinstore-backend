const pool = require('../utils/db')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

const ProjectMember = {
  async listByProjectId(projectId) {
    const [rows] = await pool.query(
      `
      SELECT
        pm.id,
        pm.project_id,
        pm.user_id,
        pm.project_role,
        pm.joined_at,
        u.username,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS real_name,
        u.email
      FROM pm_project_members pm
      INNER JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ? AND pm.is_deleted = 0
      ORDER BY pm.id ASC
      `,
      [projectId],
    )
    return rows
  },

  async findById(id) {
    const [rows] = await pool.query(
      `
      SELECT *
      FROM pm_project_members
      WHERE id = ? AND is_deleted = 0
      LIMIT 1
      `,
      [id],
    )
    return rows[0] || null
  },

  async findByProjectAndUser(projectId, userId) {
    const [rows] = await pool.query(
      `
      SELECT *
      FROM pm_project_members
      WHERE project_id = ? AND user_id = ? AND is_deleted = 0
      LIMIT 1
      `,
      [projectId, userId],
    )
    return rows[0] || null
  },

  async create({ project_id, user_id, project_role, created_by, updated_by }) {
    const [result] = await pool.query(
      `
      INSERT INTO pm_project_members
      (project_id, user_id, project_role, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?)
      `,
      [project_id, user_id, project_role, toPositiveInt(created_by), toPositiveInt(updated_by)],
    )
    return Number(result.insertId)
  },

  async updateRole(id, projectRole, updatedBy) {
    const [result] = await pool.query(
      `
      UPDATE pm_project_members
      SET project_role = ?, updated_by = ?
      WHERE id = ? AND is_deleted = 0
      `,
      [projectRole, toPositiveInt(updatedBy), id],
    )
    return Number(result.affectedRows || 0)
  },

  async softDelete(id, updatedBy) {
    const [result] = await pool.query(
      `
      UPDATE pm_project_members
      SET is_deleted = 1, updated_by = ?
      WHERE id = ? AND is_deleted = 0
      `,
      [toPositiveInt(updatedBy), id],
    )
    return Number(result.affectedRows || 0)
  },
}

module.exports = ProjectMember
