const fs = require('fs')
const path = require('path')

function loadEnvFile(filePath) {
  const absPath = path.resolve(filePath)
  const text = fs.readFileSync(absPath, 'utf8')
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = String(line || '').trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) return
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1)
    if (!key) return
    process.env[key] = value
  })
}

const EVENT_SPECS = [
  {
    scene_code: 'demand_create',
    rule_name: '需求创建通知',
    receiver_type: 'role',
    receiver_config_json: { business_roles: ['demand_owner'] },
    message_title: '需求创建：${demand_name}',
    message_content: '需求 ${demand_id} 已创建，负责人：${owner_name}',
    condition_config_json: null,
  },
  {
    scene_code: 'demand_assign',
    rule_name: '需求指派通知',
    receiver_type: 'role',
    receiver_config_json: { business_roles: ['demand_owner'] },
    message_title: '需求指派：${demand_name}',
    message_content: '需求 ${demand_id} 已从 ${from_owner_name} 指派给 ${to_owner_name}',
    condition_config_json: null,
  },
  {
    scene_code: 'demand_status_change',
    rule_name: '需求状态变更通知',
    receiver_type: 'role',
    receiver_config_json: { business_roles: ['demand_owner'] },
    message_title: '需求状态变更：${demand_name}',
    message_content: '需求 ${demand_id} 状态从 ${from_status} 变更为 ${to_status}',
    condition_config_json: null,
  },
  {
    scene_code: 'node_assign',
    rule_name: '节点指派通知',
    receiver_type: 'role',
    receiver_config_json: { business_roles: ['node_owner'] },
    message_title: '节点指派：${node_name}',
    message_content: '需求 ${demand_id} 的节点 ${node_name} 已指派给 ${assignee_name}',
    condition_config_json: null,
  },
  {
    scene_code: 'node_reject',
    rule_name: '节点驳回通知',
    receiver_type: 'role',
    receiver_config_json: { business_roles: ['demand_owner'] },
    message_title: '节点驳回：${node_name}',
    message_content: '需求 ${demand_id} 的节点 ${node_name} 被驳回，原因：${reject_reason}',
    condition_config_json: null,
  },
  {
    scene_code: 'node_complete',
    rule_name: '节点完成通知',
    receiver_type: 'role',
    receiver_config_json: { business_roles: ['demand_owner'] },
    message_title: '节点完成：${node_name}',
    message_content: '需求 ${demand_id} 的节点 ${node_name} 已完成',
    condition_config_json: null,
  },
  {
    scene_code: 'task_assign',
    rule_name: '任务指派通知',
    receiver_type: 'role',
    receiver_config_json: { business_roles: ['node_assignee'] },
    message_title: '任务指派：${task_title}',
    message_content: '任务 ${task_id} 已指派，接收人：${assignee_name}',
    condition_config_json: null,
  },
  {
    scene_code: 'task_deadline',
    rule_name: '任务截止提醒通知',
    receiver_type: 'role',
    receiver_config_json: { business_roles: ['node_assignee'] },
    message_title: '任务截止提醒：${task_title}',
    message_content: '任务 ${task_id} 距截止还有 ${remaining_hours} 小时',
    condition_config_json: null,
  },
  {
    scene_code: 'task_complete',
    rule_name: '任务完成通知',
    receiver_type: 'role',
    receiver_config_json: { business_roles: ['demand_owner'] },
    message_title: '任务完成：${task_title}',
    message_content: '任务 ${task_id} 已完成，操作人：${operator_name}',
    condition_config_json: null,
  },
  {
    scene_code: 'worklog_create',
    rule_name: '事项创建通知',
    receiver_type: 'field',
    receiver_config_json: { user_id_field: 'user_id' },
    message_title: '事项创建：${task_title}',
    message_content: '你有新事项：${task_content}',
    condition_config_json: null,
  },
  {
    scene_code: 'worklog_assign',
    rule_name: '事项指派通知',
    receiver_type: 'field',
    receiver_config_json: { user_id_field: 'to_assignee_id' },
    message_title: '事项指派：${task_title}',
    message_content: '${assigned_by_name} 已将事项指派给你',
    condition_config_json: null,
  },
  {
    scene_code: 'worklog_status_change',
    rule_name: '事项状态变更通知',
    receiver_type: 'field',
    receiver_config_json: { user_id_field: 'user_id' },
    message_title: '事项状态更新：${task_title}',
    message_content: '事项状态从 ${from_status} 变更为 ${to_status}',
    condition_config_json: null,
  },
  {
    scene_code: 'worklog_deadline_remind',
    rule_name: '事项到期提醒通知',
    receiver_type: 'field',
    receiver_config_json: { user_id_field: 'user_id' },
    message_title: '事项到期提醒：${task_title}',
    message_content: '事项 ${worklog_id} 距离到期还有 ${hours_to_deadline} 小时',
    condition_config_json: {
      trigger_mode: 'deadline',
      deadline: {
        target: 'worklog',
        offset_type: 'before',
        offset_unit: 'hour',
        offset_value: 2,
        window_minutes: 5,
      },
      field_condition: null,
    },
  },
  {
    scene_code: 'weekly_report_send',
    rule_name: '周报发送通知',
    receiver_type: 'field',
    receiver_config_json: { user_id_field: 'user_id' },
    message_title: '个人周报：${week_range}',
    message_content: '${weekly_summary_text}',
    condition_config_json: null,
  },
  {
    scene_code: 'daily_report_notify',
    rule_name: '日报提醒通知',
    receiver_type: 'role',
    receiver_config_json: { business_roles: ['daily_report_unfilled', 'daily_report_unscheduled'] },
    message_title: '日报提醒：${today_date}',
    message_content: '${category_label}\n${mention_plain_text}',
    condition_config_json: null,
  },
  {
    scene_code: 'bug_create',
    rule_name: 'Bug创建通知',
    receiver_type: 'field',
    receiver_config_json: { user_id_field: 'assignee_id' },
    message_title: 'Bug创建：${bug_no}',
    message_content: '${bug_title}\n严重级别：${severity}，优先级：${priority}',
    condition_config_json: null,
  },
  {
    scene_code: 'bug_assign',
    rule_name: 'Bug指派通知',
    receiver_type: 'field',
    receiver_config_json: { user_id_field: 'to_assignee_id' },
    message_title: 'Bug指派：${bug_no}',
    message_content: '${bug_title}\n已指派给你',
    condition_config_json: null,
  },
  {
    scene_code: 'bug_status_change',
    rule_name: 'Bug状态变更通知',
    receiver_type: 'field',
    receiver_config_json: { user_id_field: 'assignee_id' },
    message_title: 'Bug状态更新：${bug_no}',
    message_content: '${bug_title}\n状态从 ${from_status} 变更为 ${to_status}',
    condition_config_json: null,
  },
  {
    scene_code: 'bug_fixed',
    rule_name: 'Bug修复通知',
    receiver_type: 'field',
    receiver_config_json: { user_id_field: 'reporter_id' },
    message_title: 'Bug已修复：${bug_no}',
    message_content: '${bug_title}\n修复人：${operator_name}',
    condition_config_json: null,
  },
  {
    scene_code: 'bug_reopen',
    rule_name: 'Bug重开通知',
    receiver_type: 'field',
    receiver_config_json: { user_id_field: 'assignee_id' },
    message_title: 'Bug重开：${bug_no}',
    message_content: '${bug_title}\n重开原因：${reopen_reason}',
    condition_config_json: null,
  },
]

