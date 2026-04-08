const HumanGantt = require('../models/HumanGantt')
const { buildChinaBusinessCalendarRange } = require('../utils/chinaBusinessCalendar')

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_RANGE_DAYS = 93

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeDateText(value) {
  const text = String(value || '').trim()
  if (!DATE_RE.test(text)) return ''
  return text
}

function toUtcDate(dateText) {
  const text = normalizeDateText(dateText)
  if (!text) return null
  const [year, month, day] = text.split('-').map((part) => Number(part))
  return new Date(Date.UTC(year, month - 1, day))
}

function formatUtcDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function addDays(dateText, days) {
  const date = toUtcDate(dateText)
  if (!date) return ''
  date.setUTCDate(date.getUTCDate() + Number(days || 0))
  return formatUtcDate(date)
}

function diffDaysInclusive(startDateText, endDateText) {
  const startDate = toUtcDate(startDateText)
  const endDate = toUtcDate(endDateText)
  if (!startDate || !endDate) return 0
  const diff = Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 3600 * 1000))
  return diff + 1
}

function maxDateText(a, b) {
  return String(a || '') >= String(b || '') ? String(a || '') : String(b || '')
}

function minDateText(a, b) {
  return String(a || '') <= String(b || '') ? String(a || '') : String(b || '')
}

