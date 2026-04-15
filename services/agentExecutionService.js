const Agent = require('../models/Agent')
const Work = require('../models/Work')
const { callChatCompletion } = require('./aiClientService')

const AGENT_SCENES = Object.freeze({
  MORNING_STANDUP_ANALYSIS: {
    code: 'MORNING_STANDUP_ANALYSIS',
    label: '晨会看板分析',
  },
  DEMAND_POOL_ANALYSIS: {
    code: 'DEMAND_POOL_ANALYSIS',
    label: '需求池分析',
  },
})

function normalizeText(value, maxLength = 0) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (maxLength > 0) return text.slice(0, maxLength)
  return text
}

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function toPositiveIntList(value) {
  const source = Array.isArray(value)
    ? value
    : String(value === undefined || value === null ? '' : value)
        .split(',')
        .map((item) => String(item || '').trim())
  return Array.from(new Set(source.map((item) => toPositiveInt(item)).filter(Boolean)))
}

function toNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function truncateText(value, maxLength = 80) {
  const text = normalizeText(value)
  if (!text) return ''
  const chars = Array.from(text)
  if (chars.length <= maxLength) return text
  return `${chars.slice(0, maxLength).join('')}...`
}

function buildBulletLines(items = [], mapper, limit = 5) {
  return (Array.isArray(items) ? items : [])
    .slice(0, limit)
    .map((item, index) => `${index + 1}. ${mapper(item)}`)
}

function formatPersonNames(items = [], fallbackKey = 'username', limit = 8) {
  const names = (Array.isArray(items) ? items : [])
    .slice(0, limit)
    .map((item) => normalizeText(item?.[fallbackKey], 64))
    .filter(Boolean)
  return names.length > 0 ? names.join('、') : '无'
}

function getAlignmentItemLines(boardData = {}, alignmentTab = '') {
  const tab = normalizeText(alignmentTab, 64).toLowerCase()
  if (tab === 'yesterday_due') {
    return buildBulletLines(
      boardData.focus_yesterday_due_items,
      (item) =>
        [
          normalizeText(item?.username, 32) || `用户#${toPositiveInt(item?.user_id) || '-'}`,
          normalizeText(item?.demand_name, 80) || '无需求',
          normalizeText(item?.phase_name, 60) || '无阶段',
          normalizeText(item?.check_result, 32) || 'PENDING',
          `预计完成 ${normalizeText(item?.expected_completion_date, 32) || '-'}`,
        ].join(' | '),
      8,
    )
  }

  if (tab === 'done_today') {
    return buildBulletLines(
      boardData.focus_done_today_items,
      (item) =>
        [
          normalizeText(item?.username, 32) || `用户#${toPositiveInt(item?.user_id) || '-'}`,
          normalizeText(item?.demand_name, 80) || '无需求',
          normalizeText(item?.phase_name, 60) || '无阶段',
          normalizeText(item?.item_type_name, 60) || '无事项类型',
          `累计实际 ${toNumber(item?.cumulative_actual_hours, 0).toFixed(1)}h`,
        ].join(' | '),
      8,
    )
  }

  if (tab === 'todo_pending') {
    return buildBulletLines(
      boardData.focus_todo_items,
      (item) =>
        [
          normalizeText(item?.username, 32) || `用户#${toPositiveInt(item?.user_id) || '-'}`,
          normalizeText(item?.demand_name, 80) || '无需求',
          normalizeText(item?.phase_name, 60) || '无阶段',
          normalizeText(item?.item_type_name, 60) || '无事项类型',
          `预计开始 ${normalizeText(item?.expected_start_date, 32) || '-'}`,
        ].join(' | '),
      8,
    )
  }

  return buildBulletLines(
    boardData.focus_in_progress_items,
    (item) =>
      [
        normalizeText(item?.username, 32) || `用户#${toPositiveInt(item?.user_id) || '-'}`,
        normalizeText(item?.demand_name, 80) || '无需求',
        normalizeText(item?.phase_name, 60) || '无阶段',
        normalizeText(item?.item_type_name, 60) || '无事项类型',
        `预计完成 ${normalizeText(item?.expected_completion_date, 32) || '-'}`,
      ].join(' | '),
    8,
  )
}

