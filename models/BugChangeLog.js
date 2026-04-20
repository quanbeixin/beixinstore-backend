const pool = require('../utils/db')
const User = require('./User')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
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

const SNAPSHOT_FIELD_LABELS = {
  bug_no: '编号',
  title: '标题',
  description: '详情',
  severity_name: '严重度',
  priority_name: '优先级',
  bug_type_name: '类型',
  status_name: '状态',
  product_name: '产品模块',
  issue_stage_name: '问题阶段',
  reproduce_steps: '复现步骤',
  expected_result: '期望结果',
  actual_result: '实际结果',
  environment_info: '环境信息',
  assignee_name: '处理人',
  reporter_name: '报告人',
  fix_solution: '修复方案',
  verify_result: '验证结果',
  demand_name: '需求',
  labels: '标签',
  attachment_count: '附件数量',
  updated_at: '更新时间',
}

function getComparableValue(snapshot, field) {
  if (!snapshot) return ''
  const value = snapshot[field]
  if (Array.isArray(value)) return value.join(', ')
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function buildChangeSummary(actionType, beforeSnapshot, afterSnapshot) {
  const changedFields = Object.keys(SNAPSHOT_FIELD_LABELS).filter((field) => {
    const beforeValue = getComparableValue(beforeSnapshot, field)
    const afterValue = getComparableValue(afterSnapshot, field)
    return beforeValue !== afterValue
  })

  if (changedFields.length === 0) return '未识别到字段变更'
  return `更新字段：${changedFields.map((f) => SNAPSHOT_FIELD_LABELS[f]).join('、')}`
}

function sanitizeBugSnapshot(bug) {
  if (!bug || typeof bug !== 'object') return null
  return {
    id: toPositiveInt(bug.id),
    bug_no: String(bug.bug_no || '').trim(),
    title: String(bug.title || '').trim(),
    description: String(bug.description || '').trim(),
    severity_code: String(bug.severity_code || '').trim(),
    severity_name: String(bug.severity_name || '').trim(),
    priority_code: String(bug.priority_code || '').trim(),
    priority_name: String(bug.priority_name || '').trim(),
    bug_type_code: String(bug.bug_type_code || '').trim(),
    bug_type_name: String(bug.bug_type_name || '').trim(),
    status_code: String(bug.status_code || '').trim(),
    status_name: String(bug.status_name || '').trim(),
    product_code: String(bug.product_code || '').trim(),
    product_name: String(bug.product_name || '').trim(),
    issue_stage: String(bug.issue_stage || '').trim(),
    issue_stage_name: String(bug.issue_stage_name || '').trim(),
    reproduce_steps: String(bug.reproduce_steps || '').trim(),
    expected_result: String(bug.expected_result || '').trim(),
    actual_result: String(bug.actual_result || '').trim(),
    environment_info: String(bug.environment_info || '').trim(),
    assignee_id: toPositiveInt(bug.assignee_id),
    assignee_name: String(bug.assignee_name || '').trim(),
    reporter_id: toPositiveInt(bug.reporter_id),
    reporter_name: String(bug.reporter_name || '').trim(),
    fix_solution: String(bug.fix_solution || '').trim(),
    verify_result: String(bug.verify_result || '').trim(),
    demand_id: toPositiveInt(bug.demand_id),
    demand_name: String(bug.demand_name || '').trim(),
    labels: Array.isArray(bug.labels) ? bug.labels : String(bug.labels || '').split(',').map((s) => s.trim()).filter(Boolean),
    attachment_count: Number(bug.attachment_count || 0),
    attachments: Array.isArray(bug.attachments) ? bug.attachments : null,
    created_at: bug.created_at || null,
    updated_at: bug.updated_at || null,
  }
}

const BugChangeLog = {
  async create({
    actionType,
    source = 'BUG',
    operatorUserId = null,
    operatorName = '',
    bugId = null,
    beforeSnapshot = null,
    afterSnapshot = null,
    changeSummary = '',
  }) {
    const normalizedActionType = String(actionType || '').trim().toUpperCase()
    const normalizedBefore = sanitizeBugSnapshot(beforeSnapshot)
    const normalizedAfter = sanitizeBugSnapshot(afterSnapshot)
    const targetSnapshot = normalizedAfter || normalizedBefore || null
    const resolvedOperatorUserId = toPositiveInt(operatorUserId)
    const resolvedOperatorName = await resolveOperatorName(resolvedOperatorUserId, operatorName)
    const resolvedBugId = toPositiveInt(bugId || targetSnapshot?.id)
    const resolvedSummary = String(changeSummary || '').trim() || buildChangeSummary(normalizedActionType, normalizedBefore, normalizedAfter)

    await pool.query(
      `INSERT INTO bug_change_logs (
         bug_id,
         action_type,
         action_label,
         source,
         operator_user_id,
         operator_name,
         change_summary,
         before_json,
         after_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resolvedBugId,
        normalizedActionType,
        normalizedActionType,
        String(source || 'BUG').trim().toUpperCase(),
        resolvedOperatorUserId,
        resolvedOperatorName || null,
        resolvedSummary || null,
        normalizedBefore ? JSON.stringify(normalizedBefore) : null,
        normalizedAfter ? JSON.stringify(normalizedAfter) : null,
      ],
    )
  },

  async list({ page = 1, pageSize = 20, bugId = null }) {
    const offset = (Math.max(Number(page) || 1, 1) - 1) * Math.max(Number(pageSize) || 20, 1)
    const size = Math.max(Number(pageSize) || 20, 1)
    const conditions = ['1 = 1']
    const params = []
    if (toPositiveInt(bugId)) {
      conditions.push('bcl.bug_id = ?')
      params.push(toPositiveInt(bugId))
    }
    const whereSql = conditions.join(' AND ')
    const listSql = `
      SELECT
        bcl.id,
        bcl.bug_id,
        bcl.action_type,
        bcl.action_label,
        bcl.source,
        bcl.operator_user_id,
        bcl.operator_name,
        bcl.change_summary,
        bcl.before_json,
        bcl.after_json,
        DATE_FORMAT(bcl.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
      FROM bug_change_logs bcl
      WHERE ${whereSql}
      ORDER BY bcl.created_at DESC, bcl.id DESC
      LIMIT ? OFFSET ?`

    const countSql = `SELECT COUNT(*) AS total FROM bug_change_logs bcl WHERE ${whereSql}`
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

module.exports = BugChangeLog
