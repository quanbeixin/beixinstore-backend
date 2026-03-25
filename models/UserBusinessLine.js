const pool = require('../utils/db')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

const UserBusinessLine = {
  async getByUserId(userId) {
    const [rows] = await pool.query(
      `
      SELECT
        ubl.user_id,
        ubl.project_id,
        p.name AS project_name,
        p.project_code,
        p.status AS project_status
      FROM pm_user_business_lines ubl
      INNER JOIN pm_projects p ON p.id = ubl.project_id
      WHERE ubl.user_id = ?
        AND p.is_deleted = 0
      LIMIT 1
      `,
      [toPositiveInt(userId)],
    )
    return rows[0] || null
  },

  async listAvailableProjectsForUser({ userId, isSuperAdmin = false }) {
    if (isSuperAdmin) {
      const [rows] = await pool.query(
        `
        SELECT
          p.id AS project_id,
          p.name AS project_name,
          p.project_code,
          p.status AS project_status
        FROM pm_projects p
        WHERE p.is_deleted = 0
        ORDER BY p.id ASC
        `,
      )
      return rows || []
    }

    const [rows] = await pool.query(
      `
      SELECT
        ubl.project_id,
        p.name AS project_name,
        p.project_code,
        p.status AS project_status
      FROM pm_user_business_lines ubl
      INNER JOIN pm_projects p ON p.id = ubl.project_id
      WHERE ubl.user_id = ?
        AND p.is_deleted = 0
      ORDER BY p.id ASC
      `,
      [toPositiveInt(userId)],
    )
    return rows || []
  },

  async findProjectById(projectId) {
    const [rows] = await pool.query(
      `
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        p.project_code,
        p.status AS project_status
      FROM pm_projects p
      WHERE p.id = ?
        AND p.is_deleted = 0
      LIMIT 1
      `,
      [toPositiveInt(projectId)],
    )
    return rows[0] || null
  },

  async upsertByUserId({ userId, projectId, operatorUserId = null }) {
    const [result] = await pool.query(
      `
      INSERT INTO pm_user_business_lines (user_id, project_id, created_by, updated_by)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        project_id = VALUES(project_id),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP
      `,
      [toPositiveInt(userId), toPositiveInt(projectId), toPositiveInt(operatorUserId), toPositiveInt(operatorUserId)],
    )
    return Number(result.affectedRows || 0)
  },
}

module.exports = UserBusinessLine