function buildMemberHighlights(members = []) {
  return (Array.isArray(members) ? members : [])
    .slice()
    .sort(
      (a, b) =>
        toNumber(b?.active_item_count, 0) - toNumber(a?.active_item_count, 0) ||
        toNumber(b?.today_planned_hours, 0) - toNumber(a?.today_planned_hours, 0),
    )
    .slice(0, 8)
    .map((member, index) => {
      const statusText = member?.today_scheduled
        ? member?.today_filled
          ? '今日已填报'
          : '今日待填报'
        : '今日未安排'
      return `${index + 1}. ${normalizeText(member?.username, 32) || `用户#${toPositiveInt(member?.user_id) || '-'}`} | 进行中 ${toNumber(member?.active_item_count, 0)} 项 | 今日安排 ${toNumber(member?.today_planned_hours, 0).toFixed(1)}h | 今日已填 ${toNumber(member?.today_actual_hours, 0).toFixed(1)}h | ${statusText}`
    })
}

function buildMorningStandupContextSummary(boardData = {}, contextParams = {}) {
  const viewScope = boardData.view_scope || {}
  const summary = boardData.summary || {}
  const focusSummary = boardData.focus_summary || {}
  const members = Array.isArray(boardData.members) ? boardData.members : []
  const noFillMembers = Array.isArray(boardData.no_fill_members) ? boardData.no_fill_members : []
  const unscheduledMembers = members.filter((item) => !item?.today_scheduled)
  const alignmentTab = normalizeText(contextParams.alignment_tab, 64).toLowerCase() || 'in_progress'
  const focusLines = getAlignmentItemLines(boardData, alignmentTab)
  const memberLines = buildMemberHighlights(members)

  const sections = [
    `当前晨会范围：${normalizeText(viewScope.department_name, 120) || '全部部门'}`,
    `当前分析视角：${alignmentTab || 'in_progress'}`,
    `团队人数：${toNumber(summary.team_size, 0)}`,
    `今日有安排人数：${toNumber(summary.scheduled_users_today, 0)}`,
    `今日有安排已填报人数：${toNumber(summary.filled_users_today, 0)}`,
    `今日有安排待填报人数：${toNumber(summary.unfilled_users_today, 0)}`,
    `今日未安排人数：${toNumber(summary.unscheduled_users_today, 0)}`,
    `今日计划用时：${toNumber(summary.total_planned_hours_today, 0).toFixed(1)}h`,
    `今日实际用时：${toNumber(summary.total_actual_hours_today, 0).toFixed(1)}h`,
    `进行中事项数：${toNumber(summary.active_item_count, 0)}`,
    `逾期事项数：${toNumber(summary.overdue_item_count, 0)}`,
    `今日到期事项数：${toNumber(summary.due_today_item_count, 0)}`,
    `昨日完成事项总数：${toNumber(focusSummary.yesterday_due_total, 0)}`,
    `昨日未完成事项数：${toNumber(focusSummary.yesterday_due_not_done_count, 0)}`,
    `昨日延迟完成事项数：${toNumber(focusSummary.yesterday_due_late_done_count, 0)}`,
    `今日已完成事项数：${toNumber(focusSummary.done_today_count, 0)}`,
    `待开始事项数：${toNumber(focusSummary.todo_pending_count, 0)}`,
    `待填报成员：${formatPersonNames(noFillMembers, 'username', 10)}`,
    `今日未安排成员：${formatPersonNames(unscheduledMembers, 'username', 10)}`,
  ]

  if (focusLines.length > 0) {
    sections.push('当前重点事项：')
    sections.push(...focusLines)
  }

  if (memberLines.length > 0) {
    sections.push('成员重点概览：')
    sections.push(...memberLines)
  }

  return sections.join('\n')
}

function normalizeDemandStatus(value) {
  const status = normalizeText(value, 32).toUpperCase()
  if (['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'].includes(status)) return status
  return ''
}

function normalizeDemandPriority(value) {
  const priority = normalizeText(value, 8).toUpperCase()
  if (['P0', 'P1', 'P2', 'P3'].includes(priority)) return priority
  return ''
}

function getDemandStatusLabel(status) {
  if (status === 'TODO') return '待开始'
  if (status === 'IN_PROGRESS') return '进行中'
  if (status === 'DONE') return '已完成'
  if (status === 'CANCELLED') return '已中止'
  return status || '-'
}

function getDemandHealthLabel(healthStatus) {
  const code = normalizeText(healthStatus, 16).toLowerCase()
  if (code === 'red') return '风险'
  if (code === 'yellow') return '预警'
  if (code === 'green') return '健康'
  return healthStatus || '-'
}

