const Work = require('../models/Work')
const User = require('../models/User')

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

function normalizeStatus(value) {
  const status = String(value || 'TODO').trim().toUpperCase()
  return Work.DEMAND_STATUSES.includes(status) ? status : 'TODO'
}

function normalizePriority(value) {
  const priority = String(value || 'P2').trim().toUpperCase()
  return Work.DEMAND_PRIORITIES.includes(priority) ? priority : 'P2'
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

    const finalDemandId = await Work.createDemand({
      demandId,
      name,
      ownerUserId,
      businessGroupCode,
      expectedReleaseDate: expectedReleaseDate || null,
      status,
      priority,
      description,
      createdBy: req.user.id,
    })

    const created = await Work.findDemandById(finalDemandId)
    return res.status(201).json({
      success: true,
      message: '需求创建成功',
      data: created,
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
    const parsedBusinessGroupCode = normalizeBusinessGroupCode(req.body.business_group_code)
    const businessGroupCode =
      parsedBusinessGroupCode === undefined ? existing.business_group_code : parsedBusinessGroupCode
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

    const completedAt = isDemandOpen(status)
      ? null
      : req.body.completed_at || existing.completed_at || new Date()

    await Work.updateDemand(demandId, {
      name,
      ownerUserId,
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

const listLogs = async (req, res) => {
  const page = toPositiveInt(req.query.page) || 1
  const pageSize = toPositiveInt(req.query.pageSize) || 20
  const keyword = normalizeText(req.query.keyword, 100)
  const demandId = normalizeDemandId(req.query.demand_id || '')
  const phaseKey = normalizePhaseKey(req.query.phase_key || '')
  const itemTypeId = toPositiveInt(req.query.item_type_id)
  const startDate = normalizeDate(req.query.start_date)
  const endDate = normalizeDate(req.query.end_date)
  const requestedUserId = toPositiveInt(req.query.user_id)
  const teamScope = String(req.query.scope || '').trim().toLowerCase() === 'team'
  const canViewTeam = hasPermission(req, 'worklog.view.team')

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
    req.body.owner_estimated_at !== undefined
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
  const actualHours = normalizeHours(req.body.actual_hours, 0)
  const remainingHours = normalizeHours(req.body.remaining_hours, 0)
  const demandId = normalizeDemandId(req.body.demand_id)
  let phaseKey = normalizePhaseKey(req.body.phase_key)
  const expectedCompletionDateRaw = req.body.expected_completion_date
  const expectedCompletionDate = normalizeDate(expectedCompletionDateRaw)
  const logStatus = normalizeLogStatus(req.body.log_status)
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

  if (actualHours === null || actualHours < 0) {
    return res.status(400).json({ success: false, message: 'actual_hours 不能小于 0' })
  }

  if (remainingHours === null || remainingHours < 0) {
    return res.status(400).json({ success: false, message: 'remaining_hours 不能小于 0' })
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
      expectedCompletionDate: expectedCompletionDate || null,
      logStatus,
      logCompletedAt: logCompletedAt || null,
    })

    const created = await Work.findLogById(id)
    return res.status(201).json({
      success: true,
      message: '工作记录创建成功',
      data: created,
    })
  } catch (err) {
    console.error('创建工作记录失败:', err)
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
    req.body.owner_estimated_at !== undefined
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
    const actualHours =
      req.body.actual_hours === undefined
        ? Number(existing.actual_hours)
        : normalizeHours(req.body.actual_hours, null)
    const remainingHours =
      req.body.remaining_hours === undefined
        ? Number(existing.remaining_hours)
        : normalizeHours(req.body.remaining_hours, null)
    const demandId =
      req.body.demand_id === undefined ? existing.demand_id : normalizeDemandId(req.body.demand_id)
    let phaseKey =
      req.body.phase_key === undefined ? normalizePhaseKey(existing.phase_key) : normalizePhaseKey(req.body.phase_key)
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

    if (!description) {
      return res.status(400).json({ success: false, message: '工作描述不能为空' })
    }

    if (personalEstimateHours === null || personalEstimateHours < 0) {
      return res.status(400).json({ success: false, message: 'personal_estimate_hours 不能小于 0' })
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
      expectedCompletionDate,
      logStatus,
      logCompletedAt,
    })

    const updated = await Work.findLogById(id)
    return res.json({ success: true, message: '工作记录更新成功', data: updated })
  } catch (err) {
    console.error('更新工作记录失败:', err)
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

const getMyWorkbench = async (req, res) => {
  try {
    const data = await Work.getMyWorkbench(req.user.id)
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取个人工作台失败:', err)
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
  createWorkItemType,
  listDemands,
  createDemand,
  updateDemand,
  deleteDemand,
  listLogs,
  createLog,
  updateLog,
  updateLogOwnerEstimate,
  getInsightFilterOptions,
  getDemandInsight,
  getMemberInsight,
  getMyWorkbench,
  getOwnerWorkbench,
  getMorningStandupBoard,
  sendNoFillReminders,
}
