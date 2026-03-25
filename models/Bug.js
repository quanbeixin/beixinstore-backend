const pool = require('../utils/db')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function buildStatusTimestampValues(status) {
  switch (String(status || '').toUpperCase()) {
    case 'VERIFIED':
      return {
        resolved_at: 'NOW',
        verified_at: 'NOW',
        closed_at: null,
      }
    case 'CLOSED':
      return {
        resolved_at: 'NOW',
        verified_at: 'NOW',
        closed_at: 'NOW',
      }
    default:
      return {
        resolved_at: null,
        verified_at: null,
        closed_at: null,
      }
  }
}

async function generateBugCode(executor) {
  const db = executor && typeof executor.query === 'function' ? executor : pool
  const [[row]] = await db.query(
    `SELECT MAX(CAST(SUBSTRING(bug_code, 4) AS UNSIGNED)) AS max_no
     FROM pm_bugs
     WHERE bug_code REGEXP '^BUG[0-9]+$'`,
  )
  const nextNo = Number(row?.max_no || 0) + 1
  return `BUG${String(nextNo).padStart(3, '0')}`
}

const Bug = {
  async findAll({
    page = 1,
    pageSize = 10,
    keyword = '',
    bugCode = '',
    projectId = null,
    requirementId = null,
    demandId = '',
    status = '',
    severity = '',
    assigneeUserId = null,
    stage = '',
    accessProjectId = null,
  }) {
    const offset = (page - 1) * pageSize
    const like = `%${keyword}%`
    const params = [like, like, like, like]

    let where =
      "WHERE b.is_deleted = 0 AND (b.title LIKE ? OR COALESCE(b.description, '') LIKE ? OR COALESCE(b.reproduce_steps, '') LIKE ? OR COALESCE(b.bug_code, '') LIKE ?)"

    if (bugCode) {
      where += ' AND b.bug_code = ?'
      params.push(String(bugCode).trim().toUpperCase())
    }

    if (projectId) {
      where += ' AND b.project_id = ?'
      params.push(projectId)
    }
    if (toPositiveInt(accessProjectId)) {
      where += ' AND b.project_id = ?'
      params.push(toPositiveInt(accessProjectId))
    }
    if (requirementId) {
      where += ' AND b.requirement_id = ?'
      params.push(requirementId)
    }
    if (demandId) {
      where += ' AND b.demand_id = ?'
      params.push(String(demandId).trim().toUpperCase())
    }
    if (status) {
      where += ' AND b.status = ?'
      params.push(status)
    }
    if (severity) {
      where += ' AND b.severity = ?'
      params.push(severity)
    }
    if (assigneeUserId) {
      where += ' AND b.assignee_user_id = ?'
      params.push(assigneeUserId)
    }
    if (stage) {
      where += ' AND b.stage = ?'
      params.push(stage)
    }

    const [rows] = await pool.query(
      `
      SELECT
        b.*,
        p.name AS project_name,
        d.name AS demand_name,
        r.title AS requirement_title,
        COALESCE(d.name, r.title) AS linked_requirement_title,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS assignee_name
      FROM pm_bugs b
      INNER JOIN pm_projects p ON p.id = b.project_id AND p.is_deleted = 0
      LEFT JOIN work_demands d ON d.id = b.demand_id
      LEFT JOIN pm_requirements r ON r.id = b.requirement_id AND r.is_deleted = 0
      LEFT JOIN users u ON u.id = b.assignee_user_id
      ${where}
      ORDER BY b.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, Number(pageSize), Number(offset)],
    )

    const [[countRow]] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM pm_bugs b
      INNER JOIN pm_projects p ON p.id = b.project_id AND p.is_deleted = 0
      LEFT JOIN work_demands d ON d.id = b.demand_id
      LEFT JOIN pm_requirements r ON r.id = b.requirement_id AND r.is_deleted = 0
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
        b.*,
        p.name AS project_name,
        d.name AS demand_name,
        r.title AS requirement_title,
        COALESCE(d.name, r.title) AS linked_requirement_title,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS assignee_name
      FROM pm_bugs b
      INNER JOIN pm_projects p ON p.id = b.project_id AND p.is_deleted = 0
      LEFT JOIN work_demands d ON d.id = b.demand_id
      LEFT JOIN pm_requirements r ON r.id = b.requirement_id AND r.is_deleted = 0
      LEFT JOIN users u ON u.id = b.assignee_user_id
      WHERE b.id = ? AND b.is_deleted = 0
      LIMIT 1
      `,
      [id],
    )
    return rows[0] || null
  },

  async create(payload) {
    const timestamps = buildStatusTimestampValues(payload.status)
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const finalBugCode = String(payload.bug_code || '').trim().toUpperCase() || (await generateBugCode(conn))

      const [result] = await conn.query(
        `
        INSERT INTO pm_bugs
        (
          bug_code, project_id, requirement_id, demand_id, title, description, reproduce_steps,
          severity, status, stage, assignee_user_id, estimated_hours,
          actual_hours, due_date, resolved_at, verified_at, closed_at,
          created_by, updated_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          finalBugCode,
          payload.project_id,
          toPositiveInt(payload.requirement_id),
          payload.demand_id || null,
          payload.title,
          payload.description || null,
          payload.reproduce_steps || null,
          payload.severity,
          payload.status,
          payload.stage,
          toPositiveInt(payload.assignee_user_id),
          Number(payload.estimated_hours || 0),
          Number(payload.actual_hours || 0),
          payload.due_date || null,
          timestamps.resolved_at === 'NOW' ? new Date() : null,
          timestamps.verified_at === 'NOW' ? new Date() : null,
          timestamps.closed_at === 'NOW' ? new Date() : null,
          toPositiveInt(payload.created_by),
          toPositiveInt(payload.updated_by),
        ],
      )
      await conn.commit()
      return Number(result.insertId)
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async update(id, payload) {
    const timestamps = buildStatusTimestampValues(payload.status)
    const [result] = await pool.query(
      `
      UPDATE pm_bugs
      SET
        bug_code = ?,
        project_id = ?,
        requirement_id = ?,
        demand_id = ?,
        title = ?,
        description = ?,
        reproduce_steps = ?,
        severity = ?,
        status = ?,
        stage = ?,
        assignee_user_id = ?,
        estimated_hours = ?,
        actual_hours = ?,
        due_date = ?,
        resolved_at = ?,
        verified_at = ?,
        closed_at = ?,
        updated_by = ?
      WHERE id = ? AND is_deleted = 0
      `,
      [
        String(payload.bug_code || '').trim().toUpperCase() || null,
        payload.project_id,
        toPositiveInt(payload.requirement_id),
        payload.demand_id || null,
        payload.title,
        payload.description || null,
        payload.reproduce_steps || null,
        payload.severity,
        payload.status,
        payload.stage,
        toPositiveInt(payload.assignee_user_id),
        Number(payload.estimated_hours || 0),
        Number(payload.actual_hours || 0),
        payload.due_date || null,
        timestamps.resolved_at === 'NOW' ? new Date() : null,
        timestamps.verified_at === 'NOW' ? new Date() : null,
        timestamps.closed_at === 'NOW' ? new Date() : null,
        toPositiveInt(payload.updated_by),
        id,
      ],
    )
    return Number(result.affectedRows || 0)
  },

  async softDelete(id, userId) {
    const [result] = await pool.query(
      `
      UPDATE pm_bugs
      SET is_deleted = 1, updated_by = ?
      WHERE id = ? AND is_deleted = 0
      `,
      [toPositiveInt(userId), id],
    )
    return Number(result.affectedRows || 0)
  },

  async updateStatus(id, status, userId) {
    const timestamps = buildStatusTimestampValues(status)
    const [result] = await pool.query(
      `
      UPDATE pm_bugs
      SET
        status = ?,
        resolved_at = ?,
        verified_at = ?,
        closed_at = ?,
        updated_by = ?
      WHERE id = ? AND is_deleted = 0
      `,
      [
        status,
        timestamps.resolved_at === 'NOW' ? new Date() : null,
        timestamps.verified_at === 'NOW' ? new Date() : null,
        timestamps.closed_at === 'NOW' ? new Date() : null,
        toPositiveInt(userId),
        id,
      ],
    )
    return Number(result.affectedRows || 0)
  },

  async updateStage(id, stage, userId) {
    const [result] = await pool.query(
      `
      UPDATE pm_bugs
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
      UPDATE pm_bugs
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
      UPDATE pm_bugs
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

module.exports = Bug