function buildDemandNodeScheduleText(item = {}) {
  const plannedStart = normalizeText(item?.current_node_planned_start_date, 24)
  const plannedEnd = normalizeText(item?.current_node_planned_end_date, 24)
  if (plannedStart && plannedEnd) return `${plannedStart} - ${plannedEnd}`
  return '日期待确认'
}

function formatMonthDay(dateText) {
  const normalized = normalizeText(dateText, 24)
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return '日期待确认'
  return `${match[2]}/${match[3]}`
}

function buildDemandNodeBracketText(item = {}) {
  const nodeName =
    normalizeText(item?.current_node_name, 48) ||
    normalizeText(item?.current_phase_name, 48) ||
    '未进入流程'
  const nodeDeadline = formatMonthDay(item?.current_node_planned_end_date)
  return `${nodeName} --> ${nodeDeadline}`
}

function buildCountText(map, keyOrder = []) {
  const sourceEntries = keyOrder.length > 0
    ? keyOrder.map((key) => [key, map.get(key) || 0])
    : Array.from(map.entries())
  const entries = sourceEntries.filter(([, value]) => toNumber(value, 0) > 0)
  if (entries.length === 0) return '无'
  return entries.map(([key, value]) => `${key} ${value}`).join('，')
}

function buildDemandPoolContextSummary(payload = {}, contextParams = {}) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : []
  const total = toNumber(payload?.total, rows.length)
  const filters = {
    keyword: normalizeText(contextParams.keyword, 100),
    activeTabLabel: normalizeText(contextParams.active_tab_label, 64),
    businessGroupLabel: normalizeText(contextParams.business_group_label, 64),
    templateLabel: normalizeText(contextParams.template_label, 64),
    templateLabels: Array.isArray(contextParams.template_labels)
      ? contextParams.template_labels.map((item) => normalizeText(item, 64)).filter(Boolean)
      : [],
    ownerLabel: normalizeText(contextParams.owner_label, 64),
    scopeLabel: normalizeText(contextParams.scope_label, 64),
    updatedRangeLabel: normalizeText(contextParams.updated_range_label, 64),
  }

  const statusCountMap = new Map()
  const priorityCountMap = new Map()
  const healthCountMap = new Map()
  const ownerCountMap = new Map()
  const phaseCountMap = new Map()
  const businessGroupMap = new Map()

  rows.forEach((item) => {
    const statusLabel = getDemandStatusLabel(normalizeDemandStatus(item?.status))
    const priorityLabel = normalizeDemandPriority(item?.priority) || '-'
    const healthLabel = getDemandHealthLabel(item?.health_status)
    const ownerLabel = normalizeText(item?.owner_name, 32) || '未分配'
    const phaseLabel =
      normalizeText(item?.current_node_name, 48) ||
      normalizeText(item?.current_phase_name, 48) ||
      '未进入流程'
    const demandBusinessGroup = normalizeText(item?.business_group_name, 48) || '未分组'

    statusCountMap.set(statusLabel, toNumber(statusCountMap.get(statusLabel), 0) + 1)
    priorityCountMap.set(priorityLabel, toNumber(priorityCountMap.get(priorityLabel), 0) + 1)
    healthCountMap.set(healthLabel, toNumber(healthCountMap.get(healthLabel), 0) + 1)
    ownerCountMap.set(ownerLabel, toNumber(ownerCountMap.get(ownerLabel), 0) + 1)
    phaseCountMap.set(phaseLabel, toNumber(phaseCountMap.get(phaseLabel), 0) + 1)
    if (!businessGroupMap.has(demandBusinessGroup)) {
      businessGroupMap.set(demandBusinessGroup, [])
    }
    businessGroupMap.get(demandBusinessGroup).push(item)
  })

  const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3 }
  const groupedBusinessEntries = Array.from(businessGroupMap.entries())
    .map(([businessGroupName, items]) => ({
      businessGroupName,
      items: [...items].sort((a, b) => {
        const priorityDiff =
          (priorityRank[normalizeDemandPriority(a?.priority)] ?? 9) -
          (priorityRank[normalizeDemandPriority(b?.priority)] ?? 9)
        if (priorityDiff !== 0) return priorityDiff
        return String(b?.updated_at || '').localeCompare(String(a?.updated_at || ''))
      }),
    }))
    .sort((a, b) => b.items.length - a.items.length || a.businessGroupName.localeCompare(b.businessGroupName, 'zh-Hans-CN'))

  const businessLines = groupedBusinessEntries.map(
    (item, index) => `${index + 1}. ${item.businessGroupName} | ${item.items.length} 条`,
  )

  const groupedDemandLines = []
  groupedBusinessEntries.forEach((group) => {
    groupedDemandLines.push(`业务组：${group.businessGroupName}`)
    group.items.forEach((item, index) => {
      groupedDemandLines.push(
        [
          `${index + 1}. ${normalizeText(item?.name, 80) || `需求#${toPositiveInt(item?.id) || '-'}`}`,
          `需求ID ${toPositiveInt(item?.id) || '-'}`,
          `需求模板 ${normalizeText(item?.template_name, 64) || '-'}`,
          `优先级 ${normalizeDemandPriority(item?.priority) || '-'}`,
          `状态 ${getDemandStatusLabel(normalizeDemandStatus(item?.status))}`,
          `当前节点 ${normalizeText(item?.current_node_name, 48) || normalizeText(item?.current_phase_name, 48) || '未进入流程'}`,
          `节点排期 ${buildDemandNodeScheduleText(item)}`,
          `括号展示 ${buildDemandNodeBracketText(item)}`,
          `预期上线时间 ${normalizeText(item?.expected_release_date, 24) || '日期待确认'}`,
          `负责人 ${normalizeText(item?.owner_name, 32) || '未分配'}`,
          `更新时间 ${normalizeText(item?.updated_at, 32) || '-'}`,
        ].join(' | '),
      )
    })
  })

  const topOwnerMap = new Map(
    Array.from(ownerCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8),
  )

  const sections = [
    `当前场景：${filters.activeTabLabel || '需求池列表'}`,
    `筛选关键字：${filters.keyword || '无'}`,
    `业务条线：${filters.businessGroupLabel || '全部'}`,
    `需求模板：${filters.templateLabels.length > 0 ? filters.templateLabels.join('、') : filters.templateLabel || '全部'}`,
    `负责人筛选：${filters.ownerLabel || '全部'}`,
    `查看范围：${filters.scopeLabel || '全部需求'}`,
    `更新时间范围：${filters.updatedRangeLabel || '不限'}`,
    `命中需求数：${total}`,
    `状态分布：${buildCountText(statusCountMap, ['待开始', '进行中', '已完成', '已中止'])}`,
    `优先级分布：${buildCountText(priorityCountMap, ['P0', 'P1', 'P2', 'P3', '-'])}`,
    `健康度分布：${buildCountText(healthCountMap, ['风险', '预警', '健康'])}`,
    `当前阶段分布：${buildCountText(phaseCountMap)}`,
    `负责人分布（前几位）：${buildCountText(topOwnerMap)}`,
  ]

  if (businessLines.length > 0) {
    sections.push('业务条线分布：')
    sections.push(...businessLines)
  }

  if (groupedDemandLines.length > 0) {
    sections.push('当前需求明细（Agent 必须严格以这里的业务组、当前节点、节点排期、预期上线时间为准，不允许自行推测）：')
    sections.push(...groupedDemandLines)
  }

  return sections.join('\n')
}

