const pool = require('../utils/db')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

const ProjectActivityLog = {
  async create({
    project_id = null,
    requirement_id = null,
    bug_id = null,
    entity_type,
    entity_id,
    action,
    action_detail = null,
    operator_user_id = null,
  }) {
    const [result] = await pool.query(
      `
      INSERT INTO pm_activity_logs
      (project_id, requirement_id, bug_id, entity_type, entity_id, action, action_detail, operator_user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        toPositiveInt(project_id),
        toPositiveInt(requirement_id),
        toPositiveInt(bug_id),
        entity_type,
        entity_id,
        action,
        action_detail,
        toPositiveInt(operator_user_id),
      ],
    )
    return Number(result.insertId)
  },

  async listByProject(projectId, { page = 1, pageSize = 20 } = {}) {
    const offset = (page - 1) * pageSize
    const [rows] = await pool.query(
      `
      SELECT
        l.*,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS operator_name
      FROM pm_activity_logs l
      LEFT JOIN users u ON u.id = l.operator_user_id
      WHERE l.project_id = ?
      ORDER BY l.id DESC
      LIMIT ? OFFSET ?
      `,
      [projectId, Number(pageSize), Number(offset)],
    )
    return rows
  },
}

module.exports = ProjectActivityLog
