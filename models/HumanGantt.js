const pool = require('../utils/db')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeUserIds(value) {
  if (!value) return []

  const list = Array.isArray(value) ? value : String(value).split(',')
  const ids = list
    .map((item) => toPositiveInt(String(item || '').trim()))
    .filter((item) => Number.isInteger(item) && item > 0)

  return [...new Set(ids)]
}

const HumanGantt = {
  async getUserDepartment(userId) {
    const [rows] = await pool.query(
      `SELECT
         u.id AS user_id,
         u.department_id,
         COALESCE(d.name, '') AS department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.id = ?
       LIMIT 1`,
      [userId],
    )

    const row = rows[0] || null
    if (!row) return null

    return {
      user_id: Number(row.user_id),
      department_id: toPositiveInt(row.department_id),
      department_name: String(row.department_name || '').trim(),
    }
  },

  async listScopeUsers({
    scope = 'dept',
    currentDepartmentId = null,
    departmentId = null,
    userIds = [],
  } = {}) {
    const normalizedScope = String(scope || '').trim().toLowerCase() === 'all' ? 'all' : 'dept'
    const normalizedCurrentDepartmentId = toPositiveInt(currentDepartmentId)
    const normalizedDepartmentId = toPositiveInt(departmentId)
    const normalizedUserIds = normalizeUserIds(userIds)
    const conditions = [
      `COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'`,
      `COALESCE(u.include_in_metrics, 1) = 1`,
    ]
    const params = []

    if (normalizedScope === 'dept') {
      if (!normalizedCurrentDepartmentId) return []
      conditions.push('u.department_id = ?')
      params.push(normalizedCurrentDepartmentId)
    } else if (normalizedDepartmentId) {
      conditions.push('u.department_id = ?')
      params.push(normalizedDepartmentId)
    }

    if (normalizedUserIds.length > 0) {
      conditions.push('u.id IN (?)')
      params.push(normalizedUserIds)
    }

    const [rows] = await pool.query(
      `SELECT
         u.id AS user_id,
         COALESCE(NULLIF(TRIM(u.real_name), ''), u.username) AS user_name,
         u.department_id,
         COALESCE(d.name, CONCAT('部门#', u.department_id)) AS department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.department_id ASC, u.id ASC`,
      params,
    )

    return rows.map((row) => ({
      user_id: Number(row.user_id),
      user_name: String(row.user_name || '').trim(),
      department_id: toPositiveInt(row.department_id),
      department_name: String(row.department_name || '').trim(),
    }))
  },

  async listLogItems({
    startDate,
    endDate,
    userIds = [],
  } = {}) {
    const normalizedUserIds = normalizeUserIds(userIds)
    if (normalizedUserIds.length === 0) return []

    const [rows] = await pool.query(
      `SELECT
         l.id AS log_id,
         l.user_id,
         l.item_type_id,
         COALESCE(t.type_key, '') AS item_type_key,
         COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
         COALESCE(NULLIF(TRIM(l.description), ''), CONCAT(COALESCE(t.name, '事项'), '#', l.id)) AS item_title,
         COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
         l.demand_id,
         COALESCE(d.name, '') AS demand_title,
         DATE_FORMAT(COALESCE(l.expected_start_date, l.log_date), '%Y-%m-%d') AS start_date,
         DATE_FORMAT(COALESCE(l.expected_completion_date, l.expected_start_date, l.log_date), '%Y-%m-%d') AS end_date,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         COALESCE(l.personal_estimate_hours, 0) AS estimate_hours,
         COALESCE(l.actual_hours, 0) AS actual_hours
       FROM work_logs l
       LEFT JOIN work_demands d ON d.id = l.demand_id
       LEFT JOIN work_item_types t ON t.id = l.item_type_id
       WHERE l.user_id IN (?)
         AND COALESCE(l.expected_start_date, l.log_date) <= ?
         AND COALESCE(l.expected_completion_date, l.expected_start_date, l.log_date) >= ?
       ORDER BY l.user_id ASC, COALESCE(l.expected_start_date, l.log_date) ASC, l.id ASC`,
      [normalizedUserIds, endDate, startDate],
    )

    return rows.map((row) => ({
      log_id: Number(row.log_id),
      user_id: Number(row.user_id),
      item_type_id: toPositiveInt(row.item_type_id),
      item_type_key: String(row.item_type_key || '').trim(),
      item_type_name: String(row.item_type_name || '').trim(),
      item_title: String(row.item_title || '').trim(),
      log_status: String(row.log_status || '').trim().toUpperCase() || 'IN_PROGRESS',
      demand_id: row.demand_id === null || row.demand_id === undefined ? null : String(row.demand_id),
      demand_title: String(row.demand_title || '').trim(),
      start_date: String(row.start_date || '').trim(),
      end_date: String(row.end_date || '').trim(),
      log_date: String(row.log_date || '').trim(),
      estimate_hours: Number(row.estimate_hours || 0),
      actual_hours: Number(row.actual_hours || 0),
    }))
  },

  async listDepartmentOptions() {
    const [rows] = await pool.query(
      `SELECT
         d.id AS department_id,
         COALESCE(d.name, CONCAT('部门#', d.id)) AS department_name,
         COUNT(DISTINCT u.id) AS user_count
       FROM departments d
       INNER JOIN users u ON u.department_id = d.id
       WHERE COALESCE(d.enabled, 1) = 1
         AND COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
         AND COALESCE(u.include_in_metrics, 1) = 1
       GROUP BY d.id, d.name
       ORDER BY department_name ASC, d.id ASC`,
    )

    return rows.map((row) => ({
      department_id: toPositiveInt(row.department_id),
      department_name: String(row.department_name || '').trim(),
      user_count: Number(row.user_count || 0),
    }))
  },
}

module.exports = HumanGantt