async function buildMorningStandupExecutionContext({ operatorUserId, canViewAll, contextParams = {} }) {
  const tabKey = normalizeText(contextParams.tab_key, 32)
  const targetDepartmentId = toPositiveInt(contextParams.department_id)
  const boardData = await Work.getMorningStandupBoard(operatorUserId, {
    canViewAll: Boolean(canViewAll),
    targetDepartmentId,
    tabKey,
  })

  return {
    boardData,
    contextSummary: buildMorningStandupContextSummary(boardData, contextParams),
  }
}

async function buildDemandPoolExecutionContext({ operatorUserId, contextParams = {} }) {
  const payload = await Work.listDemands({
    page: 1,
    pageSize: 1000,
    keyword: normalizeText(contextParams.keyword, 100),
    status: normalizeDemandStatus(contextParams.status),
    priority: normalizeDemandPriority(contextParams.priority),
    templateId: toPositiveInt(contextParams.template_id),
    templateIds: toPositiveIntList(contextParams.template_ids),
    priorityOrder:
      normalizeText(contextParams.priority_order, 8).toLowerCase() === 'desc'
        ? 'desc'
        : normalizeText(contextParams.priority_order, 8).toLowerCase() === 'asc'
          ? 'asc'
          : '',
    businessGroupCode: normalizeText(contextParams.business_group_code, 64),
    ownerUserId: toPositiveInt(contextParams.owner_user_id),
    updatedStartDate: normalizeText(contextParams.updated_start_date, 20),
    updatedEndDate: normalizeText(contextParams.updated_end_date, 20),
    mineUserId: toBool(contextParams.mine, false) ? operatorUserId : null,
    completedOnly: toBool(contextParams.completed_only, false),
    cancelledOnly: toBool(contextParams.cancelled_only, false),
    excludeCompleted:
      toBool(contextParams.completed_only, false) || toBool(contextParams.cancelled_only, false)
        ? false
        : toBool(contextParams.exclude_completed, true),
    excludeCancelled:
      toBool(contextParams.completed_only, false) || toBool(contextParams.cancelled_only, false)
        ? false
        : toBool(contextParams.exclude_cancelled, true),
  })

  return {
    payload,
    contextSummary: buildDemandPoolContextSummary(payload, contextParams),
  }
}