function defaultRuleCode(sceneCode) {
  return `sys_${String(sceneCode || '').toLowerCase()}_default`.slice(0, 64)
}

function buildSmokeData(sceneCode, userId) {
  const base = {
    business_line_id: 0,
    event_id: `evt_${Date.now()}`,
    trace_id: `trace_${Date.now()}`,
    demand_id: 'REQ_SMOKE_001',
    demand_name: '通知规则冒烟需求',
    owner_user_id: userId,
    owner_name: '系统用户',
    to_owner_user_id: userId,
    to_owner_name: '系统用户',
    from_owner_name: '原负责人',
    node_name: '研发',
    assignee_id: userId,
    assignee_name: '系统用户',
    to_assignee_id: userId,
    from_assignee_name: '历史人员',
    task_assignee_id: userId,
    operator_id: userId,
    operator_name: '系统操作人',
    user_id: userId,
    user_name: '系统用户',
    task_id: 10001,
    task_title: '冒烟事项',
    task_content: '这是一次通知规则冒烟事项',
    status: 'IN_PROGRESS',
    from_status: 'TODO',
    to_status: 'DONE',
    remaining_hours: 2,
    worklog_id: 99001,
    week_range: '2026-04-06 ~ 2026-04-12',
    weekly_summary_text: '周报冒烟内容',
    today_date: '2026-04-09',
    category_label: '有安排待填报',
    mention_plain_text: '@系统用户 请尽快填报',
    member_groups: {
      unfilled: [{ user_id: userId, user_name: '系统用户' }],
      unscheduled: [{ user_id: userId, user_name: '系统用户' }],
    },
    bug_id: 80001,
    bug_no: 'BUG80001',
    bug_title: '通知规则冒烟Bug',
    severity: 'HIGH',
    priority: 'P1',
    reporter_id: userId,
    reporter_name: '系统用户',
    reopen_reason: '冒烟验证',
    reject_reason: '冒烟驳回',
    hours_to_deadline: 2,
  }

  if (sceneCode === 'worklog_deadline_remind') {
    return {
      ...base,
      __deadline_context: {
        matched: true,
      },
    }
  }

  return base
}

