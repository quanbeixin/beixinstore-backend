const Work = require('../models/Work')
const User = require('../models/User')
const Workflow = require('../models/Workflow')

const NOTIFICATION_SCENES = new Set([
  'node_assign',
  'node_reject',
  'task_assign',
  'task_deadline',
  'task_complete',
  'node_complete',
])

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return value === true || value === 'true' || value === 1 || value === '1'
}

function normalizeText(value, maxLen = 500) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.slice(0, maxLen)
}

function normalizeDemandId(value) {
  const id = String(value || '').trim().toUpperCase()
  return id || null
}

function normalizePhaseKey(value) {
  const key = String(value || '').trim().toUpperCase()
  if (!key) return ''
  return /^[A-Z][A-Z0-9_]{0,31}$/.test(key) ? key : ''
}

function normalizeBusinessGroupCode(value) {
  if (value === undefined) return undefined
  const code = String(value || '').trim().toUpperCase()
  if (!code) return null
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : ''
}

function normalizeDate(value) {
  const str = String(value || '').trim()
  if (!str) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return ''
  return str
}

function normalizeDateTime(value) {
  const str = String(value || '').trim()
  if (!str) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return `${str} 00:00:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(str)) return `${str}:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(str)) return str
  return ''
}

function formatDate(date) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function addDays(date, days) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + Number(days || 0))
  return d
}

function resolveDailyPlanRange(startDate, endDate, fallbackDate) {
  const fallback = normalizeDate(fallbackDate) || formatDate(new Date())
  const start = normalizeDate(startDate) || fallback
  const endCandidate = normalizeDate(endDate) || start
  if (endCandidate < start) {
    return { startDate: start, endDate: start }
  }
  return { startDate: start, endDate: endCandidate }
}

function resolveInsightDateRange(startRaw, endRaw) {
  const startProvided = startRaw !== undefined && startRaw !== null && String(startRaw).trim() !== ''
  const endProvided = endRaw !== undefined && endRaw !== null && String(endRaw).trim() !== ''
  const normalizedStart = startProvided ? normalizeDate(startRaw) : ''
  const normalizedEnd = endProvided ? normalizeDate(endRaw) : ''

  if (startProvided && !normalizedStart) {
    return { error: 'start_date 格式错误，需为 YYYY-MM-DD' }
  }
  if (endProvided && !normalizedEnd) {
    return { error: 'end_date 格式错误，需为 YYYY-MM-DD' }
  }

  if (normalizedStart && normalizedEnd) {
    if (normalizedStart > normalizedEnd) {
      return { error: '时间范围不合法：start_date 不能大于 end_date' }
    }
    return { startDate: normalizedStart, endDate: normalizedEnd }
  }

  if (normalizedStart && !normalizedEnd) {
    const derivedEnd = formatDate(addDays(new Date(normalizedStart), 30))
    return { startDate: normalizedStart, endDate: derivedEnd || normalizedStart }
  }

  if (!normalizedStart && normalizedEnd) {
    const derivedStart = formatDate(addDays(new Date(normalizedEnd), -30))
    return { startDate: derivedStart || normalizedEnd, endDate: normalizedEnd }
  }

  const today = new Date()
  return {
    startDate: formatDate(addDays(today, -30)),
    endDate: formatDate(today),
  }
}

function getCurrentWeekRange() {
  const today = new Date()
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const weekday = localToday.getDay()
  const offsetToMonday = weekday === 0 ? 6 : weekday - 1
  const currentWeekMonday = addDays(localToday, -offsetToMonday)
  return {
    startDate: formatDate(currentWeekMonday),
    endDate: formatDate(localToday),
  }
}

function resolveWeeklyReportDateRange(startRaw, endRaw) {
  const startProvided = startRaw !== undefined && startRaw !== null && String(startRaw).trim() !== ''
  const endProvided = endRaw !== undefined && endRaw !== null && String(endRaw).trim() !== ''
  const normalizedStart = startProvided ? normalizeDate(startRaw) : ''
  const normalizedEnd = endProvided ? normalizeDate(endRaw) : ''

  if (startProvided && !normalizedStart) {
    return { error: 'start_date 格式错误，需为 YYYY-MM-DD' }
  }
  if (endProvided && !normalizedEnd) {
    return { error: 'end_date 格式错误，需为 YYYY-MM-DD' }
  }

  if (!startProvided && !endProvided) {
    return getCurrentWeekRange()
  }

  const startDate = normalizedStart || normalizedEnd
  const endDate = normalizedEnd || normalizedStart
  if (!startDate || !endDate) {
    return { error: '时间范围不合法，请同时检查 start_date 与 end_date' }
  }
  if (startDate > endDate) {
    return { error: '时间范围不合法：start_date 不能大于 end_date' }
  }

  const startObj = new Date(`${startDate}T00:00:00`)
  const endObj = new Date(`${endDate}T00:00:00`)
  if (Number.isNaN(startObj.getTime()) || Number.isNaN(endObj.getTime())) {
    return { error: '时间范围不合法，请检查日期值' }
  }

  const daySpan = Math.floor((endObj.getTime() - startObj.getTime()) / 86400000) + 1
  if (daySpan > 62) {
    return { error: '时间范围过大，最多支持 62 天' }
  }

  return { startDate, endDate }
}

function normalizeStatus(value) {
  const status = String(value || 'TODO').trim().toUpperCase()
  return Work.DEMAND_STATUSES.includes(status) ? status : 'TODO'
}

function normalizePriority(value) {
  const priority = String(value || 'P2').trim().toUpperCase()
  return Work.DEMAND_PRIORITIES.includes(priority) ? priority : 'P2'
}

function normalizeDemandManagementMode(value) {
  const mode = String(value || 'simple').trim().toLowerCase()
  return Work.DEMAND_MANAGEMENT_MODES.includes(mode) ? mode : 'simple'
}

function normalizeDemandHealthStatus(value) {
  const status = String(value || 'green').trim().toLowerCase()
  return Work.DEMAND_HEALTH_STATUSES.includes(status) ? status : 'green'
}

function normalizeTemplateNodeConfig(value) {
  if (value === undefined) return { ok: true, value: undefined }
  if (value === null) return { ok: true, value: [] }
  if (typeof value === 'object') return { ok: true, value }
  if (typeof value !== 'string') return { ok: false, value: null }
  const text = value.trim()
  if (!text) return { ok: true, value: [] }
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object') return { ok: true, value: parsed }
    return { ok: false, value: null }
  } catch (err) {
    return { ok: false, value: null }
  }
}

function normalizeNotificationReceiverRoles(value) {
  if (value === undefined) return { ok: true, value: undefined }
  if (value === null) return { ok: true, value: [] }

  let list = value
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return { ok: true, value: [] }
    try {
      list = JSON.parse(text)
    } catch (err) {
      return { ok: false, value: null }
    }
  }

  if (!Array.isArray(list)) return { ok: false, value: null }

  const normalized = list
    .map((item) => normalizeText(item, 64))
    .filter(Boolean)

  return { ok: true, value: normalized }
}

function normalizePriorityOrder(value) {
  const order = String(value || '').trim().toLowerCase()
  if (!order) return ''
  if (order === 'asc' || order === 'desc') return order
  return ''
}

function normalizeLogStatus(value) {
  const status = String(value || 'IN_PROGRESS').trim().toUpperCase()
  return Work.WORK_LOG_STATUSES.includes(status) ? status : 'IN_PROGRESS'
}

function normalizeHours(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Number(num.toFixed(1))
}

function parseOptionalNonNegativeNumber(value, { scale = 2 } = {}) {
  if (value === undefined) return { ok: true, value: undefined }
  if (value === null || value === '') return { ok: true, value: null }
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return { ok: false, value: null }
  return { ok: true, value: Number(num.toFixed(scale)) }
}

function isDemandOpen(status) {
  return status === 'TODO' || status === 'IN_PROGRESS'
}

function hasPermission(req, code) {
  const access = req.userAccess || {}
  if (access.is_super_admin) return true
  const codes = Array.isArray(access.permission_codes) ? access.permission_codes : []
  return codes.includes(code)
}

function hasRole(req, roleKey) {
  const access = req.userAccess || {}
  if (access.is_super_admin) return true
  const roleKeys = Array.isArray(access.role_keys) ? access.role_keys : []
  return roleKeys.includes(String(roleKey || '').trim().toUpperCase())
}

function canTransferDemandOwner(req) {
  return hasPermission(req, 'demand.transfer_owner') || hasRole(req, 'ADMIN')
}

function canEditDemand(req, demand) {
  if (!demand) return false
  if (canTransferDemandOwner(req)) return true
  return Number(req.user?.id) === Number(demand.owner_user_id)
}

function ensureSuperAdmin(req, res) {
  if (req.userAccess?.is_super_admin) return true
  res.status(403).json({ success: false, message: '仅超级管理员可访问效能总览' })
  return false
}

function isWorkflowTablesMissing(err) {
  return err?.code === 'WORKFLOW_TABLES_MISSING'
}

