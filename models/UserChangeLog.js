const pool = require('../utils/db')
const User = require('./User')

const ACTION_TYPES = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  VIEW: 'VIEW',
  REGISTER: 'REGISTER',
}

const ACTION_LABELS = {
  [ACTION_TYPES.CREATE]: '新增用户',
  [ACTION_TYPES.UPDATE]: '编辑用户',
  [ACTION_TYPES.DELETE]: '删除用户',
  [ACTION_TYPES.VIEW]: '查看详情',
  [ACTION_TYPES.REGISTER]: '新用户注册',
}

const SNAPSHOT_FIELD_LABELS = {
  username: '用户名',
  real_name: '真实姓名',
  email: '邮箱',
  department_name: '部门',
  status_code: '状态',
  include_in_metrics: '纳入考核',
  role_names: '角色',
}

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function parseCommaList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function safeJsonParse(value) {
  if (!value || typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

function toDisplayName(user) {
  if (!user || typeof user !== 'object') return ''
  return String(user.real_name || user.username || '').trim()
}

function normalizeStatusLabel(value) {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized === 'ACTIVE') return '正常'
  if (normalized === 'DISABLED') return '停用'
  return normalized || '-'
}

function normalizeIncludeInMetricsLabel(value) {
  return Number(value ?? 1) === 1 ? '纳入' : '不纳入'
}

function sanitizeUserSnapshot(user) {
  if (!user || typeof user !== 'object') return null

  const roleIds = parseCommaList(user.role_ids).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
  const roleNames = parseCommaList(user.role_names)

  return {
    id: toPositiveInt(user.id),
    username: String(user.username || '').trim(),
    real_name: String(user.real_name || '').trim(),
    email: user.email ? String(user.email).trim() : '',
    department_id: toPositiveInt(user.department_id),
    department_name: String(user.department_name || '').trim(),
    status_code: String(user.status_code || 'ACTIVE').trim().toUpperCase() || 'ACTIVE',
    include_in_metrics: Number(user.include_in_metrics ?? 1) === 1 ? 1 : 0,
    role_ids: roleIds,
    role_names: roleNames,
  }
}

function getComparableValue(snapshot, field) {
  if (!snapshot) return ''
  if (field === 'role_names') {
    return [...parseCommaList(snapshot.role_names)].sort().join(', ')
  }
  if (field === 'status_code') {
    return normalizeStatusLabel(snapshot.status_code)
  }
  if (field === 'include_in_metrics') {
    return normalizeIncludeInMetricsLabel(snapshot.include_in_metrics)
  }
  return String(snapshot[field] || '').trim()
}

function buildChangeSummary(actionType, beforeSnapshot, afterSnapshot) {
  if (actionType === ACTION_TYPES.REGISTER) {
    return '新用户自主注册账号'
  }
  if (actionType === ACTION_TYPES.CREATE) {
    return '管理员新增用户'
  }
  if (actionType === ACTION_TYPES.DELETE) {
    return '管理员删除用户'
  }
  if (actionType === ACTION_TYPES.VIEW) {
    return '查看用户详情'
  }

  const changedFields = Object.keys(SNAPSHOT_FIELD_LABELS).filter((field) => {
    const beforeValue = getComparableValue(beforeSnapshot, field)
    const afterValue = getComparableValue(afterSnapshot, field)
    return beforeValue !== afterValue
  })

  if (changedFields.length === 0) return '未识别到字段变更'
  return `更新字段：${changedFields.map((field) => SNAPSHOT_FIELD_LABELS[field]).join('、')}`
}

async function resolveOperatorName(operatorUserId, fallbackName = '') {
  const normalizedUserId = toPositiveInt(operatorUserId)
  if (!normalizedUserId) return String(fallbackName || '系统').trim() || '系统'
  try {
    const user = await User.findById(normalizedUserId)
    return toDisplayName(user) || String(fallbackName || '').trim() || `用户#${normalizedUserId}`
  } catch (error) {
    return String(fallbackName || '').trim() || `用户#${normalizedUserId}`
  }
}

const UserChangeLog = {
  ACTION_TYPES,

  sanitizeUserSnapshot,

  async create({
    actionType,
    source = 'ADMIN',
    operatorUserId = null,
    operatorName = '',
    targetUserId = null,
    beforeSnapshot = null,
    afterSnapshot = null,
    changeSummary = '',
  }) {
    const normalizedActionType = String(actionType || '').trim().toUpperCase()
    if (!ACTION_LABELS[normalizedActionType]) {
      throw new Error(`unsupported user change action type: ${normalizedActionType}`)
    }

    const normalizedBefore = sanitizeUserSnapshot(beforeSnapshot)
    const normalizedAfter = sanitizeUserSnapshot(afterSnapshot)
    const targetSnapshot = normalizedAfter || normalizedBefore || null
    const resolvedOperatorUserId = toPositiveInt(operatorUserId)
    const resolvedOperatorName = await resolveOperatorName(resolvedOperatorUserId, operatorName)
    const resolvedTargetUserId = toPositiveInt(targetUserId || targetSnapshot?.id)
    const targetUsername = String(targetSnapshot?.username || '').trim()
    const targetRealName = String(targetSnapshot?.real_name || '').trim()
    const resolvedSummary = String(changeSummary || '').trim() || buildChangeSummary(normalizedActionType, normalizedBefore, normalizedAfter)

    await pool.query(
      `INSERT INTO user_change_logs (
         target_user_id,
         action_type,
         action_label,
         source,
         operator_user_id,
         operator_name,
         target_username,
         target_real_name,
         change_summary,
         before_json,
         after_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resolvedTargetUserId,
        normalizedActionType,
        ACTION_LABELS[normalizedActionType],
        String(source || 'ADMIN').trim().toUpperCase() || 'ADMIN',
        resolvedOperatorUserId,
        resolvedOperatorName,
        targetUsername || null,
        targetRealName || null,
        resolvedSummary || null,
        normalizedBefore ? JSON.stringify(normalizedBefore) : null,
        normalizedAfter ? JSON.stringify(normalizedAfter) : null,
      ],
    )
  },

  async list({
    page = 1,
    pageSize = 20,
    actionType = '',
    keyword = '',
    operatorUserId = null,
    startDate = '',
    endDate = '',
  }) {
    const offset = (Math.max(Number(page) || 1, 1) - 1) * Math.max(Number(pageSize) || 20, 1)
    const size = Math.max(Number(pageSize) || 20, 1)
    const conditions = ['1 = 1']
    const params = []

    const normalizedActionType = String(actionType || '').trim().toUpperCase()
    if (normalizedActionType && ACTION_LABELS[normalizedActionType]) {
      conditions.push('ucl.action_type = ?')
      params.push(normalizedActionType)
    }

    const normalizedOperatorUserId = toPositiveInt(operatorUserId)
    if (normalizedOperatorUserId) {
      conditions.push('ucl.operator_user_id = ?')
      params.push(normalizedOperatorUserId)
    }

    const normalizedKeyword = String(keyword || '').trim()
    if (normalizedKeyword) {
      const like = `%${normalizedKeyword}%`
      conditions.push(
        `(COALESCE(ucl.target_username, '') LIKE ? OR COALESCE(ucl.target_real_name, '') LIKE ? OR COALESCE(ucl.operator_name, '') LIKE ? OR COALESCE(ucl.change_summary, '') LIKE ?)`,
      )
      params.push(like, like, like, like)
    }

    if (startDate) {
      conditions.push('DATE(ucl.created_at) >= ?')
      params.push(startDate)
    }

    if (endDate) {
      conditions.push('DATE(ucl.created_at) <= ?')
      params.push(endDate)
    }

    const whereSql = conditions.join(' AND ')
    const listSql = `
      SELECT
        ucl.id,
        ucl.target_user_id,
        ucl.action_type,
        ucl.action_label,
        ucl.source,
        ucl.operator_user_id,
        ucl.operator_name,
        ucl.target_username,
        ucl.target_real_name,
        ucl.change_summary,
        ucl.before_json,
        ucl.after_json,
        DATE_FORMAT(ucl.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
      FROM user_change_logs ucl
      WHERE ${whereSql}
      ORDER BY ucl.created_at DESC, ucl.id DESC
      LIMIT ? OFFSET ?`

    const countSql = `SELECT COUNT(*) AS total FROM user_change_logs ucl WHERE ${whereSql}`

    const [rows] = await pool.query(listSql, [...params, size, offset])
    const [[countRow]] = await pool.query(countSql, params)

    return {
      rows: (rows || []).map((row) => ({
        ...row,
        before_data: safeJsonParse(row.before_json),
        after_data: safeJsonParse(row.after_json),
      })),
      total: Number(countRow?.total || 0),
    }
  },
}

module.exports = UserChangeLog
