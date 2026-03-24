const pool = require('../utils/db')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

const UserBusinessLine = {
  async getByUserId(userId) {
    const [rows] = await pool.query(
      `
      SELECT user_id, project_id
      FROM pm_user_business_lines
      WHERE user_id = ?
      LIMIT 1
      `,
      [toPositiveInt(userId)],
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