const listWorkItemTypes = async (req, res) => {
  try {
    const enabledOnly = toBool(req.query.enabled_only, true)
    const rows = await Work.listItemTypes({ enabledOnly })
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('获取事项类型失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listDemandPhaseTypes = async (req, res) => {
  try {
    const enabledOnly = toBool(req.query.enabled_only, true)
    const rows = await Work.listDemandPhaseTypes({ enabledOnly })
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('获取需求阶段字典失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listProjectTemplatePhaseTypes = async (req, res) => {
  try {
    const enabledOnly = toBool(req.query.enabled_only, true)
    const rows = await Work.listProjectTemplatePhaseTypes({ enabledOnly })
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('获取模板需求阶段字典失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listWorkflowAssignees = async (req, res) => {
  const keyword = normalizeText(req.query.keyword, 100)
  const PAGE_SIZE = 1000
  const MAX_PAGES = 50

  try {
    const usersMap = new Map()
    let total = 0

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const { rows, total: count } = await User.findAll({
        page,
        pageSize: PAGE_SIZE,
        keyword,
        sortBy: 'real_name',
        sortOrder: 'asc',
      })

      if (page === 1) {
        total = Number(count || 0)
      }

      const list = Array.isArray(rows) ? rows : []
      list.forEach((item) => {
        const userId = toPositiveInt(item?.id)
        if (!userId || usersMap.has(userId)) return
        usersMap.set(userId, {
          id: userId,
          username: item?.username || '',
          real_name: item?.real_name || '',
          status_code: item?.status_code || 'ACTIVE',
          include_in_metrics: Number(item?.include_in_metrics ?? 1) === 1 ? 1 : 0,
          department_id: toPositiveInt(item?.department_id),
          department_name: item?.department_name || '',
        })
      })

      if (list.length < PAGE_SIZE) break
      if (total > 0 && usersMap.size >= total) break
    }

    const data = Array.from(usersMap.values()).sort((a, b) => {
      const nameA = String(a.real_name || a.username || '').trim()
      const nameB = String(b.real_name || b.username || '').trim()
      return nameA.localeCompare(nameB, 'zh-CN')
    })

    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取流程可指派成员失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createWorkItemType = async (req, res) => {
  const typeKey = normalizeText(req.body.type_key, 64).toUpperCase()
  const name = normalizeText(req.body.name, 64)
  const requireDemand = toBool(req.body.require_demand) ? 1 : 0
  const enabled = toBool(req.body.enabled, true) ? 1 : 0
  const sortOrder = Number.isFinite(Number(req.body.sort_order)) ? Number(req.body.sort_order) : 0

  if (!typeKey || !/^[A-Z0-9_]+$/.test(typeKey)) {
    return res.status(400).json({ success: false, message: 'type_key 格式不正确（仅支持大写字母、数字、下划线）' })
  }

  if (!name) {
    return res.status(400).json({ success: false, message: '事项名称不能为空' })
  }

  try {
    const id = await Work.createItemType({
      typeKey,
      name,
      requireDemand,
      enabled,
      sortOrder,
    })
    const created = await Work.findItemTypeById(id)
    return res.status(201).json({ success: true, message: '事项类型创建成功', data: created })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'type_key 已存在' })
    }
    console.error('创建事项类型失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listProjectTemplates = async (req, res) => {
  const page = toPositiveInt(req.query.page) || 1
  const pageSize = toPositiveInt(req.query.pageSize) || 20
  const keyword = normalizeText(req.query.keyword, 100)
  const statusRaw = req.query.status
  let status = null
  if (statusRaw !== undefined && statusRaw !== null && String(statusRaw).trim() !== '') {
    if (String(statusRaw) !== '0' && String(statusRaw) !== '1') {
      return res.status(400).json({ success: false, message: 'status 仅支持 0 或 1' })
    }
    status = Number(statusRaw)
  }

  try {
    const data = await Work.listProjectTemplates({
      page,
      pageSize,
      keyword,
      status,
    })
    return res.json({
      success: true,
      data: {
        list: data.rows,
        total: data.total,
        page: data.page,
        pageSize: data.pageSize,
      },
    })
  } catch (err) {
    console.error('获取项目模板列表失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getProjectTemplateById = async (req, res) => {
  const templateId = toPositiveInt(req.params.id)
  if (!templateId) {
    return res.status(400).json({ success: false, message: '模板 ID 无效' })
  }

  try {
    const template = await Work.findProjectTemplateById(templateId)
    if (!template) {
      return res.status(404).json({ success: false, message: '模板不存在' })
    }
    return res.json({ success: true, data: template })
  } catch (err) {
    console.error('获取项目模板详情失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createProjectTemplate = async (req, res) => {
  const name = normalizeText(req.body.name, 100)
  const description = normalizeText(req.body.description, 4000)
  const status = toBool(req.body.status, true) ? 1 : 0
  const nodeConfigResult = normalizeTemplateNodeConfig(req.body.node_config)

  if (!name) {
    return res.status(400).json({ success: false, message: '模板名称不能为空' })
  }
  if (!nodeConfigResult.ok) {
    return res.status(400).json({ success: false, message: 'node_config 必须是 JSON 对象/数组' })
  }

  try {
    const templateId = await Work.createProjectTemplate({
      name,
      description,
      nodeConfig: nodeConfigResult.value || [],
      status,
    })
    const created = await Work.findProjectTemplateById(templateId)
    return res.status(201).json({ success: true, message: '模板创建成功', data: created })
  } catch (err) {
    console.error('创建项目模板失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateProjectTemplate = async (req, res) => {
  const templateId = toPositiveInt(req.params.id)
  if (!templateId) {
    return res.status(400).json({ success: false, message: '模板 ID 无效' })
  }

  try {
    const existing = await Work.findProjectTemplateById(templateId)
    if (!existing) {
      return res.status(404).json({ success: false, message: '模板不存在' })
    }

    const name = req.body.name === undefined ? existing.name : normalizeText(req.body.name, 100)
    const description =
      req.body.description === undefined ? existing.description : normalizeText(req.body.description, 4000)
    const status = req.body.status === undefined ? existing.status : (toBool(req.body.status, true) ? 1 : 0)
    const nodeConfigResult = normalizeTemplateNodeConfig(
      req.body.node_config === undefined ? existing.node_config : req.body.node_config,
    )

    if (!name) {
      return res.status(400).json({ success: false, message: '模板名称不能为空' })
    }
    if (!nodeConfigResult.ok) {
      return res.status(400).json({ success: false, message: 'node_config 必须是 JSON 对象/数组' })
    }

    await Work.updateProjectTemplate(templateId, {
      name,
      description,
      nodeConfig: nodeConfigResult.value || [],
      status,
    })

    const updated = await Work.findProjectTemplateById(templateId)
    return res.json({ success: true, message: '模板更新成功', data: updated })
  } catch (err) {
    console.error('更新项目模板失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listNotificationConfigs = async (req, res) => {
  try {
    const rows = await Work.listNotificationConfigs()
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('获取通知配置失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateNotificationConfig = async (req, res) => {
  const scene = normalizeText(req.params.scene, 50).toLowerCase()
  if (!scene || !NOTIFICATION_SCENES.has(scene)) {
    return res.status(400).json({ success: false, message: 'scene 无效或不在支持范围内' })
  }

  const receiverRolesResult = normalizeNotificationReceiverRoles(req.body.receiver_roles)
  if (!receiverRolesResult.ok) {
    return res.status(400).json({ success: false, message: 'receiver_roles 必须是字符串数组或 JSON 数组' })
  }

  const advanceDaysRaw = req.body.advance_days
  const hasAdvanceDays = advanceDaysRaw !== undefined
  let parsedAdvanceDays = null
  if (hasAdvanceDays) {
    const num = Number(advanceDaysRaw)
    if (!Number.isInteger(num) || num < 0 || num > 30) {
      return res.status(400).json({ success: false, message: 'advance_days 仅支持 0-30 的整数' })
    }
    parsedAdvanceDays = num
  }

  try {
    const existing = await Work.findNotificationConfigByScene(scene)
    const nextEnabled = req.body.enabled === undefined ? Number(existing?.enabled || 1) : (toBool(req.body.enabled, true) ? 1 : 0)
    const nextRoles =
      receiverRolesResult.value === undefined
        ? Array.isArray(existing?.receiver_roles)
          ? existing.receiver_roles
          : []
        : receiverRolesResult.value
    const nextAdvanceDays =
      parsedAdvanceDays === null ? Number(existing?.advance_days || 0) : parsedAdvanceDays

    await Work.upsertNotificationConfig(scene, {
      enabled: nextEnabled,
      receiverRoles: nextRoles,
      advanceDays: nextAdvanceDays,
    })

    const updated = await Work.findNotificationConfigByScene(scene)
    return res.json({
      success: true,
      message: '通知配置更新成功',
      data: updated || {
        scene,
        enabled: nextEnabled,
        receiver_roles: nextRoles,
        advance_days: nextAdvanceDays,
      },
    })
  } catch (err) {
    console.error('更新通知配置失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listDemands = async (req, res) => {
  const page = toPositiveInt(req.query.page) || 1
  const pageSize = toPositiveInt(req.query.pageSize) || 10
  const keyword = normalizeText(req.query.keyword, 100)
  const status = normalizeStatus(req.query.status || '')
  const priority = normalizePriority(req.query.priority || '')
  const priorityOrderRaw = req.query.priority_order
  const priorityOrder = normalizePriorityOrder(priorityOrderRaw)
  const businessGroupCode = normalizeBusinessGroupCode(req.query.business_group_code)
  const ownerUserId = toPositiveInt(req.query.owner_user_id)
  const updatedStartDateRaw = req.query.updated_start_date
  const updatedEndDateRaw = req.query.updated_end_date
  const updatedStartDate = normalizeDate(updatedStartDateRaw)
  const updatedEndDate = normalizeDate(updatedEndDateRaw)
  const mine = toBool(req.query.mine, false)

  if (businessGroupCode === '') {
    return res.status(400).json({ success: false, message: 'business_group_code 格式不正确' })
  }
  if (
    priorityOrderRaw !== undefined &&
    priorityOrderRaw !== null &&
    String(priorityOrderRaw).trim() !== '' &&
    !priorityOrder
  ) {
    return res.status(400).json({ success: false, message: 'priority_order 仅支持 asc 或 desc' })
  }
  if (
    updatedStartDateRaw !== undefined &&
    updatedStartDateRaw !== null &&
    String(updatedStartDateRaw).trim() !== '' &&
    !updatedStartDate
  ) {
    return res.status(400).json({ success: false, message: 'updated_start_date 格式错误，需为 YYYY-MM-DD' })
  }
  if (
    updatedEndDateRaw !== undefined &&
    updatedEndDateRaw !== null &&
    String(updatedEndDateRaw).trim() !== '' &&
    !updatedEndDate
  ) {
    return res.status(400).json({ success: false, message: 'updated_end_date 格式错误，需为 YYYY-MM-DD' })
  }
  if (updatedStartDate && updatedEndDate && updatedStartDate > updatedEndDate) {
    return res.status(400).json({ success: false, message: '更新时间范围不合法：开始日期不能大于结束日期' })
  }

  try {
    const { rows, total } = await Work.listDemands({
      page,
      pageSize,
      keyword,
      status: req.query.status ? status : '',
      priority: req.query.priority ? priority : '',
      priorityOrder: priorityOrder || '',
      businessGroupCode: businessGroupCode || '',
      ownerUserId,
      updatedStartDate: updatedStartDate || '',
      updatedEndDate: updatedEndDate || '',
      mineUserId: mine ? req.user.id : null,
    })

    return res.json({
      success: true,
      data: {
        list: rows,
        total,
        page,
        pageSize,
      },
    })
  } catch (err) {
    console.error('获取需求池失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getDemandById = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }
    return res.json({ success: true, data: demand })
  } catch (err) {
    console.error('获取需求详情失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listDemandMembers = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }
    const members = await Work.listDemandMembers(demandId)
    return res.json({ success: true, data: members })
  } catch (err) {
    console.error('获取项目成员失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const addDemandMember = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  const userId = toPositiveInt(req.body.user_id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }
  if (!userId) {
    return res.status(400).json({ success: false, message: 'user_id 无效' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(400).json({ success: false, message: '成员用户不存在' })
    }

    const member = await Work.addDemandMember(demandId, userId)
    return res.status(201).json({ success: true, message: '项目成员添加成功', data: member })
  } catch (err) {
    console.error('添加项目成员失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const removeDemandMember = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  const userId = toPositiveInt(req.params.userId)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }
  if (!userId) {
    return res.status(400).json({ success: false, message: 'userId 无效' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const affectedRows = await Work.removeDemandMember(demandId, userId)
    if (affectedRows === 0) {
      return res.status(404).json({ success: false, message: '成员关系不存在' })
    }
    return res.json({
      success: true,
      message: '项目成员移除成功',
      data: { demand_id: demandId, user_id: userId },
    })
  } catch (err) {
    console.error('移除项目成员失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createDemand = async (req, res) => {
  const demandId = normalizeDemandId(req.body.id)
  const name = normalizeText(req.body.name, 200)
  const ownerUserIdRaw = req.body.owner_user_id
  const parsedOwnerUserId = toPositiveInt(ownerUserIdRaw)
  const ownerUserId =
    ownerUserIdRaw === undefined || ownerUserIdRaw === null || ownerUserIdRaw === ''
      ? toPositiveInt(req.user?.id)
      : parsedOwnerUserId
  const businessGroupCode = normalizeBusinessGroupCode(req.body.business_group_code)
  const managementMode = normalizeDemandManagementMode(req.body.management_mode)
  const templateIdRaw = req.body.template_id
  const templateId =
    templateIdRaw === undefined || templateIdRaw === null || templateIdRaw === ''
      ? null
      : toPositiveInt(templateIdRaw)
  const projectManagerRaw = req.body.project_manager
  const projectManager =
    projectManagerRaw === undefined || projectManagerRaw === null || projectManagerRaw === ''
      ? null
      : toPositiveInt(projectManagerRaw)
  const healthStatus = normalizeDemandHealthStatus(req.body.health_status)
  const actualStartTimeRaw = req.body.actual_start_time
  const actualStartTime = normalizeDateTime(actualStartTimeRaw)
  const actualEndTimeRaw = req.body.actual_end_time
  const actualEndTime = normalizeDateTime(actualEndTimeRaw)
  const docLink = normalizeText(req.body.doc_link, 500)
  const expectedReleaseDateRaw = req.body.expected_release_date
  const expectedReleaseDate = normalizeDate(expectedReleaseDateRaw)
  const status = normalizeStatus(req.body.status)
  const priority = normalizePriority(req.body.priority)
  const description = normalizeText(req.body.description, 2000)

  if (demandId && !/^REQ\d{3,}$/.test(demandId)) {
    return res.status(400).json({ success: false, message: '需求 ID 格式不正确，示例：REQ001' })
  }

  if (!name) {
    return res.status(400).json({ success: false, message: '需求名称不能为空' })
  }

  if (ownerUserIdRaw !== undefined && ownerUserIdRaw !== null && ownerUserIdRaw !== '' && !parsedOwnerUserId) {
    return res.status(400).json({ success: false, message: 'owner_user_id 无效' })
  }

  if (!ownerUserId) {
    return res.status(400).json({ success: false, message: 'owner_user_id 无效' })
  }

  if (businessGroupCode === '') {
    return res.status(400).json({ success: false, message: 'business_group_code 格式不正确' })
  }
  if (templateIdRaw !== undefined && templateId === null) {
    return res.status(400).json({ success: false, message: 'template_id 无效' })
  }
  if (projectManagerRaw !== undefined && projectManager === null) {
    return res.status(400).json({ success: false, message: 'project_manager 无效' })
  }
  if (
    actualStartTimeRaw !== undefined &&
    actualStartTimeRaw !== null &&
    String(actualStartTimeRaw).trim() !== '' &&
    !actualStartTime
  ) {
    return res
      .status(400)
      .json({ success: false, message: 'actual_start_time 格式错误，需为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm[:ss]' })
  }
  if (
    actualEndTimeRaw !== undefined &&
    actualEndTimeRaw !== null &&
    String(actualEndTimeRaw).trim() !== '' &&
    !actualEndTime
  ) {
    return res
      .status(400)
      .json({ success: false, message: 'actual_end_time 格式错误，需为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm[:ss]' })
  }
  if (actualStartTime && actualEndTime && actualStartTime > actualEndTime) {
    return res.status(400).json({ success: false, message: '实际时间范围不合法：actual_start_time 不能大于 actual_end_time' })
  }
  if (
    expectedReleaseDateRaw !== undefined &&
    expectedReleaseDateRaw !== null &&
    String(expectedReleaseDateRaw).trim() !== '' &&
    !expectedReleaseDate
  ) {
    return res.status(400).json({ success: false, message: 'expected_release_date 格式错误，需为 YYYY-MM-DD' })
  }

  if (req.body.owner_estimate_hours !== undefined) {
    return res.status(400).json({ success: false, message: '需求池接口不允许传 owner_estimate_hours' })
  }

  try {
    const owner = await User.findById(ownerUserId)
    if (!owner) {
      return res.status(400).json({ success: false, message: '负责人用户不存在' })
    }

    if (businessGroupCode) {
      const businessGroup = await Work.findBusinessGroupByCode(businessGroupCode, { enabledOnly: true })
      if (!businessGroup) {
        return res.status(400).json({ success: false, message: '业务组配置不存在或已停用' })
      }
    }

    if (templateId) {
      const template = await Work.findProjectTemplateById(templateId, { enabledOnly: true })
      if (!template) {
        return res.status(400).json({ success: false, message: 'template_id 对应模板不存在或未启用' })
      }
    }

    if (projectManager) {
      const manager = await User.findById(projectManager)
      if (!manager) {
        return res.status(400).json({ success: false, message: 'project_manager 用户不存在' })
      }
    }

    const finalDemandId = await Work.createDemand({
      demandId,
      name,
      ownerUserId,
      managementMode,
      templateId,
      projectManager,
      healthStatus,
      actualStartTime: actualStartTime || null,
      actualEndTime: actualEndTime || null,
      docLink: docLink || null,
      businessGroupCode,
      expectedReleaseDate: expectedReleaseDate || null,
      status,
      priority,
      description,
      createdBy: req.user.id,
    })

    let workflow = null
    let workflowInitWarning = ''
    try {
      workflow = await Workflow.initDemandWorkflow({
        demandId: finalDemandId,
        ownerUserId,
        operatorUserId: req.user.id,
        autoAssignCurrentNode: false,
      })
    } catch (workflowErr) {
      if (isWorkflowTablesMissing(workflowErr)) {
        workflowInitWarning = '流程表尚未初始化，本次未自动创建流程实例'
      } else {
        workflowInitWarning = '流程实例初始化失败，请稍后重试或联系管理员'
        console.error('需求创建后初始化流程失败:', workflowErr)
      }
    }

    const created = await Work.findDemandById(finalDemandId)
    return res.status(201).json({
      success: true,
      message: workflowInitWarning ? `需求创建成功（${workflowInitWarning}）` : '需求创建成功',
      data: {
        ...created,
        workflow,
        workflow_init_warning: workflowInitWarning || null,
      },
    })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: '需求 ID 已存在' })
    }
    console.error('创建需求失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateDemand = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  try {
    const existing = await Work.findDemandById(demandId)
    if (!existing) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    if (!canEditDemand(req, existing)) {
      return res.status(403).json({ success: false, message: '仅需求负责人或管理员可修改需求' })
    }

    if (req.body.owner_estimate_hours !== undefined) {
      return res.status(400).json({ success: false, message: '需求池接口不允许传 owner_estimate_hours' })
    }

    const canTransferOwner = canTransferDemandOwner(req)
    const parsedOwnerUserId =
      req.body.owner_user_id === undefined ? undefined : toPositiveInt(req.body.owner_user_id)
    if (req.body.owner_user_id !== undefined && !parsedOwnerUserId) {
      return res.status(400).json({ success: false, message: 'owner_user_id 无效' })
    }
    if (
      parsedOwnerUserId !== undefined &&
      Number(parsedOwnerUserId) !== Number(existing.owner_user_id) &&
      !canTransferOwner
    ) {
      return res.status(403).json({ success: false, message: '仅管理员可转交需求负责人' })
    }

    const name = normalizeText(req.body.name, 200) || existing.name
    const ownerUserId = parsedOwnerUserId === undefined ? existing.owner_user_id : parsedOwnerUserId
    const status = req.body.status ? normalizeStatus(req.body.status) : existing.status
    const priority = req.body.priority ? normalizePriority(req.body.priority) : existing.priority
    const managementMode =
      req.body.management_mode === undefined
        ? normalizeDemandManagementMode(existing.management_mode)
        : normalizeDemandManagementMode(req.body.management_mode)
    const healthStatus =
      req.body.health_status === undefined
        ? normalizeDemandHealthStatus(existing.health_status)
        : normalizeDemandHealthStatus(req.body.health_status)
    const parsedTemplateId =
      req.body.template_id === undefined
        ? undefined
        : req.body.template_id === null || String(req.body.template_id).trim() === ''
          ? null
          : toPositiveInt(req.body.template_id)
    if (req.body.template_id !== undefined && req.body.template_id !== null && req.body.template_id !== '' && !parsedTemplateId) {
      return res.status(400).json({ success: false, message: 'template_id 无效' })
    }
    const templateId = parsedTemplateId === undefined ? toPositiveInt(existing.template_id) : parsedTemplateId
    const parsedProjectManager =
      req.body.project_manager === undefined
        ? undefined
        : req.body.project_manager === null || String(req.body.project_manager).trim() === ''
          ? null
          : toPositiveInt(req.body.project_manager)
    if (
      req.body.project_manager !== undefined &&
      req.body.project_manager !== null &&
      req.body.project_manager !== '' &&
      !parsedProjectManager
    ) {
      return res.status(400).json({ success: false, message: 'project_manager 无效' })
    }
    const projectManager =
      parsedProjectManager === undefined ? toPositiveInt(existing.project_manager) : parsedProjectManager
    const parsedBusinessGroupCode = normalizeBusinessGroupCode(req.body.business_group_code)
    const businessGroupCode =
      parsedBusinessGroupCode === undefined ? existing.business_group_code : parsedBusinessGroupCode
    let actualStartTime = existing.actual_start_time || null
    if (req.body.actual_start_time !== undefined) {
      const raw = req.body.actual_start_time
      if (raw === null || String(raw).trim() === '') {
        actualStartTime = null
      } else {
        const normalized = normalizeDateTime(raw)
        if (!normalized) {
          return res
            .status(400)
            .json({ success: false, message: 'actual_start_time 格式错误，需为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm[:ss]' })
        }
        actualStartTime = normalized
      }
    }
    let actualEndTime = existing.actual_end_time || null
    if (req.body.actual_end_time !== undefined) {
      const raw = req.body.actual_end_time
      if (raw === null || String(raw).trim() === '') {
        actualEndTime = null
      } else {
        const normalized = normalizeDateTime(raw)
        if (!normalized) {
          return res
            .status(400)
            .json({ success: false, message: 'actual_end_time 格式错误，需为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm[:ss]' })
        }
        actualEndTime = normalized
      }
    }
    if (actualStartTime && actualEndTime && actualStartTime > actualEndTime) {
      return res.status(400).json({ success: false, message: '实际时间范围不合法：actual_start_time 不能大于 actual_end_time' })
    }
    const docLink =
      req.body.doc_link === undefined ? existing.doc_link : normalizeText(req.body.doc_link, 500) || null
    let expectedReleaseDate = existing.expected_release_date || null
    if (req.body.expected_release_date !== undefined) {
      const raw = req.body.expected_release_date
      if (raw === null || String(raw).trim() === '') {
        expectedReleaseDate = null
      } else {
        const normalized = normalizeDate(raw)
        if (!normalized) {
          return res.status(400).json({ success: false, message: 'expected_release_date 格式错误，需为 YYYY-MM-DD' })
        }
        expectedReleaseDate = normalized
      }
    }
    const description =
      req.body.description === undefined
        ? existing.description
        : normalizeText(req.body.description, 2000)

    if (!name) {
      return res.status(400).json({ success: false, message: '需求名称不能为空' })
    }

    const owner = await User.findById(ownerUserId)
    if (!owner) {
      return res.status(400).json({ success: false, message: '负责人用户不存在' })
    }

    if (parsedBusinessGroupCode === '') {
      return res.status(400).json({ success: false, message: 'business_group_code 格式不正确' })
    }

    if (parsedBusinessGroupCode !== undefined && businessGroupCode) {
      const businessGroup = await Work.findBusinessGroupByCode(businessGroupCode, { enabledOnly: true })
      if (!businessGroup) {
        return res.status(400).json({ success: false, message: '业务组配置不存在或已停用' })
      }
    }

    if (templateId) {
      const template = await Work.findProjectTemplateById(templateId, { enabledOnly: true })
      if (!template) {
        return res.status(400).json({ success: false, message: 'template_id 对应模板不存在或未启用' })
      }
    }

    if (projectManager) {
      const manager = await User.findById(projectManager)
      if (!manager) {
        return res.status(400).json({ success: false, message: 'project_manager 用户不存在' })
      }
    }

    const completedAt = isDemandOpen(status)
      ? null
      : req.body.completed_at || existing.completed_at || new Date()

    await Work.updateDemand(demandId, {
      name,
      ownerUserId,
      managementMode,
      templateId: templateId || null,
      projectManager: projectManager || null,
      healthStatus,
      actualStartTime,
      actualEndTime,
      docLink,
      businessGroupCode,
      expectedReleaseDate,
      status,
      priority,
      description,
      completedAt,
    })

    const updated = await Work.findDemandById(demandId)
    return res.json({ success: true, message: '需求更新成功', data: updated })
  } catch (err) {
    console.error('更新需求失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteDemand = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  if (!canTransferDemandOwner(req)) {
    return res.status(403).json({ success: false, message: '仅管理员可删除需求' })
  }

  try {
    const existing = await Work.findDemandById(demandId)
    if (!existing) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const result = await Work.deleteDemand(demandId)
    if (result.mode === 'ARCHIVED') {
      return res.json({
        success: true,
        message: `需求已归档（存在 ${result.related_log_count} 条关联工作记录，未做物理删除）`,
        data: {
          demand_id: demandId,
          mode: result.mode,
          related_log_count: result.related_log_count,
        },
      })
    }

    return res.json({
      success: true,
      message: '需求已删除',
      data: {
        demand_id: demandId,
        mode: result.mode,
        related_log_count: result.related_log_count,
      },
    })
  } catch (err) {
    console.error('删除需求失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listArchivedDemands = async (req, res) => {
  const page = toPositiveInt(req.query.page) || 1
  const pageSize = toPositiveInt(req.query.pageSize) || 10
  const keyword = normalizeText(req.query.keyword, 100)
  const ownerUserId = toPositiveInt(req.query.owner_user_id)
  const archivedStartDateRaw = req.query.archived_start_date
  const archivedEndDateRaw = req.query.archived_end_date
  const archivedStartDate = normalizeDate(archivedStartDateRaw)
  const archivedEndDate = normalizeDate(archivedEndDateRaw)

  if (
    archivedStartDateRaw !== undefined &&
    archivedStartDateRaw !== null &&
    String(archivedStartDateRaw).trim() !== '' &&
    !archivedStartDate
  ) {
    return res.status(400).json({ success: false, message: 'archived_start_date 格式错误，需为 YYYY-MM-DD' })
  }
  if (
    archivedEndDateRaw !== undefined &&
    archivedEndDateRaw !== null &&
    String(archivedEndDateRaw).trim() !== '' &&
    !archivedEndDate
  ) {
    return res.status(400).json({ success: false, message: 'archived_end_date 格式错误，需为 YYYY-MM-DD' })
  }
  if (archivedStartDate && archivedEndDate && archivedStartDate > archivedEndDate) {
    return res.status(400).json({ success: false, message: '归档时间范围不合法：开始日期不能大于结束日期' })
  }

  try {
    const { rows, total } = await Work.listArchivedDemands({
      page,
      pageSize,
      keyword,
      ownerUserId,
      archivedStartDate: archivedStartDate || '',
      archivedEndDate: archivedEndDate || '',
    })

    return res.json({
      success: true,
      data: {
        list: rows,
        total,
        page,
        pageSize,
      },
    })
  } catch (err) {
    console.error('获取归档需求失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const purgeArchivedDemand = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  const confirmDemandIdRaw = req.body?.confirm_demand_id
  const confirmDemandId =
    confirmDemandIdRaw === undefined || confirmDemandIdRaw === null || String(confirmDemandIdRaw).trim() === ''
      ? ''
      : normalizeDemandId(confirmDemandIdRaw)

  if (confirmDemandIdRaw !== undefined && confirmDemandIdRaw !== null && String(confirmDemandIdRaw).trim() !== '') {
    if (!confirmDemandId) {
      return res.status(400).json({ success: false, message: 'confirm_demand_id 格式错误' })
    }
    if (confirmDemandId !== demandId) {
      return res.status(400).json({ success: false, message: '确认需求 ID 不匹配' })
    }
  }

  try {
    const result = await Work.purgeArchivedDemand(demandId)
    return res.json({
      success: true,
      message: '归档需求已彻底删除',
      data: result,
    })
  } catch (err) {
    if (err?.code === 'DEMAND_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }
    if (err?.code === 'DEMAND_NOT_ARCHIVED') {
      return res.status(400).json({ success: false, message: '仅已归档需求可彻底删除' })
    }
    console.error('彻底删除归档需求失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const restoreArchivedDemand = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  try {
    const result = await Work.restoreArchivedDemand(demandId)
    return res.json({
      success: true,
      message: '归档需求已恢复',
      data: result,
    })
  } catch (err) {
    if (err?.code === 'DEMAND_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }
    if (err?.code === 'DEMAND_NOT_ARCHIVED') {
      return res.status(400).json({ success: false, message: '仅已归档需求可恢复' })
    }
    console.error('恢复归档需求失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listLogs = async (req, res) => {
  const page = toPositiveInt(req.query.page) || 1
  const pageSize = toPositiveInt(req.query.pageSize) || 20
  const keyword = normalizeText(req.query.keyword, 100)
  const demandId = normalizeDemandId(req.query.demand_id || '')
  const phaseKey = normalizePhaseKey(req.query.phase_key || '')
  const itemTypeId = toPositiveInt(req.query.item_type_id)
  const startDate = normalizeDate(req.query.start_date)
  const endDate = normalizeDate(req.query.end_date)
  const logStatusRaw = req.query.log_status
  const logStatus =
    logStatusRaw === undefined || logStatusRaw === null || String(logStatusRaw).trim() === ''
      ? ''
      : String(logStatusRaw).trim().toUpperCase()
  const unifiedStatusRaw = req.query.unified_status
  const unifiedStatus =
    unifiedStatusRaw === undefined || unifiedStatusRaw === null || String(unifiedStatusRaw).trim() === ''
      ? ''
      : String(unifiedStatusRaw).trim().toUpperCase()
  const requestedUserId = toPositiveInt(req.query.user_id)
  const teamScope = String(req.query.scope || '').trim().toLowerCase() === 'team'
  const canViewTeam = hasPermission(req, 'worklog.view.team')

  if (logStatus && !Work.WORK_LOG_STATUSES.includes(logStatus)) {
    return res.status(400).json({ success: false, message: 'log_status 无效' })
  }
  if (unifiedStatus && !Work.WORK_UNIFIED_STATUSES.includes(unifiedStatus)) {
    return res.status(400).json({ success: false, message: 'unified_status 无效' })
  }

  if (requestedUserId && requestedUserId !== req.user.id && !canViewTeam) {
    return res.status(403).json({ success: false, message: '无权限查看其他成员工作记录' })
  }

  if (teamScope && !canViewTeam) {
    return res.status(403).json({ success: false, message: '无权限查看团队工作记录' })
  }

  const userId = teamScope ? null : requestedUserId || req.user.id
  const teamScopeUserId = teamScope ? req.user.id : null

  try {
    const { rows, total } = await Work.listLogs({
      page,
      pageSize,
      keyword,
      userId,
      demandId,
      phaseKey,
      itemTypeId,
      startDate,
      endDate,
      logStatus,
      unifiedStatus,
      teamScopeUserId,
    })

    return res.json({
      success: true,
      data: {
        list: rows,
        total,
        page,
        pageSize,
      },
    })
  } catch (err) {
    console.error('获取工作记录失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createLog = async (req, res) => {
  if (
    req.body.owner_estimate_hours !== undefined ||
    req.body.owner_estimated_by !== undefined ||
    req.body.owner_estimated_at !== undefined ||
    req.body.assigned_by_user_id !== undefined ||
    req.body.task_source !== undefined
  ) {
    return res.status(400).json({ success: false, message: '个人填报接口不允许写入负责人预估字段' })
  }

  const logDate = normalizeDate(req.body.log_date)
  const itemTypeId = toPositiveInt(req.body.item_type_id)
  const description = normalizeText(req.body.description, 2000)
  const legacyActualHours = normalizeHours(req.body.actual_hours, null)
  const personalEstimateHours = normalizeHours(
    req.body.personal_estimate_hours,
    legacyActualHours !== null ? legacyActualHours : null,
  )
  let actualHours = normalizeHours(req.body.actual_hours, 0)
  const remainingHours = normalizeHours(req.body.remaining_hours, 0)
  const demandId = normalizeDemandId(req.body.demand_id)
  let phaseKey = normalizePhaseKey(req.body.phase_key)
  const expectedStartDateRaw = req.body.expected_start_date
  let expectedStartDate = normalizeDate(expectedStartDateRaw)
  const expectedCompletionDateRaw = req.body.expected_completion_date
  const expectedCompletionDate = normalizeDate(expectedCompletionDateRaw)
  const hasManualLogStatus =
    req.body.log_status !== undefined &&
    req.body.log_status !== null &&
    String(req.body.log_status).trim() !== ''
  let logStatus = hasManualLogStatus ? normalizeLogStatus(req.body.log_status) : ''
  const logCompletedAtRaw = req.body.log_completed_at
  const logCompletedAt = normalizeDateTime(logCompletedAtRaw)

  if (!logDate) {
    return res.status(400).json({ success: false, message: 'log_date 格式错误，需为 YYYY-MM-DD' })
  }

  if (!itemTypeId) {
    return res.status(400).json({ success: false, message: 'item_type_id 无效' })
  }

  if (!description) {
    return res.status(400).json({ success: false, message: '工作描述不能为空' })
  }

  if (personalEstimateHours === null || personalEstimateHours <= 0) {
    return res.status(400).json({ success: false, message: 'personal_estimate_hours 必须大于 0' })
  }

  if (logStatus === 'DONE' && Number(actualHours || 0) === 0) {
    actualHours = personalEstimateHours
  }

  if (actualHours === null || actualHours < 0) {
    return res.status(400).json({ success: false, message: 'actual_hours 不能小于 0' })
  }

  if (remainingHours === null || remainingHours < 0) {
    return res.status(400).json({ success: false, message: 'remaining_hours 不能小于 0' })
  }

  if (
    expectedStartDateRaw !== undefined &&
    expectedStartDateRaw !== null &&
    String(expectedStartDateRaw).trim() !== '' &&
    !expectedStartDate
  ) {
    return res.status(400).json({ success: false, message: 'expected_start_date 格式错误，需为 YYYY-MM-DD' })
  }

  if (
    expectedCompletionDateRaw !== undefined &&
    expectedCompletionDateRaw !== null &&
    String(expectedCompletionDateRaw).trim() !== '' &&
    !expectedCompletionDate
  ) {
    return res.status(400).json({ success: false, message: 'expected_completion_date 格式错误，需为 YYYY-MM-DD' })
  }

  if (
    logCompletedAtRaw !== undefined &&
    logCompletedAtRaw !== null &&
    String(logCompletedAtRaw).trim() !== '' &&
    !logCompletedAt
  ) {
    return res.status(400).json({ success: false, message: 'log_completed_at 格式错误，需为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss' })
  }

  try {
    if (!expectedStartDate) {
      expectedStartDate = logDate
    }

    if (!hasManualLogStatus) {
      const today = formatDate(new Date())
      logStatus = expectedStartDate > today ? 'TODO' : 'IN_PROGRESS'
    }

    const itemType = await Work.findItemTypeById(itemTypeId)
    if (!itemType || Number(itemType.enabled) === 0) {
      return res.status(400).json({ success: false, message: '事项类型不存在或已停用' })
    }

    if (Number(itemType.require_demand) === 1 && !demandId) {
      return res.status(400).json({ success: false, message: '当前事项类型必须关联需求' })
    }

    if (demandId) {
      const demand = await Work.findDemandById(demandId)
      if (!demand) {
        return res.status(400).json({ success: false, message: '关联需求不存在' })
      }

      if (!phaseKey) {
        return res.status(400).json({ success: false, message: '关联需求时必须选择阶段' })
      }

      const phase = await Work.findDemandPhaseTypeByKey(phaseKey)
      if (!phase) {
        return res.status(400).json({ success: false, message: '所选阶段不存在或已停用' })
      }

    } else {
      phaseKey = null
    }

    const id = await Work.createLog({
      userId: req.user.id,
      logDate,
      itemTypeId,
      description,
      personalEstimateHours,
      actualHours,
      remainingHours,
      demandId,
      phaseKey,
      expectedStartDate,
      expectedCompletionDate: expectedCompletionDate || null,
      logStatus,
      taskSource: 'SELF',
      assignedByUserId: null,
      logCompletedAt: logCompletedAt || null,
    })

    try {
      const { startDate, endDate } = resolveDailyPlanRange(
        expectedStartDate,
        expectedCompletionDate,
        logDate,
      )
      await Work.seedDailyPlansForLog(id, {
        userId: req.user.id,
        expectedStartDate: startDate,
        expectedCompletionDate: endDate,
        totalPlannedHours: personalEstimateHours,
        source: 'SYSTEM_SPLIT',
        createdBy: req.user.id,
      })
    } catch (dailyPlanErr) {
      console.error('创建工作记录后初始化日计划失败:', dailyPlanErr)
    }

    let workflowSync = null
    try {
      workflowSync = await Workflow.syncFromWorkLogStatusChange({
        logId: id,
        demandId,
        phaseKey,
        itemTypeKey: String(itemType.type_key || '').toUpperCase(),
        taskSource: 'SELF',
        operatorUserId: req.user.id,
        previousStatus: null,
        nextStatus: logStatus,
      })
    } catch (workflowErr) {
      if (!isWorkflowTablesMissing(workflowErr)) {
        console.error('创建工作记录后同步流程状态失败:', workflowErr)
      }
    }

    const created = await Work.findLogById(id)
    return res.status(201).json({
      success: true,
      message: '工作记录创建成功',
      data: {
        ...created,
        workflow_sync: workflowSync,
      },
    })
  } catch (err) {
    console.error('创建工作记录失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createOwnerAssignedLog = async (req, res) => {
  if (
    req.body.owner_estimated_by !== undefined ||
    req.body.owner_estimated_at !== undefined ||
    req.body.assigned_by_user_id !== undefined ||
    req.body.task_source !== undefined
  ) {
    return res.status(400).json({ success: false, message: 'Owner 指派接口不允许写入受限字段' })
  }

  const isSuperAdmin = Boolean(req.userAccess?.is_super_admin)
  if (!isSuperAdmin) {
    const isManager = await Work.isDepartmentManager(req.user.id)
    if (!isManager) {
      return res.status(403).json({ success: false, message: '仅部门负责人可新增指派事项' })
    }
  }

  const assigneeUserId = toPositiveInt(req.body.assignee_user_id)
  if (!assigneeUserId) {
    return res.status(400).json({ success: false, message: 'assignee_user_id 无效' })
  }

  const canAssign = await Work.canManageAssigneeByOwner(req.user.id, assigneeUserId, { isSuperAdmin })
  if (!canAssign) {
    return res.status(403).json({ success: false, message: '仅可指派给管理范围内成员' })
  }

  const logDateRaw = req.body.log_date
  const logDate = normalizeDate(logDateRaw) || formatDate(new Date())
  const itemTypeId = toPositiveInt(req.body.item_type_id)
  const description = normalizeText(req.body.description, 2000)
  const ownerEstimateHours = normalizeHours(
    req.body.owner_estimate_hours,
    normalizeHours(req.body.personal_estimate_hours, null),
  )
  const personalEstimateHours = ownerEstimateHours
  let actualHours = normalizeHours(req.body.actual_hours, 0)
  const remainingHours = normalizeHours(
    req.body.remaining_hours,
    personalEstimateHours !== null ? personalEstimateHours : 0,
  )
  const demandId = normalizeDemandId(req.body.demand_id)
  let phaseKey = normalizePhaseKey(req.body.phase_key)
  const expectedStartDateRaw = req.body.expected_start_date
  let expectedStartDate = normalizeDate(expectedStartDateRaw)
  const expectedCompletionDateRaw = req.body.expected_completion_date
  const expectedCompletionDate = normalizeDate(expectedCompletionDateRaw)
  const hasManualLogStatus =
    req.body.log_status !== undefined &&
    req.body.log_status !== null &&
    String(req.body.log_status).trim() !== ''
  let logStatus = hasManualLogStatus ? normalizeLogStatus(req.body.log_status) : ''
  const logCompletedAtRaw = req.body.log_completed_at
  const logCompletedAt = normalizeDateTime(logCompletedAtRaw)

  if (!itemTypeId) {
    return res.status(400).json({ success: false, message: 'item_type_id 无效' })
  }

  if (!description) {
    return res.status(400).json({ success: false, message: '工作描述不能为空' })
  }

  if (ownerEstimateHours === null || ownerEstimateHours <= 0) {
    return res.status(400).json({ success: false, message: 'owner_estimate_hours 必须大于 0' })
  }

  if (
    expectedStartDateRaw !== undefined &&
    expectedStartDateRaw !== null &&
    String(expectedStartDateRaw).trim() !== '' &&
    !expectedStartDate
  ) {
    return res.status(400).json({ success: false, message: 'expected_start_date 格式错误，需为 YYYY-MM-DD' })
  }

  if (
    expectedCompletionDateRaw !== undefined &&
    expectedCompletionDateRaw !== null &&
    String(expectedCompletionDateRaw).trim() !== '' &&
    !expectedCompletionDate
  ) {
    return res.status(400).json({ success: false, message: 'expected_completion_date 格式错误，需为 YYYY-MM-DD' })
  }

  if (
    logCompletedAtRaw !== undefined &&
    logCompletedAtRaw !== null &&
    String(logCompletedAtRaw).trim() !== '' &&
    !logCompletedAt
  ) {
    return res.status(400).json({ success: false, message: 'log_completed_at 格式错误，需为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss' })
  }

  if (!expectedStartDate) {
    expectedStartDate = logDate
  }

  if (!hasManualLogStatus) {
    const today = formatDate(new Date())
    logStatus = expectedStartDate > today ? 'TODO' : 'IN_PROGRESS'
  }

  if (logStatus === 'DONE' && Number(actualHours || 0) === 0) {
    actualHours = personalEstimateHours
  }
  if (actualHours === null || actualHours < 0) {
    return res.status(400).json({ success: false, message: 'actual_hours 不能小于 0' })
  }
  if (remainingHours === null || remainingHours < 0) {
    return res.status(400).json({ success: false, message: 'remaining_hours 不能小于 0' })
  }

  try {
    const itemType = await Work.findItemTypeById(itemTypeId)
    if (!itemType || Number(itemType.enabled) === 0) {
      return res.status(400).json({ success: false, message: '事项类型不存在或已停用' })
    }

    if (Number(itemType.require_demand) === 1 && !demandId) {
      return res.status(400).json({ success: false, message: '当前事项类型必须关联需求' })
    }

    if (demandId) {
      const demand = await Work.findDemandById(demandId)
      if (!demand) {
        return res.status(400).json({ success: false, message: '关联需求不存在' })
      }

      if (!phaseKey) {
        return res.status(400).json({ success: false, message: '关联需求时必须选择阶段' })
      }

      const phase = await Work.findDemandPhaseTypeByKey(phaseKey)
      if (!phase) {
        return res.status(400).json({ success: false, message: '所选阶段不存在或已停用' })
      }

    } else {
      phaseKey = null
    }

    const id = await Work.createLog({
      userId: assigneeUserId,
      logDate,
      itemTypeId,
      description,
      personalEstimateHours,
      actualHours,
      remainingHours,
      logStatus,
      taskSource: 'OWNER_ASSIGN',
      demandId,
      phaseKey,
      assignedByUserId: req.user.id,
      expectedStartDate,
      expectedCompletionDate: expectedCompletionDate || null,
      logCompletedAt: logCompletedAt || null,
    })

    try {
      const { startDate, endDate } = resolveDailyPlanRange(
        expectedStartDate,
        expectedCompletionDate,
        logDate,
      )
      await Work.seedDailyPlansForLog(id, {
        userId: assigneeUserId,
        expectedStartDate: startDate,
        expectedCompletionDate: endDate,
        totalPlannedHours: personalEstimateHours,
        source: 'OWNER_ASSIGN',
        createdBy: req.user.id,
      })
    } catch (dailyPlanErr) {
      console.error('创建 Owner 指派事项后初始化日计划失败:', dailyPlanErr)
    }

    try {
      await Work.updateLogOwnerEstimate(id, {
        ownerEstimateHours,
        ownerEstimatedBy: req.user.id,
      })
    } catch (ownerEstimateErr) {
      if (ownerEstimateErr?.code === 'OWNER_ESTIMATE_FIELDS_MISSING') {
        return res.status(500).json({
          success: false,
          message: '缺少 owner 预估字段，请先执行数据库补丁后重试',
        })
      }
      throw ownerEstimateErr
    }

    const created = await Work.findLogById(id)
    return res.status(201).json({
      success: true,
      message: 'Owner 指派事项创建成功',
      data: created,
    })
  } catch (err) {
    console.error('创建 Owner 指派事项失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateLog = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) {
    return res.status(400).json({ success: false, message: '工作记录 ID 无效' })
  }

  if (
    req.body.owner_estimate_hours !== undefined ||
    req.body.owner_estimated_by !== undefined ||
    req.body.owner_estimated_at !== undefined ||
    req.body.assigned_by_user_id !== undefined ||
    req.body.task_source !== undefined
  ) {
    return res.status(400).json({ success: false, message: '个人更新接口不允许写入负责人预估字段' })
  }

  try {
    const existing = await Work.findLogById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '工作记录不存在' })
    }

    if (Number(existing.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: '仅可修改自己的工作记录' })
    }

    const logDate = normalizeDate(req.body.log_date) || existing.log_date
    const itemTypeId = toPositiveInt(req.body.item_type_id) || existing.item_type_id
    const description =
      req.body.description === undefined
        ? existing.description
        : normalizeText(req.body.description, 2000)
    const personalEstimateHours =
      req.body.personal_estimate_hours === undefined
        ? Number(existing.personal_estimate_hours ?? existing.actual_hours ?? 0)
        : normalizeHours(req.body.personal_estimate_hours, null)
    let actualHours =
      req.body.actual_hours === undefined
        ? normalizeHours(existing.actual_hours, 0)
        : normalizeHours(req.body.actual_hours, 0)
    const remainingHours =
      req.body.remaining_hours === undefined
        ? Number(existing.remaining_hours)
        : normalizeHours(req.body.remaining_hours, null)
    const demandId =
      req.body.demand_id === undefined ? existing.demand_id : normalizeDemandId(req.body.demand_id)
    let phaseKey =
      req.body.phase_key === undefined ? normalizePhaseKey(existing.phase_key) : normalizePhaseKey(req.body.phase_key)
    let expectedStartDate = existing.expected_start_date || null
    if (req.body.expected_start_date !== undefined) {
      const raw = req.body.expected_start_date
      const normalized = normalizeDate(raw)
      const hasValue = raw !== null && String(raw).trim() !== ''
      if (hasValue && !normalized) {
        return res.status(400).json({ success: false, message: 'expected_start_date 格式错误，需为 YYYY-MM-DD' })
      }
      expectedStartDate = normalized || null
    }
    const logStatus =
      req.body.log_status === undefined ? normalizeLogStatus(existing.log_status) : normalizeLogStatus(req.body.log_status)
    let logCompletedAt = existing.log_completed_at || null
    if (req.body.log_completed_at !== undefined) {
      const raw = req.body.log_completed_at
      const normalized = normalizeDateTime(raw)
      const hasValue = raw !== null && String(raw).trim() !== ''
      if (hasValue && !normalized) {
        return res
          .status(400)
          .json({ success: false, message: 'log_completed_at 格式错误，需为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss' })
      }
      logCompletedAt = normalized || null
    }
    let expectedCompletionDate = existing.expected_completion_date || null
    if (req.body.expected_completion_date !== undefined) {
      const raw = req.body.expected_completion_date
      const normalized = normalizeDate(raw)
      const hasValue = raw !== null && String(raw).trim() !== ''
      if (hasValue && !normalized) {
        return res.status(400).json({ success: false, message: 'expected_completion_date 格式错误，需为 YYYY-MM-DD' })
      }
      expectedCompletionDate = normalized || null
    }

    // 仅通过“状态切换”接口把事项改为非 DONE 且未显式传入完成日期时，默认清空完成日期。
    // 若前端显式传入 log_completed_at（例如在“修改记录”弹窗中维护），则以用户输入为准。
    if (req.body.log_status !== undefined && req.body.log_completed_at === undefined && logStatus !== 'DONE') {
      logCompletedAt = null
    }

    if (!description) {
      return res.status(400).json({ success: false, message: '工作描述不能为空' })
    }

    if (personalEstimateHours === null || personalEstimateHours < 0) {
      return res.status(400).json({ success: false, message: 'personal_estimate_hours 不能小于 0' })
    }

    if (logStatus === 'DONE' && Number(actualHours || 0) === 0) {
      actualHours = personalEstimateHours
    }

    if (actualHours === null || actualHours < 0) {
      return res.status(400).json({ success: false, message: 'actual_hours 不能小于 0' })
    }

    if (remainingHours === null || remainingHours < 0) {
      return res.status(400).json({ success: false, message: 'remaining_hours 不能小于 0' })
    }

    const itemType = await Work.findItemTypeById(itemTypeId)
    if (!itemType || Number(itemType.enabled) === 0) {
      return res.status(400).json({ success: false, message: '事项类型不存在或已停用' })
    }

    if (Number(itemType.require_demand) === 1 && !demandId) {
      return res.status(400).json({ success: false, message: '当前事项类型必须关联需求' })
    }

    if (demandId) {
      const demand = await Work.findDemandById(demandId)
      if (!demand) {
        return res.status(400).json({ success: false, message: '关联需求不存在' })
      }

      if (!phaseKey) {
        return res.status(400).json({ success: false, message: '关联需求时必须选择阶段' })
      }

      const phase = await Work.findDemandPhaseTypeByKey(phaseKey)
      if (!phase) {
        return res.status(400).json({ success: false, message: '所选阶段不存在或已停用' })
      }

    } else {
      phaseKey = null
    }

    await Work.updateLog(id, {
      logDate,
      itemTypeId,
      description,
      personalEstimateHours,
      actualHours,
      remainingHours,
      demandId,
      phaseKey,
      expectedStartDate,
      expectedCompletionDate,
      logStatus,
      taskSource: existing.task_source || 'SELF',
      assignedByUserId: existing.assigned_by_user_id || null,
      logCompletedAt,
    })

    try {
      const { startDate, endDate } = resolveDailyPlanRange(
        expectedStartDate,
        expectedCompletionDate,
        logDate || existing.log_date,
      )
      await Work.syncAutoDailyPlansForLog(id, {
        userId: req.user.id,
        expectedStartDate: startDate,
        expectedCompletionDate: endDate,
        totalPlannedHours: personalEstimateHours,
        source: 'SYSTEM_SPLIT_UPDATE',
        createdBy: req.user.id,
      })
    } catch (dailyPlanErr) {
      console.error('更新工作记录后同步日计划失败:', dailyPlanErr)
    }

    let workflowSync = null
    try {
      workflowSync = await Workflow.syncFromWorkLogStatusChange({
        logId: id,
        demandId,
        phaseKey,
        itemTypeKey: String(itemType.type_key || '').toUpperCase(),
        taskSource: existing.task_source || 'SELF',
        operatorUserId: req.user.id,
        previousStatus: existing.log_status,
        nextStatus: logStatus,
      })
    } catch (workflowErr) {
      if (!isWorkflowTablesMissing(workflowErr)) {
        console.error('更新工作记录后同步流程状态失败:', workflowErr)
      }
    }

    const updated = await Work.findLogById(id)
    return res.json({
      success: true,
      message: '工作记录更新成功',
      data: {
        ...updated,
        workflow_sync: workflowSync,
      },
    })
  } catch (err) {
    console.error('更新工作记录失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteLog = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) {
    return res.status(400).json({ success: false, message: '工作记录 ID 无效' })
  }

  try {
    const existing = await Work.findLogById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '工作记录不存在' })
    }

    if (Number(existing.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: '仅可删除自己的工作记录' })
    }

    await Work.deleteLog(id)
    return res.json({ success: true, message: '工作记录已删除' })
  } catch (err) {
    console.error('删除工作记录失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listLogDailyPlans = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) {
    return res.status(400).json({ success: false, message: '工作记录 ID 无效' })
  }

  const startDateRaw = req.query.start_date
  const endDateRaw = req.query.end_date
  const startDate = normalizeDate(startDateRaw)
  const endDate = normalizeDate(endDateRaw)
  if (startDateRaw !== undefined && String(startDateRaw || '').trim() !== '' && !startDate) {
    return res.status(400).json({ success: false, message: 'start_date 格式错误，需为 YYYY-MM-DD' })
  }
  if (endDateRaw !== undefined && String(endDateRaw || '').trim() !== '' && !endDate) {
    return res.status(400).json({ success: false, message: 'end_date 格式错误，需为 YYYY-MM-DD' })
  }

  try {
    const existing = await Work.findLogById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '工作记录不存在' })
    }
    if (Number(existing.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: '仅可查看自己的事项计划' })
    }

    const rows = await Work.listDailyPlansForLog(id, {
      startDate,
      endDate,
    })
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('获取事项日计划失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const upsertLogDailyPlan = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) {
    return res.status(400).json({ success: false, message: '工作记录 ID 无效' })
  }

  const planDateRaw = req.body.plan_date
  const planDate = normalizeDate(planDateRaw)
  if (!planDate) {
    return res.status(400).json({ success: false, message: 'plan_date 格式错误，需为 YYYY-MM-DD' })
  }

  const plannedHours = normalizeHours(req.body.planned_hours, null)
  if (plannedHours === null || plannedHours < 0) {
    return res.status(400).json({ success: false, message: 'planned_hours 不能小于 0' })
  }

  const note = normalizeText(req.body.note, 500)

  try {
    const existing = await Work.findLogById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '工作记录不存在' })
    }
    if (Number(existing.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: '仅可维护自己的事项计划' })
    }

    await Work.upsertDailyPlanForLog(id, {
      userId: req.user.id,
      planDate,
      plannedHours,
      source: 'MANUAL',
      note: note || '',
      createdBy: req.user.id,
    })
    const rows = await Work.listDailyPlansForLog(id, { startDate: planDate, endDate: planDate })
    return res.json({
      success: true,
      message: '日计划已保存',
      data: rows[0] || null,
    })
  } catch (err) {
    console.error('保存事项日计划失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listLogDailyEntries = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) {
    return res.status(400).json({ success: false, message: '工作记录 ID 无效' })
  }

  const startDateRaw = req.query.start_date
  const endDateRaw = req.query.end_date
  const startDate = normalizeDate(startDateRaw)
  const endDate = normalizeDate(endDateRaw)
  if (startDateRaw !== undefined && String(startDateRaw || '').trim() !== '' && !startDate) {
    return res.status(400).json({ success: false, message: 'start_date 格式错误，需为 YYYY-MM-DD' })
  }
  if (endDateRaw !== undefined && String(endDateRaw || '').trim() !== '' && !endDate) {
    return res.status(400).json({ success: false, message: 'end_date 格式错误，需为 YYYY-MM-DD' })
  }

  try {
    const existing = await Work.findLogById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '工作记录不存在' })
    }
    if (Number(existing.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: '仅可查看自己的事项投入记录' })
    }

    const rows = await Work.listDailyEntriesForLog(id, {
      startDate,
      endDate,
    })
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('获取事项日投入失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createLogDailyEntry = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) {
    return res.status(400).json({ success: false, message: '工作记录 ID 无效' })
  }

  const entryDateRaw = req.body.entry_date
  const entryDate = normalizeDate(entryDateRaw) || formatDate(new Date())
  if (
    entryDateRaw !== undefined &&
    entryDateRaw !== null &&
    String(entryDateRaw).trim() !== '' &&
    !normalizeDate(entryDateRaw)
  ) {
    return res.status(400).json({ success: false, message: 'entry_date 格式错误，需为 YYYY-MM-DD' })
  }

  const actualHours = normalizeHours(req.body.actual_hours, null)
  if (actualHours === null || actualHours < 0) {
    return res.status(400).json({ success: false, message: 'actual_hours 不能小于 0' })
  }
  const description = normalizeText(req.body.description, 2000)

  try {
    const existing = await Work.findLogById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '工作记录不存在' })
    }
    if (Number(existing.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, message: '仅可登记自己的事项投入记录' })
    }

    const entryId = await Work.createDailyEntryForLog(id, {
      userId: req.user.id,
      entryDate,
      actualHours,
      description,
      createdBy: req.user.id,
    })
    if (!entryId) {
      return res.status(500).json({ success: false, message: '创建事项日投入失败，请稍后重试' })
    }
    const rows = await Work.listDailyEntriesForLog(id, {
      startDate: entryDate,
      endDate: entryDate,
    })
    const created = rows.find((item) => Number(item.id) === Number(entryId)) || rows[0] || null
    return res.status(201).json({
      success: true,
      message: '日投入记录已创建',
      data: created,
    })
  } catch (err) {
    console.error('创建事项日投入失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateLogOwnerEstimate = async (req, res) => {
  const id = toPositiveInt(req.params.id)
  if (!id) {
    return res.status(400).json({ success: false, message: '工作记录 ID 无效' })
  }

  if (
    req.body.personal_estimate_hours !== undefined ||
    req.body.actual_hours !== undefined ||
    req.body.remaining_hours !== undefined ||
    req.body.expected_completion_date !== undefined ||
    req.body.log_completed_at !== undefined ||
    req.body.log_status !== undefined
  ) {
    return res.status(400).json({ success: false, message: '负责人预估接口仅允许更新 owner_estimate_hours' })
  }

  const ownerEstimateHours = normalizeHours(req.body.owner_estimate_hours, null)
  if (ownerEstimateHours === null || ownerEstimateHours < 0) {
    return res.status(400).json({ success: false, message: 'owner_estimate_hours 不能小于 0' })
  }

  try {
    const existing = await Work.findLogById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '工作记录不存在' })
    }

    const isSuperAdmin = Boolean(req.userAccess?.is_super_admin)
    if (!isSuperAdmin) {
      const isManager = await Work.isDepartmentManager(req.user.id)
      if (!isManager) {
        return res.status(403).json({ success: false, message: '仅部门负责人可维护 Owner 预估' })
      }

      const canManage = await Work.canManageLogByDepartmentOwner(req.user.id, id, { isSuperAdmin })
      if (!canManage) {
        return res.status(403).json({ success: false, message: '仅可维护所负责部门成员的事项预估' })
      }
    }

    await Work.updateLogOwnerEstimate(id, {
      ownerEstimateHours,
      ownerEstimatedBy: req.user.id,
    })

    const updated = await Work.findLogById(id)
    return res.json({ success: true, message: 'Owner 预估更新成功', data: updated })
  } catch (err) {
    if (err?.code === 'OWNER_ESTIMATE_FIELDS_MISSING') {
      return res.status(500).json({
        success: false,
        message: '缺少 owner 预估字段，请先执行数据库补丁后重试',
      })
    }
    console.error('更新 Owner 预估失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getInsightFilterOptions = async (req, res) => {
  if (!ensureSuperAdmin(req, res)) return

  try {
    const data = await Work.getInsightFilterOptions()
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取效能筛选项失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getDemandInsight = async (req, res) => {
  if (!ensureSuperAdmin(req, res)) return

  const { startDate, endDate, error } = resolveInsightDateRange(req.query.start_date, req.query.end_date)
  if (error) {
    return res.status(400).json({ success: false, message: error })
  }

  const departmentId = toPositiveInt(req.query.department_id)
  if (req.query.department_id !== undefined && req.query.department_id !== '' && !departmentId) {
    return res.status(400).json({ success: false, message: 'department_id 无效' })
  }

  const ownerUserId = toPositiveInt(req.query.owner_user_id)
  if (req.query.owner_user_id !== undefined && req.query.owner_user_id !== '' && !ownerUserId) {
    return res.status(400).json({ success: false, message: 'owner_user_id 无效' })
  }

  const memberUserId = toPositiveInt(req.query.member_user_id)
  if (req.query.member_user_id !== undefined && req.query.member_user_id !== '' && !memberUserId) {
    return res.status(400).json({ success: false, message: 'member_user_id 无效' })
  }

  const businessGroupCode = normalizeBusinessGroupCode(req.query.business_group_code)
  if (businessGroupCode === '') {
    return res.status(400).json({ success: false, message: 'business_group_code 格式不正确' })
  }

  const keyword = normalizeText(req.query.keyword, 100)

  try {
    const data = await Work.getDemandInsight({
      startDate,
      endDate,
      departmentId,
      businessGroupCode: businessGroupCode || '',
      ownerUserId,
      memberUserId,
      keyword,
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取需求投入看板失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getMemberInsight = async (req, res) => {
  if (!ensureSuperAdmin(req, res)) return

  const { startDate, endDate, error } = resolveInsightDateRange(req.query.start_date, req.query.end_date)
  if (error) {
    return res.status(400).json({ success: false, message: error })
  }

  const departmentId = toPositiveInt(req.query.department_id)
  if (req.query.department_id !== undefined && req.query.department_id !== '' && !departmentId) {
    return res.status(400).json({ success: false, message: 'department_id 无效' })
  }

  const ownerUserId = toPositiveInt(req.query.owner_user_id)
  if (req.query.owner_user_id !== undefined && req.query.owner_user_id !== '' && !ownerUserId) {
    return res.status(400).json({ success: false, message: 'owner_user_id 无效' })
  }

  const memberUserId = toPositiveInt(req.query.member_user_id)
  if (req.query.member_user_id !== undefined && req.query.member_user_id !== '' && !memberUserId) {
    return res.status(400).json({ success: false, message: 'member_user_id 无效' })
  }

  const businessGroupCode = normalizeBusinessGroupCode(req.query.business_group_code)
  if (businessGroupCode === '') {
    return res.status(400).json({ success: false, message: 'business_group_code 格式不正确' })
  }

  const keyword = normalizeText(req.query.keyword, 100)

  try {
    const data = await Work.getMemberInsight({
      startDate,
      endDate,
      departmentId,
      businessGroupCode: businessGroupCode || '',
      ownerUserId,
      memberUserId,
      keyword,
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取成员工作节奏看板失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const initDemandWorkflowInstance = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const workflow = await Workflow.initDemandWorkflow({
      demandId,
      ownerUserId: demand.owner_user_id,
      operatorUserId: req.user.id,
    })
    return res.json({
      success: true,
      message: '需求流程实例已初始化',
      data: workflow,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'DEMAND_PHASE_DICT_EMPTY') {
      return res.status(400).json({ success: false, message: '需求阶段字典为空，无法初始化流程' })
    }
    console.error('初始化需求流程失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getDemandWorkflow = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    let workflow = await Workflow.getDemandWorkflowByDemandId(demandId)
    if (!workflow) {
      workflow = await Workflow.initDemandWorkflow({
        demandId,
        ownerUserId: demand.owner_user_id,
        operatorUserId: req.user.id,
      })
    }
    return res.json({ success: true, data: workflow })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    console.error('获取需求流程失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const assignDemandWorkflowCurrentNode = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  const assigneeUserId = toPositiveInt(req.body.assignee_user_id)
  const dueAtRaw = req.body.due_at
  const dueAt = normalizeDate(dueAtRaw)
  const expectedStartDateRaw = req.body.expected_start_date
  const expectedStartDate = normalizeDate(expectedStartDateRaw)
  const comment = normalizeText(req.body.comment, 500)

  if (!assigneeUserId) {
    return res.status(400).json({ success: false, message: 'assignee_user_id 无效' })
  }
  if (
    expectedStartDateRaw !== undefined &&
    expectedStartDateRaw !== null &&
    String(expectedStartDateRaw).trim() !== '' &&
    !expectedStartDate
  ) {
    return res.status(400).json({ success: false, message: 'expected_start_date 格式错误，需为 YYYY-MM-DD' })
  }
  if (
    dueAtRaw !== undefined &&
    dueAtRaw !== null &&
    String(dueAtRaw).trim() !== '' &&
    !dueAt
  ) {
    return res.status(400).json({ success: false, message: 'due_at 格式错误，需为 YYYY-MM-DD' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const targetUser = await User.findById(assigneeUserId)
    if (!targetUser) {
      return res.status(400).json({ success: false, message: '指派目标用户不存在' })
    }

    const workflow = await Workflow.assignCurrentNode({
      demandId,
      assigneeUserId,
      operatorUserId: req.user.id,
      dueAt,
      expectedStartDate,
      comment,
    })
    return res.json({
      success: true,
      message: '当前节点已指派并生成待办',
      data: workflow,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    console.error('指派需求流程节点失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const assignDemandWorkflowNode = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  const nodeKey = normalizePhaseKey(req.params.nodeKey)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }
  if (!nodeKey) {
    return res.status(400).json({ success: false, message: '节点标识无效' })
  }

  const assigneeUserId = toPositiveInt(req.body.assignee_user_id)
  const dueAtRaw = req.body.due_at
  const dueAt = normalizeDate(dueAtRaw)
  const expectedStartDateRaw = req.body.expected_start_date
  const expectedStartDate = normalizeDate(expectedStartDateRaw)
  const comment = normalizeText(req.body.comment, 500)

  if (!assigneeUserId) {
    return res.status(400).json({ success: false, message: 'assignee_user_id 无效' })
  }
  if (
    expectedStartDateRaw !== undefined &&
    expectedStartDateRaw !== null &&
    String(expectedStartDateRaw).trim() !== '' &&
    !expectedStartDate
  ) {
    return res.status(400).json({ success: false, message: 'expected_start_date 格式错误，需为 YYYY-MM-DD' })
  }
  if (
    dueAtRaw !== undefined &&
    dueAtRaw !== null &&
    String(dueAtRaw).trim() !== '' &&
    !dueAt
  ) {
    return res.status(400).json({ success: false, message: 'due_at 格式错误，需为 YYYY-MM-DD' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const targetUser = await User.findById(assigneeUserId)
    if (!targetUser) {
      return res.status(400).json({ success: false, message: '指派目标用户不存在' })
    }

    const workflow = await Workflow.assignNode({
      demandId,
      nodeKey,
      assigneeUserId,
      operatorUserId: req.user.id,
      dueAt,
      expectedStartDate,
      comment,
    })
    return res.json({
      success: true,
      message: '节点已指派',
      data: workflow,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    if (err?.code === 'WORKFLOW_NODE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程节点不存在' })
    }
    if (err?.code === 'WORKFLOW_NODE_CLOSED') {
      return res.status(400).json({ success: false, message: '当前节点已关闭，无法指派' })
    }
    console.error('按节点指派需求流程失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const submitDemandWorkflowCurrentNode = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  const comment = normalizeText(req.body.comment, 500)

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const workflow = await Workflow.submitCurrentNode({
      demandId,
      operatorUserId: req.user.id,
      comment,
      sourceType: 'MANUAL',
    })

    return res.json({
      success: true,
      message: '当前节点已提交',
      data: workflow,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    if (err?.code === 'WORKFLOW_NOT_ASSIGNEE') {
      return res.status(403).json({ success: false, message: '当前节点仅负责人可提交' })
    }
    console.error('提交流程节点失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const submitDemandWorkflowNode = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  const nodeKey = normalizePhaseKey(req.params.nodeKey)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }
  if (!nodeKey) {
    return res.status(400).json({ success: false, message: '节点标识无效' })
  }

  const comment = normalizeText(req.body.comment, 500)

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const workflow = await Workflow.submitNode({
      demandId,
      nodeKey,
      operatorUserId: req.user.id,
      comment,
      sourceType: 'MANUAL',
    })

    return res.json({
      success: true,
      message: '节点已提交',
      data: workflow,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    if (err?.code === 'WORKFLOW_NODE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程节点不存在' })
    }
    if (err?.code === 'WORKFLOW_NODE_CLOSED') {
      return res.status(400).json({ success: false, message: '节点已关闭，无法提交' })
    }
    if (err?.code === 'WORKFLOW_NOT_ASSIGNEE') {
      return res.status(403).json({ success: false, message: '当前节点仅负责人可提交' })
    }
    console.error('按节点提交流程失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const rejectDemandWorkflowCurrentNode = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  const rejectReason = normalizeText(req.body.reject_reason, 2000)
  const comment = normalizeText(req.body.comment, 500)
  if (!rejectReason) {
    return res.status(400).json({ success: false, message: '驳回原因不能为空' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const workflow = await Workflow.rejectCurrentNode({
      demandId,
      operatorUserId: req.user.id,
      rejectReason,
      comment,
    })

    return res.json({
      success: true,
      message: '当前节点已驳回到上一节点',
      data: workflow,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    if (err?.code === 'WORKFLOW_PREVIOUS_NODE_NOT_FOUND') {
      return res.status(400).json({ success: false, message: '当前已是首节点，无法驳回' })
    }
    if (err?.code === 'REJECT_REASON_REQUIRED') {
      return res.status(400).json({ success: false, message: '驳回原因不能为空' })
    }
    console.error('驳回流程节点失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const rejectDemandWorkflowNode = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  const nodeKey = normalizePhaseKey(req.params.nodeKey)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }
  if (!nodeKey) {
    return res.status(400).json({ success: false, message: '节点标识无效' })
  }

  const rejectReason = normalizeText(req.body.reject_reason, 2000)
  const comment = normalizeText(req.body.comment, 500)
  if (!rejectReason) {
    return res.status(400).json({ success: false, message: '驳回原因不能为空' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const workflow = await Workflow.rejectNode({
      demandId,
      nodeKey,
      operatorUserId: req.user.id,
      rejectReason,
      comment,
    })

    return res.json({
      success: true,
      message: '节点已驳回到上一可执行节点',
      data: workflow,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    if (err?.code === 'WORKFLOW_NODE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程节点不存在' })
    }
    if (err?.code === 'WORKFLOW_PREVIOUS_NODE_NOT_FOUND') {
      return res.status(400).json({ success: false, message: '当前节点无可驳回的上一节点' })
    }
    if (err?.code === 'REJECT_REASON_REQUIRED') {
      return res.status(400).json({ success: false, message: '驳回原因不能为空' })
    }
    console.error('按节点驳回流程失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const forceCompleteDemandWorkflowCurrentNode = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  const comment = normalizeText(req.body.comment, 500)

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const workflow = await Workflow.submitCurrentNode({
      demandId,
      operatorUserId: req.user.id,
      comment: comment || '管理员强制完成当前节点',
      sourceType: 'FORCE',
      skipAssigneeCheck: true,
    })

    return res.json({
      success: true,
      message: '当前节点已强制完成',
      data: workflow,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    console.error('强制完成流程节点失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const forceCompleteDemandWorkflowNode = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  const nodeKey = normalizePhaseKey(req.params.nodeKey)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }
  if (!nodeKey) {
    return res.status(400).json({ success: false, message: '节点标识无效' })
  }

  const comment = normalizeText(req.body.comment, 500)

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const workflow = await Workflow.submitNode({
      demandId,
      nodeKey,
      operatorUserId: req.user.id,
      comment: comment || '管理员强制完成指定节点',
      sourceType: 'FORCE',
      skipAssigneeCheck: true,
    })

    return res.json({
      success: true,
      message: '节点已强制完成',
      data: workflow,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    if (err?.code === 'WORKFLOW_NODE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程节点不存在' })
    }
    console.error('按节点强制完成流程失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateDemandWorkflowNodeHours = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  const nodeKey = normalizePhaseKey(req.params.nodeKey)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }
  if (!nodeKey) {
    return res.status(400).json({ success: false, message: '节点标识无效' })
  }

  const ownerHours = parseOptionalNonNegativeNumber(req.body.owner_estimated_hours, { scale: 2 })
  const personalHours = parseOptionalNonNegativeNumber(req.body.personal_estimated_hours, { scale: 2 })
  const actualHours = parseOptionalNonNegativeNumber(req.body.actual_hours, { scale: 2 })
  const plannedStartRaw = req.body.planned_start_time
  const plannedStart = normalizeDateTime(plannedStartRaw)
  const plannedEndRaw = req.body.planned_end_time
  const plannedEnd = normalizeDateTime(plannedEndRaw)
  const actualStartRaw = req.body.actual_start_time
  const actualStart = normalizeDateTime(actualStartRaw)
  const actualEndRaw = req.body.actual_end_time
  const actualEnd = normalizeDateTime(actualEndRaw)
  const rejectReason =
    req.body.reject_reason === undefined ? undefined : normalizeText(req.body.reject_reason, 2000) || null
  const comment = normalizeText(req.body.comment, 500)

  if (!ownerHours.ok) return res.status(400).json({ success: false, message: 'owner_estimated_hours 不能小于 0' })
  if (!personalHours.ok) return res.status(400).json({ success: false, message: 'personal_estimated_hours 不能小于 0' })
  if (!actualHours.ok) return res.status(400).json({ success: false, message: 'actual_hours 不能小于 0' })
  if (plannedStartRaw !== undefined && plannedStartRaw !== null && String(plannedStartRaw).trim() !== '' && !plannedStart) {
    return res.status(400).json({ success: false, message: 'planned_start_time 格式错误，需为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm[:ss]' })
  }
  if (plannedEndRaw !== undefined && plannedEndRaw !== null && String(plannedEndRaw).trim() !== '' && !plannedEnd) {
    return res.status(400).json({ success: false, message: 'planned_end_time 格式错误，需为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm[:ss]' })
  }
  if (actualStartRaw !== undefined && actualStartRaw !== null && String(actualStartRaw).trim() !== '' && !actualStart) {
    return res.status(400).json({ success: false, message: 'actual_start_time 格式错误，需为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm[:ss]' })
  }
  if (actualEndRaw !== undefined && actualEndRaw !== null && String(actualEndRaw).trim() !== '' && !actualEnd) {
    return res.status(400).json({ success: false, message: 'actual_end_time 格式错误，需为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm[:ss]' })
  }
  if (plannedStart && plannedEnd && plannedStart > plannedEnd) {
    return res.status(400).json({ success: false, message: '计划时间范围不合法：planned_start_time 不能大于 planned_end_time' })
  }
  if (actualStart && actualEnd && actualStart > actualEnd) {
    return res.status(400).json({ success: false, message: '实际时间范围不合法：actual_start_time 不能大于 actual_end_time' })
  }

  const hasAnyField =
    req.body.owner_estimated_hours !== undefined ||
    req.body.personal_estimated_hours !== undefined ||
    req.body.actual_hours !== undefined ||
    req.body.planned_start_time !== undefined ||
    req.body.planned_end_time !== undefined ||
    req.body.actual_start_time !== undefined ||
    req.body.actual_end_time !== undefined ||
    req.body.reject_reason !== undefined
  if (!hasAnyField) {
    return res.status(400).json({ success: false, message: '至少提供一个要更新的字段' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const workflow = await Workflow.updateNodeHours({
      demandId,
      nodeKey,
      ownerEstimatedHours: ownerHours.value,
      personalEstimatedHours: personalHours.value,
      actualHours: actualHours.value,
      plannedStartTime: plannedStart,
      plannedEndTime: plannedEnd,
      actualStartTime: actualStart,
      actualEndTime: actualEnd,
      rejectReason,
      operatorUserId: req.user.id,
      comment,
    })

    return res.json({
      success: true,
      message: '节点工时更新成功',
      data: workflow,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    if (err?.code === 'WORKFLOW_NODE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程节点不存在' })
    }
    if (err?.code === 'WORKFLOW_NODE_HOURS_INVALID_INPUT') {
      return res.status(400).json({ success: false, message: '节点工时参数不合法' })
    }
    if (err?.code === 'WORKFLOW_NODE_HOURS_NO_FIELDS') {
      return res.status(400).json({ success: false, message: '至少提供一个要更新的字段' })
    }
    console.error('更新流程节点工时失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateDemandWorkflowTaskHours = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  const taskId = toPositiveInt(req.params.taskId)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }
  if (!taskId) {
    return res.status(400).json({ success: false, message: 'taskId 无效' })
  }

  const personalHours = parseOptionalNonNegativeNumber(req.body.personal_estimated_hours, { scale: 2 })
  const actualHours = parseOptionalNonNegativeNumber(req.body.actual_hours, { scale: 2 })
  const deadlineRaw = req.body.deadline
  const deadline = normalizeDateTime(deadlineRaw)
  const comment = normalizeText(req.body.comment, 500)

  if (!personalHours.ok) return res.status(400).json({ success: false, message: 'personal_estimated_hours 不能小于 0' })
  if (!actualHours.ok) return res.status(400).json({ success: false, message: 'actual_hours 不能小于 0' })
  if (deadlineRaw !== undefined && deadlineRaw !== null && String(deadlineRaw).trim() !== '' && !deadline) {
    return res.status(400).json({ success: false, message: 'deadline 格式错误，需为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm[:ss]' })
  }

  const hasAnyField =
    req.body.personal_estimated_hours !== undefined ||
    req.body.actual_hours !== undefined ||
    req.body.deadline !== undefined
  if (!hasAnyField) {
    return res.status(400).json({ success: false, message: '至少提供一个要更新的字段' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const workflow = await Workflow.updateTaskHours({
      demandId,
      taskId,
      personalEstimatedHours: personalHours.value,
      actualHours: actualHours.value,
      deadline,
      operatorUserId: req.user.id,
      comment,
    })

    return res.json({
      success: true,
      message: '任务工时更新成功',
      data: workflow,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    if (err?.code === 'WORKFLOW_TASK_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程任务不存在' })
    }
    if (err?.code === 'WORKFLOW_TASK_HOURS_INVALID_INPUT') {
      return res.status(400).json({ success: false, message: '任务工时参数不合法' })
    }
    if (err?.code === 'WORKFLOW_TASK_HOURS_NO_FIELDS') {
      return res.status(400).json({ success: false, message: '至少提供一个要更新的字段' })
    }
    console.error('更新流程任务工时失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listDemandWorkflowTaskCollaborators = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  const taskId = toPositiveInt(req.params.taskId)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }
  if (!taskId) {
    return res.status(400).json({ success: false, message: 'taskId 无效' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const rows = await Workflow.listTaskCollaborators({
      demandId,
      taskId,
    })
    return res.json({ success: true, data: rows })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    if (err?.code === 'WORKFLOW_TASK_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程任务不存在' })
    }
    console.error('获取任务协作人失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const addDemandWorkflowTaskCollaborator = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  const taskId = toPositiveInt(req.params.taskId)
  const collaboratorUserId = toPositiveInt(req.body.user_id)
  const expectedStartDateRaw = req.body.expected_start_date
  const expectedStartDate = normalizeDate(expectedStartDateRaw)
  const comment = normalizeText(req.body.comment, 500)

  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }
  if (!taskId) {
    return res.status(400).json({ success: false, message: 'taskId 无效' })
  }
  if (!collaboratorUserId) {
    return res.status(400).json({ success: false, message: 'user_id 无效' })
  }
  if (
    expectedStartDateRaw !== undefined &&
    expectedStartDateRaw !== null &&
    String(expectedStartDateRaw).trim() !== '' &&
    !expectedStartDate
  ) {
    return res.status(400).json({ success: false, message: 'expected_start_date 格式错误，需为 YYYY-MM-DD' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const targetUser = await User.findById(collaboratorUserId)
    if (!targetUser) {
      return res.status(400).json({ success: false, message: '协作人用户不存在' })
    }

    const workflow = await Workflow.addTaskCollaborator({
      demandId,
      taskId,
      collaboratorUserId,
      operatorUserId: req.user.id,
      expectedStartDate,
      comment,
    })

    return res.json({
      success: true,
      message: '任务协作人已添加',
      data: workflow,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    if (err?.code === 'WORKFLOW_TASK_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程任务不存在' })
    }
    if (err?.code === 'WORKFLOW_TASK_COLLABORATOR_IS_ASSIGNEE') {
      return res.status(400).json({ success: false, message: '任务负责人无需重复添加为协作人' })
    }
    if (err?.code === 'COLLABORATOR_USER_ID_INVALID') {
      return res.status(400).json({ success: false, message: '协作人 user_id 无效' })
    }
    console.error('添加任务协作人失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const removeDemandWorkflowTaskCollaborator = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  const taskId = toPositiveInt(req.params.taskId)
  const collaboratorUserId = toPositiveInt(req.params.userId)
  const comment = normalizeText(req.body.comment, 500)

  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }
  if (!taskId) {
    return res.status(400).json({ success: false, message: 'taskId 无效' })
  }
  if (!collaboratorUserId) {
    return res.status(400).json({ success: false, message: 'userId 无效' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const workflow = await Workflow.removeTaskCollaborator({
      demandId,
      taskId,
      collaboratorUserId,
      operatorUserId: req.user.id,
      comment,
    })

    return res.json({
      success: true,
      message: '任务协作人已移除',
      data: workflow,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    if (err?.code === 'WORKFLOW_TASK_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程任务不存在' })
    }
    if (err?.code === 'WORKFLOW_TASK_COLLABORATOR_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '任务协作人不存在' })
    }
    console.error('移除任务协作人失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const replaceDemandWorkflowLatestTemplate = async (req, res) => {
  const demandId = normalizeDemandId(req.params.id)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  if (!req.userAccess?.is_super_admin) {
    return res.status(403).json({ success: false, message: '仅超级管理员可强制替换流程' })
  }

  try {
    const demand = await Work.findDemandById(demandId)
    if (!demand) {
      return res.status(404).json({ success: false, message: '需求不存在' })
    }

    const result = await Workflow.replaceDemandWorkflowWithLatestTemplate({
      demandId,
      operatorUserId: req.user.id,
      autoAssignCurrentNode: false,
    })

    return res.json({
      success: true,
      message: '已强制替换为最新流程模板',
      data: result,
    })
  } catch (err) {
    if (isWorkflowTablesMissing(err)) {
      return res.status(500).json({ success: false, message: '流程表尚未初始化，请先执行数据库补丁' })
    }
    if (err?.code === 'WORKFLOW_INSTANCE_NOT_FOUND') {
      return res.status(404).json({ success: false, message: '流程实例不存在，请先初始化流程' })
    }
    if (err?.code === 'WORKFLOW_REPLACE_UNSAFE') {
      const doneCount = Number(err?.data?.done_node_count || 0)
      return res.status(400).json({
        success: false,
        message: doneCount > 0 ? `当前流程已有 ${doneCount} 个已完成节点，不允许强制替换` : '当前流程状态不允许替换',
      })
    }
    console.error('强制替换流程模板失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getMyWorkbench = async (req, res) => {
  try {
    const data = await Work.getMyWorkbench(req.user.id)
    let workflowTodos = []
    try {
      workflowTodos = await Workflow.listMyOpenTasks(req.user.id, { limit: 30 })
    } catch (workflowErr) {
      if (!isWorkflowTablesMissing(workflowErr)) {
        console.error('获取流程待办失败:', workflowErr)
      }
    }

    const payload = {
      ...data,
      workflow_todos: workflowTodos,
      workflow_todo_count: workflowTodos.length,
    }
    return res.json({ success: true, data: payload })
  } catch (err) {
    console.error('获取个人工作台失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getMyWeeklyReport = async (req, res) => {
  const { startDate, endDate, error } = resolveWeeklyReportDateRange(req.query.start_date, req.query.end_date)
  if (error) {
    return res.status(400).json({ success: false, message: error })
  }

  try {
    const data = await Work.getMyWeeklyReport(req.user.id, {
      startDate,
      endDate,
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取个人周报失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getOwnerWorkbench = async (req, res) => {
  try {
    const isSuperAdmin = Boolean(req.userAccess?.is_super_admin)
    if (!isSuperAdmin) {
      const isManager = await Work.isDepartmentManager(req.user.id)
      if (!isManager) {
        return res.status(403).json({ success: false, message: '仅部门负责人可访问 Owner 工作台' })
      }
    }

    const data = await Work.getOwnerWorkbench(req.user.id, {
      isSuperAdmin,
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取 Owner 工作台失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getMorningStandupBoard = async (req, res) => {
  try {
    const isSuperAdmin = Boolean(req.userAccess?.is_super_admin)
    const isAdmin = hasRole(req, 'ADMIN')
    const canViewAll = isSuperAdmin || isAdmin
    const targetDepartmentId = toPositiveInt(req.query.department_id)
    const tabKey = normalizeText(req.query.tab_key, 32)

    const data = await Work.getMorningStandupBoard(req.user.id, {
      canViewAll,
      targetDepartmentId,
      tabKey,
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取晨会看板失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const sendNoFillReminders = async (req, res) => {
  try {
    const isSuperAdmin = Boolean(req.userAccess?.is_super_admin)
    if (!isSuperAdmin) {
      const isManager = await Work.isDepartmentManager(req.user.id)
      if (!isManager) {
        return res.status(403).json({ success: false, message: '仅部门负责人可生成未填报提醒' })
      }
    }

    const data = await Work.previewNoFillReminders(req.user.id, {
      isSuperAdmin,
    })
    return res.json({
      success: true,
      message: `已生成未填报提醒预览，共 ${data.no_fill_members.length} 人`,
      data,
    })
  } catch (err) {
    console.error('生成未填报提醒失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  listWorkItemTypes,
  listDemandPhaseTypes,
  listProjectTemplatePhaseTypes,
  listWorkflowAssignees,
  createWorkItemType,
  listProjectTemplates,
  getProjectTemplateById,
  createProjectTemplate,
  updateProjectTemplate,
  listNotificationConfigs,
  updateNotificationConfig,
  listDemands,
  getDemandById,
  listDemandMembers,
  addDemandMember,
  removeDemandMember,
  createDemand,
  updateDemand,
  deleteDemand,
  listArchivedDemands,
  restoreArchivedDemand,
  purgeArchivedDemand,
  listLogs,
  createLog,
  createOwnerAssignedLog,
  updateLog,
  deleteLog,
  listLogDailyPlans,
  upsertLogDailyPlan,
  listLogDailyEntries,
  createLogDailyEntry,
  updateLogOwnerEstimate,
  getInsightFilterOptions,
  getDemandInsight,
  getMemberInsight,
  initDemandWorkflowInstance,
  getDemandWorkflow,
  assignDemandWorkflowCurrentNode,
  assignDemandWorkflowNode,
  submitDemandWorkflowCurrentNode,
  submitDemandWorkflowNode,
  rejectDemandWorkflowCurrentNode,
  rejectDemandWorkflowNode,
  forceCompleteDemandWorkflowCurrentNode,
  forceCompleteDemandWorkflowNode,
  updateDemandWorkflowNodeHours,
  updateDemandWorkflowTaskHours,
  listDemandWorkflowTaskCollaborators,
  addDemandWorkflowTaskCollaborator,
  removeDemandWorkflowTaskCollaborator,
  replaceDemandWorkflowLatestTemplate,
  getMyWorkbench,
  getMyWeeklyReport,
  getOwnerWorkbench,
  getMorningStandupBoard,
  sendNoFillReminders,
}