async function main() {
  const envPath = process.argv[2] || path.join(__dirname, '..', '.env.production')
  loadEnvFile(envPath)
  process.env.NOTIFICATION_SEND_MODE = 'shadow'

  const NotificationRule = require('../models/NotificationRule')
  const NotificationEvent = require('../models/NotificationEvent')
  const pool = require('../utils/db')

  const existing = await NotificationRule.list({})
  const byScene = new Map()
  existing.forEach((item) => {
    const scene = String(item.scene_code || '').trim().toLowerCase()
    if (!scene) return
    const arr = byScene.get(scene) || []
    arr.push(item)
    byScene.set(scene, arr)
  })

  const changed = []
  for (const spec of EVENT_SPECS) {
    const scene = String(spec.scene_code).toLowerCase()
    const matched = (byScene.get(scene) || []).sort((a, b) => Number(a.id) - Number(b.id))
    const target = matched[0] || null

    if (target) {
      const payload = {
        rule_code: target.rule_code || defaultRuleCode(scene),
        rule_name: spec.rule_name,
        scene_code: scene,
        channel_type: 'feishu',
        receiver_type: spec.receiver_type,
        receiver_config_json: spec.receiver_config_json,
        condition_config_json: spec.condition_config_json,
        message_title: spec.message_title,
        message_content: spec.message_content,
        is_enabled: 1,
        retry_count: 0,
        priority: 0,
      }
      await NotificationRule.update(target.id, payload)
      changed.push({ action: 'updated', scene_code: scene, id: target.id, rule_code: payload.rule_code })
      continue
    }

    const payload = {
      rule_code: defaultRuleCode(scene),
      rule_name: spec.rule_name,
      scene_code: scene,
      channel_type: 'feishu',
      receiver_type: spec.receiver_type,
      receiver_config_json: spec.receiver_config_json,
      condition_config_json: spec.condition_config_json,
      message_title: spec.message_title,
      message_content: spec.message_content,
      is_enabled: 1,
      retry_count: 0,
      priority: 0,
      created_by: 0,
      updated_by: 0,
    }
    const createdId = await NotificationRule.create(payload)
    changed.push({ action: 'created', scene_code: scene, id: createdId, rule_code: payload.rule_code })
  }

  const [userRows] = await pool.query(
    `SELECT id
     FROM users
     WHERE feishu_open_id IS NOT NULL
       AND feishu_open_id <> ''
     ORDER BY id ASC
     LIMIT 1`,
  )
  const smokeUserId = Number(userRows?.[0]?.id || 1)

  const latest = await NotificationRule.list({})
  const latestByScene = new Map()
  latest.forEach((item) => {
    const scene = String(item.scene_code || '').trim().toLowerCase()
    if (!scene) return
    const arr = latestByScene.get(scene) || []
    arr.push(item)
    latestByScene.set(scene, arr)
  })

  const smokeResults = []
  for (const spec of EVENT_SPECS) {
    const scene = String(spec.scene_code).toLowerCase()
    const matched = (latestByScene.get(scene) || []).sort((a, b) => Number(a.id) - Number(b.id))
    const target = matched[0]
    if (!target) {
      smokeResults.push({
        scene_code: scene,
        ok: false,
        reason: 'rule_not_found_after_upsert',
      })
      continue
    }

    const eventResult = await NotificationEvent.processEvent({
      eventType: scene,
      data: buildSmokeData(scene, smokeUserId),
      operatorUserId: smokeUserId,
      targetRuleIds: [Number(target.id)],
    })

    smokeResults.push({
      scene_code: scene,
      rule_id: Number(target.id),
      candidate_count: Number(eventResult.candidate_count || 0),
      matched_count: Number(eventResult.matched_count || 0),
      processed_count: Number(eventResult.processed_count || 0),
      statuses: (eventResult.results || []).map((item) => item.status),
      ok: Number(eventResult.matched_count || 0) > 0 && Number(eventResult.processed_count || 0) > 0,
    })
  }

  const summary = {
    total_event_specs: EVENT_SPECS.length,
    changed_count: changed.length,
    created_count: changed.filter((item) => item.action === 'created').length,
    updated_count: changed.filter((item) => item.action === 'updated').length,
    smoke_pass_count: smokeResults.filter((item) => item.ok).length,
    smoke_fail_count: smokeResults.filter((item) => !item.ok).length,
  }

  console.log(JSON.stringify({ summary, changed, smoke_results: smokeResults }, null, 2))
  process.exit(smokeResults.some((item) => !item.ok) ? 2 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