function buildUserPrompt({ agent, sceneCode, contextSummary }) {
  return [
    `当前场景：${AGENT_SCENES[sceneCode]?.label || sceneCode}`,
    '',
    `当前 Agent 业务定位：${normalizeText(agent.business_purpose) || '未设置'}`,
    '',
    `输出要求：${normalizeText(agent.output_format_instruction) || '请输出清晰、简洁的纯文本分析结果。'}`,
    '',
    '以下是当前业务上下文，请基于这些信息进行分析：',
    contextSummary,
  ].join('\n')
}

async function executeAgentForScene({
  sceneCode,
  agentId,
  operatorUserId,
  canViewAll = false,
  contextParams = {},
}) {
  const normalizedSceneCode = normalizeText(sceneCode, 64).toUpperCase()
  const agent = await Agent.getAgentById(agentId)
  if (!agent) {
    throw new Error('Agent 不存在')
  }
  if (Number(agent.enabled) !== 1) {
    throw new Error('当前 Agent 未启用')
  }
  if (agent.scene_code !== normalizedSceneCode) {
    throw new Error('Agent 与当前场景不匹配')
  }

  if (
    normalizedSceneCode !== AGENT_SCENES.MORNING_STANDUP_ANALYSIS.code &&
    normalizedSceneCode !== AGENT_SCENES.DEMAND_POOL_ANALYSIS.code
  ) {
    throw new Error('当前场景暂不支持执行')
  }

  let contextSummary = ''
  let triggerSource = 'MORNING_STANDUP_PAGE'

  if (normalizedSceneCode === AGENT_SCENES.MORNING_STANDUP_ANALYSIS.code) {
    const context = await buildMorningStandupExecutionContext({
      operatorUserId,
      canViewAll,
      contextParams,
    })
    contextSummary = context.contextSummary
  } else if (normalizedSceneCode === AGENT_SCENES.DEMAND_POOL_ANALYSIS.code) {
    const context = await buildDemandPoolExecutionContext({
      operatorUserId,
      contextParams,
    })
    contextSummary = context.contextSummary
    triggerSource = 'DEMAND_POOL_PAGE'
  }

  const startedAt = new Date()
  const logId = await Agent.createExecutionLog({
    scene_code: normalizedSceneCode,
    agent_id: agent.id,
    triggered_by: operatorUserId,
    trigger_source: triggerSource,
    request_payload_json: contextParams,
    context_summary: contextSummary,
    status: 'RUNNING',
    started_at: startedAt,
  })

  try {
    const completion = await callChatCompletion({
      model: agent.model,
      systemPrompt: agent.system_prompt,
      userPrompt: buildUserPrompt({
        agent,
        sceneCode: normalizedSceneCode,
        contextSummary,
      }),
      temperature: agent.temperature,
      maxTokens: agent.max_tokens,
    })

    const responseText = normalizeText(completion?.content)
    const finishedAt = new Date()

    await Agent.finishExecutionLog(logId, {
      response_text: responseText,
      status: 'SUCCESS',
      finished_at: finishedAt,
    })

    return {
      log_id: logId,
      agent_id: agent.id,
      agent_name: agent.agent_name,
      response_text: responseText,
      context_summary_preview: truncateText(contextSummary, 600),
      finished_at: finishedAt,
    }
  } catch (error) {
    const finishedAt = new Date()
    await Agent.finishExecutionLog(logId, {
      response_text: '',
      status: 'FAILED',
      error_message: error?.message || '执行失败',
      finished_at: finishedAt,
    })
    throw error
  }
}

module.exports = {
  AGENT_SCENES,
  executeAgentForScene,
}
