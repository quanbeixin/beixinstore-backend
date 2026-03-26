const pool = require('../utils/db')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

const WorkflowOperationLog = {
  async create({ projectId, operatorUserId, entityType, entityId, action, detail = null }) {
    const [result] = await pool.query(
      `INSERT INTO pm_workflow_operation_logs (
         project_id,
         operator_user_id,
         entity_type,
         entity_id,
         action,
         detail
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        toPositiveInt(projectId),
        toPositiveInt(operatorUserId),
        String(entityType || '').trim().toUpperCase() || 'INSTANCE',
        toPositiveInt(entityId),
        String(action || '').trim().toUpperCase() || 'UNKNOWN',
        detail ? String(detail).trim().slice(0, 5000) : null,
      ],
    )
    return Number(result.insertId)
  },

  async list({ projectId, demandId = '', page = 1, pageSize = 20 }) {
    const offset = (Math.max(Number(page || 1), 1) - 1) * Math.max(Number(pageSize || 20), 1)
    const limit = Math.max(Number(pageSize || 20), 1)
    const params = []
    let whereSql = 'WHERE l.project_id = ?'
    params.push(toPositiveInt(projectId))

    if (String(demandId || '').trim()) {
      whereSql += ' AND i.demand_id = ?'
      params.push(String(demandId).trim().toUpperCase())
    }

    const [rows] = await pool.query(
       `SELECT
         l.*,
         i.demand_id,
         u.username AS operator_username,
         u.real_name AS operator_real_name,
         COALESCE(NULLIF(u.real_name, ''), u.username, CONCAT('用户#', l.operator_user_id)) AS operator_name
       FROM pm_workflow_operation_logs l
       LEFT JOIN pm_workflow_instances i
         ON l.entity_type = 'INSTANCE' AND l.entity_id = i.id
       LEFT JOIN users u
         ON u.id = l.operator_user_id
       ${whereSql}
       ORDER BY l.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    )

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM pm_workflow_operation_logs l
       LEFT JOIN pm_workflow_instances i
         ON l.entity_type = 'INSTANCE' AND l.entity_id = i.id
       ${whereSql}`,
      params,
    )

    return {
      rows,
      total: Number(countRow?.total || 0),
    }
  },
}

module.exports = WorkflowOperationLog
