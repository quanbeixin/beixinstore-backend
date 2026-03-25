const pool = require('../utils/db')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function toHours(value) {
  return Number(Number(value || 0).toFixed(2))
}

function toPersonDays(hours) {
  return Number((Number(hours || 0) / 8).toFixed(2))
}

function buildDemandProjectScopeCondition({ accessProjectId = null, alias = 'd' } = {}) {
  const accessId = toPositiveInt(accessProjectId)
  if (!accessId) {
    return {
      joinSql: `INNER JOIN pm_user_business_lines ubl ON ubl.user_id = ${alias}.owner_user_id`,
      whereSql: '',
      params: [],
    }
  }

  return {
    joinSql: `INNER JOIN pm_user_business_lines ubl ON ubl.user_id = ${alias}.owner_user_id`,
    whereSql: 'WHERE ubl.project_id = ?',
    params: [accessId],
  }
}

const ProjectStats = {
  async getOverview({ accessProjectId = null } = {}) {
    const accessId = toPositiveInt(accessProjectId)
    const projectWhere = accessId ? 'WHERE p.is_deleted = 0 AND p.id = ?' : 'WHERE p.is_deleted = 0'
    const bugWhere = accessId ? 'WHERE b.is_deleted = 0 AND b.project_id = ?' : 'WHERE b.is_deleted = 0'

    const [[projectRow]] = await pool.query(
      `
      SELECT
        COUNT(*) AS total_projects,
        SUM(CASE WHEN p.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress_projects,
        SUM(CASE WHEN p.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_projects
      FROM pm_projects p
      ${projectWhere}
      `,
      accessId ? [accessId] : [],
    )

    const demandScope = buildDemandProjectScopeCondition({ accessProjectId: accessId, alias: 'd' })
    const [[requirementRow]] = await pool.query(
      `
      SELECT
        COUNT(*) AS total_requirements,
        COALESCE(SUM(COALESCE(d.owner_estimate_hours, 0)), 0) AS estimated_hours,
        COALESCE(SUM(COALESCE(la.actual_hours, 0)), 0) AS actual_hours
      FROM work_demands d
      ${demandScope.joinSql}
      LEFT JOIN (
        SELECT demand_id, SUM(actual_hours) AS actual_hours
        FROM work_logs
        WHERE demand_id IS NOT NULL
        GROUP BY demand_id
      ) la ON la.demand_id = d.id
      ${demandScope.whereSql}
      `,
      demandScope.params,
    )

    const [[bugRow]] = await pool.query(
      `
      SELECT
        COUNT(*) AS total_bugs,
        COALESCE(SUM(b.estimated_hours), 0) AS estimated_hours,
        COALESCE(SUM(b.actual_hours), 0) AS actual_hours
      FROM pm_bugs b
      ${bugWhere}
      `,
      accessId ? [accessId] : [],
    )

    const estimatedHours =
      Number(requirementRow?.estimated_hours || 0) + Number(bugRow?.estimated_hours || 0)
    const actualHours =
      Number(requirementRow?.actual_hours || 0) + Number(bugRow?.actual_hours || 0)

    return {
      total_projects: Number(projectRow?.total_projects || 0),
      in_progress_projects: Number(projectRow?.in_progress_projects || 0),
      completed_projects: Number(projectRow?.completed_projects || 0),
      total_requirements: Number(requirementRow?.total_requirements || 0),
      total_bugs: Number(bugRow?.total_bugs || 0),
      estimated_hours: toHours(estimatedHours),
      actual_hours: toHours(actualHours),
      person_days: toPersonDays(actualHours),
    }
  },

  async getProjectStats({ status = '', ownerUserId = null, accessProjectId = null }) {
    const params = []
    let where = 'WHERE p.is_deleted = 0'

    if (status) {
      where += ' AND p.status = ?'
      params.push(status)
    }
    if (ownerUserId) {
      where += ' AND p.owner_user_id = ?'
      params.push(ownerUserId)
    }
    if (toPositiveInt(accessProjectId)) {
      where += ' AND p.id = ?'
      params.push(toPositiveInt(accessProjectId))
    }

    const [rows] = await pool.query(
      `
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        p.project_code,
        p.status,
        p.owner_user_id,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS owner_name,
        COALESCE(req.requirement_count, 0) AS requirement_count,
        COALESCE(req.demand_actual_hours, 0) AS demand_actual_hours,
        COALESCE(req.estimated_hours, 0) AS demand_estimated_hours,
        COALESCE(bug.bug_count, 0) AS bug_count,
        COALESCE(req.estimated_hours, 0) + COALESCE(bug.estimated_hours, 0) AS estimated_hours,
        COALESCE(req.demand_actual_hours, 0) + COALESCE(bug.actual_hours, 0) AS actual_hours
      FROM pm_projects p
      LEFT JOIN users u ON u.id = p.owner_user_id
      LEFT JOIN (
        SELECT
          ubl.project_id,
          COUNT(*) AS requirement_count,
          COALESCE(SUM(COALESCE(d.owner_estimate_hours, 0)), 0) AS estimated_hours,
          COALESCE(SUM(COALESCE(la.actual_hours, 0)), 0) AS demand_actual_hours
        FROM work_demands d
        INNER JOIN pm_user_business_lines ubl ON ubl.user_id = d.owner_user_id
        LEFT JOIN (
          SELECT demand_id, SUM(actual_hours) AS actual_hours
          FROM work_logs
          WHERE demand_id IS NOT NULL
          GROUP BY demand_id
        ) la ON la.demand_id = d.id
        GROUP BY ubl.project_id
      ) req ON req.project_id = p.id
      LEFT JOIN (
        SELECT
          b.project_id,
          COUNT(*) AS bug_count,
          COALESCE(SUM(b.estimated_hours), 0) AS estimated_hours,
          COALESCE(SUM(b.actual_hours), 0) AS actual_hours
        FROM pm_bugs b
        WHERE b.is_deleted = 0
        GROUP BY b.project_id
      ) bug ON bug.project_id = p.id
      ${where}
      ORDER BY p.id DESC
      `,
      params,
    )

    return rows.map((row) => {
      const estimatedHours = Number(row.estimated_hours || 0)
      const actualHours = Number(row.actual_hours || 0)

      return {
        ...row,
        requirement_count: Number(row.requirement_count || 0),
        bug_count: Number(row.bug_count || 0),
        demand_estimated_hours: toHours(row.demand_estimated_hours || 0),
        demand_actual_hours: toHours(row.demand_actual_hours || 0),
        estimated_hours: toHours(estimatedHours),
        actual_hours: toHours(actualHours),
        person_days: toPersonDays(actualHours),
      }
    })
  },

  async getMemberStats({ projectId = null, userId = null, accessProjectId = null }) {
    const params = []
    const filters = []

    if (projectId) {
      filters.push('stat.project_id = ?')
      params.push(projectId)
    }
    if (toPositiveInt(accessProjectId)) {
      filters.push('stat.project_id = ?')
      params.push(toPositiveInt(accessProjectId))
    }
    if (userId) {
      filters.push('stat.user_id = ?')
      params.push(userId)
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : ''

    const [rows] = await pool.query(
      `
      SELECT
        stat.user_id,
        COALESCE(NULLIF(u.real_name, ''), u.username) AS real_name,
        u.username,
        COUNT(DISTINCT stat.project_id) AS project_count,
        COALESCE(SUM(stat.requirement_count), 0) AS requirement_count,
        COALESCE(SUM(stat.bug_count), 0) AS bug_count,
        COALESCE(SUM(stat.estimated_hours), 0) AS estimated_hours,
        COALESCE(SUM(stat.actual_hours), 0) AS actual_hours
      FROM (
        SELECT
          ubl.project_id,
          d.owner_user_id AS user_id,
          COUNT(*) AS requirement_count,
          0 AS bug_count,
          COALESCE(SUM(COALESCE(d.owner_estimate_hours, 0)), 0) AS estimated_hours,
          COALESCE(SUM(COALESCE(la.actual_hours, 0)), 0) AS actual_hours
        FROM work_demands d
        INNER JOIN pm_user_business_lines ubl ON ubl.user_id = d.owner_user_id
        LEFT JOIN (
          SELECT demand_id, SUM(actual_hours) AS actual_hours
          FROM work_logs
          WHERE demand_id IS NOT NULL
          GROUP BY demand_id
        ) la ON la.demand_id = d.id
        GROUP BY ubl.project_id, d.owner_user_id

        UNION ALL

        SELECT
          b.project_id,
          b.assignee_user_id AS user_id,
          0 AS requirement_count,
          COUNT(*) AS bug_count,
          COALESCE(SUM(b.estimated_hours), 0) AS estimated_hours,
          COALESCE(SUM(b.actual_hours), 0) AS actual_hours
        FROM pm_bugs b
        WHERE b.is_deleted = 0 AND b.assignee_user_id IS NOT NULL
        GROUP BY b.project_id, b.assignee_user_id
      ) stat
      INNER JOIN users u ON u.id = stat.user_id
      ${where}
      GROUP BY stat.user_id, u.username, real_name
      ORDER BY stat.user_id DESC
      `,
      params,
    )

    return rows.map((row) => {
      const estimatedHours = Number(row.estimated_hours || 0)
      const actualHours = Number(row.actual_hours || 0)

      return {
        ...row,
        project_count: Number(row.project_count || 0),
        requirement_count: Number(row.requirement_count || 0),
        bug_count: Number(row.bug_count || 0),
        estimated_hours: toHours(estimatedHours),
        actual_hours: toHours(actualHours),
        person_days: toPersonDays(actualHours),
      }
    })
  },
}

module.exports = ProjectStats