function getBeijingTodayDateString() {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(new Date())
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${map.year}-${map.month}-${map.day}`
}

function getDefaultWeekRange() {
  const today = getBeijingTodayDateString()
  const todayUtc = toUtcDate(today)
  const weekDay = todayUtc.getUTCDay()
  const mondayOffset = weekDay === 0 ? -6 : 1 - weekDay
  const startDateUtc = new Date(todayUtc.getTime())
  startDateUtc.setUTCDate(startDateUtc.getUTCDate() + mondayOffset)
  const startDate = formatUtcDate(startDateUtc)
  const endDate = addDays(startDate, 6)
  return { startDate, endDate }
}

function parseUserIds(value) {
  if (!value) return []
  const list = Array.isArray(value) ? value : String(value).split(',')
  const ids = list
    .map((item) => toPositiveInt(String(item || '').trim()))
    .filter((item) => Number.isInteger(item) && item > 0)
  return [...new Set(ids)]
}

function normalizeScope(value) {
  return String(value || '').trim().toLowerCase() === 'all' ? 'all' : 'dept'
}

function buildDateRange(startDateRaw, endDateRaw) {
  const defaultRange = getDefaultWeekRange()
  const startDate = normalizeDateText(startDateRaw) || defaultRange.startDate
  const endDate = normalizeDateText(endDateRaw) || defaultRange.endDate
  const startDateObj = toUtcDate(startDate)
  const endDateObj = toUtcDate(endDate)

  if (!startDateObj || !endDateObj) {
    return { error: '日期格式错误，需为 YYYY-MM-DD' }
  }
  if (endDateObj < startDateObj) {
    return { error: 'end_date 不能早于 start_date' }
  }

  const totalDays = diffDaysInclusive(startDate, endDate)
  if (totalDays <= 0) {
    return { error: '日期范围无效' }
  }
  if (totalDays > MAX_RANGE_DAYS) {
    return { error: `日期范围不能超过 ${MAX_RANGE_DAYS} 天` }
  }

  return { startDate, endDate, totalDays }
}

function normalizeLogItem(logItem, { startDate, endDate }) {
  const rawStartDate = normalizeDateText(logItem.start_date) || normalizeDateText(logItem.log_date)
  const rawEndDate =
    normalizeDateText(logItem.end_date) ||
    normalizeDateText(logItem.start_date) ||
    normalizeDateText(logItem.log_date)
  if (!rawStartDate || !rawEndDate) return null

  const clippedStartDate = maxDateText(rawStartDate, startDate)
  const clippedEndDate = minDateText(rawEndDate, endDate)
  if (clippedStartDate > clippedEndDate) return null

  const startOffsetDays = diffDaysInclusive(startDate, clippedStartDate) - 1
  const durationDays = diffDaysInclusive(clippedStartDate, clippedEndDate)

  return {
    ...logItem,
    start_date: rawStartDate,
    end_date: rawEndDate,
    display_start_date: clippedStartDate,
    display_end_date: clippedEndDate,
    start_offset_days: Math.max(0, startOffsetDays),
    duration_days: Math.max(1, durationDays),
  }
}

function listCoveredDays(startDate, endDate) {
  const startDateObj = toUtcDate(startDate)
  const endDateObj = toUtcDate(endDate)
  if (!startDateObj || !endDateObj || endDateObj < startDateObj) return []

  const days = []
  const cursor = new Date(startDateObj.getTime())
  while (cursor <= endDateObj) {
    days.push(formatUtcDate(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

const getHumanGantt = async (req, res) => {
  const scope = normalizeScope(req.query.scope)
  const departmentId = toPositiveInt(req.query.department_id)
  const userIds = parseUserIds(req.query.user_ids)
  const { startDate, endDate, totalDays, error } = buildDateRange(
    req.query.start_date,
    req.query.end_date,
  )

  if (error) {
    return res.status(400).json({
      success: false,
      message: error,
    })
  }

  try {
    const currentUserDepartment = await HumanGantt.getUserDepartment(req.user.id)
    const currentDepartmentId = toPositiveInt(currentUserDepartment?.department_id)
    const effectiveDepartmentId = scope === 'dept' ? currentDepartmentId : departmentId

    const users = await HumanGantt.listScopeUsers({
      scope,
      currentDepartmentId,
      departmentId: effectiveDepartmentId,
      userIds,
    })
    const departmentOptions = await HumanGantt.listDepartmentOptions()
    const calendarRange = buildChinaBusinessCalendarRange(startDate, endDate)

    const scopeUserIds = users.map((item) => item.user_id)
    const logItems = await HumanGantt.listLogItems({
      startDate,
      endDate,
      userIds: scopeUserIds,
    })

    const itemsByUser = new Map()
    logItems.forEach((item) => {
      const normalizedItem = normalizeLogItem(item, { startDate, endDate })
      if (!normalizedItem) return

      const key = Number(item.user_id)
      const list = itemsByUser.get(key) || []
      list.push(normalizedItem)
      itemsByUser.set(key, list)
    })

    const usersWithItems = users.map((user) => {
      const itemList = itemsByUser.get(user.user_id) || []
      const dayCounter = new Map()

      itemList.forEach((item) => {
        const coveredDays = listCoveredDays(item.display_start_date, item.display_end_date)
        coveredDays.forEach((day) => {
          dayCounter.set(day, Number(dayCounter.get(day) || 0) + 1)
        })
      })

      const conflictDays = Array.from(dayCounter.entries())
        .filter((entry) => Number(entry[1] || 0) > 1)
        .map((entry) => entry[0])
        .sort()

      return {
        ...user,
        item_count: itemList.length,
        conflict_days: conflictDays,
        items: itemList,
      }
    })

    const itemCount = usersWithItems.reduce((sum, user) => sum + Number(user.item_count || 0), 0)
    const emptyUserCount = usersWithItems.filter((user) => Number(user.item_count || 0) === 0).length
    const conflictUserCount = usersWithItems.filter((user) => (user.conflict_days || []).length > 0).length

    return res.json({
      success: true,
      data: {
        scope,
        range: {
          start_date: startDate,
          end_date: endDate,
          total_days: totalDays,
        },
        view_scope: {
          mode: scope === 'all' ? 'ALL' : 'DEPARTMENT',
          department_id: scope === 'dept' ? currentDepartmentId : effectiveDepartmentId,
          department_name:
            scope === 'dept'
              ? String(currentUserDepartment?.department_name || '')
              : '',
        },
        summary: {
          user_count: usersWithItems.length,
          item_count: itemCount,
          conflict_user_count: conflictUserCount,
          empty_user_count: emptyUserCount,
        },
        department_options: departmentOptions,
        calendar_dates: Array.isArray(calendarRange?.dates) ? calendarRange.dates : [],
        users: usersWithItems,
      },
    })
  } catch (err) {
    console.error('获取人力甘特图数据失败:', err)
    return res.status(500).json({
      success: false,
      message: '服务器错误',
    })
  }
}

module.exports = {
  getHumanGantt,
}
