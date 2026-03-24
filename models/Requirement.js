const pool = require('../utils/db')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

const Requirement = {
  async findAll({
    page = 1,
    pageSize = 10,
    keyword = '',
    projectId = null,
    status = '',
    priority = '',
    assigneeUserId = null,
    stage = '',
    accessProjectId = null,
  }) {
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const params = [like, like]

    let where = 'WHERE r.is_deleted = 0 AND (r.title LIKE ? OR COALESCE(r.description, \'\') LIKE ?)'

    if (projectId) {
      where += ' AND r.project_id = ?'
      params.push(projectId)
    }
    if (toPositiveInt(accessProjectId)) {
      where += ' AND r.project_id = ?'
      params.push(toPositiveInt(accessProjectId))
    }
    if (status) {
      where += ' AND r.status = ?'
      params.push(status)
    }
    if (priority) {
      where += ' AND r.priority = ?'
      params.push(priority)
    }
    if (assigneeUserId) {
      where += ' AND r.assignee_user_id = ?'
      params.push(assigneeUserId)
    }
    if (stage) {
      where += ' AND r.stage = ?'
      params.push(stage)
    }

    const [rows] = await pool.query(
      `
      SELECT
        r.*,
        p.name AS project_name,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS assignee_name
      FROM pm_requirements r
      INNER JOIN pm_projects p ON p.id = r.project_id AND p.is_deleted = 0
      LEFT JOIN users u ON u.id = r.assignee_user_id
      ${where}
      ORDER BY r.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, Number(pageSize), Number(offset)],
    )

    const [[countRow]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM pm_requirements r
      INNER JOIN pm_projects p ON p.id = r.project_id AND p.is_deleted = 0
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
        r.*,
        p.name AS project_name,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS assignee_name
      FROM pm_requirements r
      INNER JOIN pm_projects p ON p.id = r.project_id AND p.is_deleted = 0
      LEFT JOIN users u ON u.id = r.assignee_user_id
      WHERE r.id = ? AND r.is_deleted = 0
      LIMIT 1
      `,
      [id],
    )
    return rows[0] || null
  },

  async create(payload) {
    const [result] = await pool.query(
      `
      INSERT INTO pm_requirements
      (
        project_id, title, description, priority, status, stage,
        assignee_user_id, estimated_hours, actual_hours, start_date, due_date,
        created_by, updated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.project_id,
        payload.title,
        payload.description || null,
        payload.priority,
        payload.status,
        payload.stage,
        toPositiveInt(payload.assignee_user_id),
        Number(payload.estimated_hours || 0),
        Number(payload.actual_hours || 0),
        payload.start_date || null,
        payload.due_date || null,
        toPositiveInt(payload.created_by),
        toPositiveInt(payload.updated_by),
      ],
    )
    return Number(result.insertId)
  },

  async update(id, payload) {
    const [result] = await pool.query(
      `
      UPDATE pm_requirements
      SET
        project_id = ?,
        title = ?,
        description = ?,
        priority = ?,
        status = ?,
        stage = ?,
        assignee_user_id = ?,
        estimated_hours = ?,
        actual_hours = ?,
        start_date = ?,
        due_date = ?,
        updated_by = ?,
        completed_at = CASE WHEN ? = 'DONE' THEN COALESCE(completed_at, NOW()) ELSE NULL END
      WHERE id = ? AND is_deleted = 0
      `,
      [
        payload.project_id,
        payload.title,
        payload.description || null,
        payload.priority,
        payload.status,
        payload.stage,
        toPositiveInt(payload.assignee_user_id),
        Number(payload.estimated_hours || 0),
        Number(payload.actual_hours || 0),
        payload.start_date || null,
        payload.due_date || null,
        toPositiveInt(payload.updated_by),
        payload.status,
        id,
      ],
    )
    return Number(result.affectedRows || 0)
  },

  async softDelete(id, userId) {
    const [result] = await pool.query(
      `
      UPDATE pm_requirements
      SET is_deleted = 1, updated_by = ?
      WHERE id = ? AND is_deleted = 0
      `,
      [toPositiveInt(userId), id],
    )
    return Number(result.affectedRows || 0)
  },

  async updateStatus(id, status, userId) {
    const [result] = await pool.query(
      `
      UPDATE pm_requirements
      SET
        status = ?,
        updated_by = ?,
        completed_at = CASE WHEN ? = 'DONE' THEN COALESCE(completed_at, NOW()) ELSE NULL END
      WHERE id = ? AND is_deleted = 0
      `,
      [status, toPositiveInt(userId), status, id],
    )
    return Number(result.affectedRows || 0)
  },

  async updateStage(id, stage, userId) {
    const [result] = await pool.query(
      `
      UPDATE pm_requirements
      SET stage = ?, updated_by = ?
      WHERE id = ? AND is_deleted = 0
      `,
      [stage, toPositiveInt(userId), id],
    )
    return Number(result.affectedRows || 0)
  },

  async updateAssignee(id, assigneeUserId, userId) {
    const [result] = await pool.query(
      `
      UPDATE pm_requirements
      SET assignee_user_id = ?, updated_by = ?
      WHERE id = ? AND is_deleted = 0
      `,
      [toPositiveInt(assigneeUserId), toPositiveInt(userId), id],
    )
    return Number(result.affectedRows || 0)
  },

  async updateHours(id, estimatedHours, actualHours, userId) {
    const [result] = await pool.query(
      `
      UPDATE pm_requirements
      SET
        estimated_hours = ?,
        actual_hours = ?,
        updated_by = ?
      WHERE id = ? AND is_deleted = 0
      `,
      [Number(estimatedHours || 0), Number(actualHours || 0), toPositiveInt(userId), id],
    )
    return Number(result.affectedRows || 0)
  },
}

module.exports = Requirement
