const HOLIDAY_RULES_BY_YEAR = Object.freeze({
  2024: Object.freeze({
    holidays: Object.freeze({
      '2024-01-01': '元旦',
      '2024-02-10': '春节',
      '2024-02-11': '春节',
      '2024-02-12': '春节',
      '2024-02-13': '春节',
      '2024-02-14': '春节',
      '2024-02-15': '春节',
      '2024-02-16': '春节',
      '2024-02-17': '春节',
      '2024-04-04': '清明节',
      '2024-04-05': '清明节',
      '2024-04-06': '清明节',
      '2024-05-01': '劳动节',
      '2024-05-02': '劳动节',
      '2024-05-03': '劳动节',
      '2024-05-04': '劳动节',
      '2024-05-05': '劳动节',
      '2024-06-10': '端午节',
      '2024-09-15': '中秋节',
      '2024-09-16': '中秋节',
      '2024-09-17': '中秋节',
      '2024-10-01': '国庆节',
      '2024-10-02': '国庆节',
      '2024-10-03': '国庆节',
      '2024-10-04': '国庆节',
      '2024-10-05': '国庆节',
      '2024-10-06': '国庆节',
      '2024-10-07': '国庆节',
    }),
    adjustedWorkdays: Object.freeze({
      '2024-02-04': '春节调休上班',
      '2024-02-18': '春节调休上班',
      '2024-04-07': '清明节调休上班',
      '2024-04-28': '劳动节调休上班',
      '2024-05-11': '劳动节调休上班',
      '2024-09-14': '中秋节调休上班',
      '2024-09-29': '国庆节调休上班',
      '2024-10-12': '国庆节调休上班',
    }),
  }),
  2025: Object.freeze({
    holidays: Object.freeze({
      '2025-01-01': '元旦',
      '2025-01-28': '春节',
      '2025-01-29': '春节',
      '2025-01-30': '春节',
      '2025-01-31': '春节',
      '2025-02-01': '春节',
      '2025-02-02': '春节',
      '2025-02-03': '春节',
      '2025-02-04': '春节',
      '2025-04-04': '清明节',
      '2025-04-05': '清明节',
      '2025-04-06': '清明节',
      '2025-05-01': '劳动节',
      '2025-05-02': '劳动节',
      '2025-05-03': '劳动节',
      '2025-05-04': '劳动节',
      '2025-05-05': '劳动节',
      '2025-05-31': '端午节',
      '2025-06-01': '端午节',
      '2025-06-02': '端午节',
      '2025-10-01': '国庆节/中秋节',
      '2025-10-02': '国庆节/中秋节',
      '2025-10-03': '国庆节/中秋节',
      '2025-10-04': '国庆节/中秋节',
      '2025-10-05': '国庆节/中秋节',
      '2025-10-06': '国庆节/中秋节',
      '2025-10-07': '国庆节/中秋节',
      '2025-10-08': '国庆节/中秋节',
    }),
    adjustedWorkdays: Object.freeze({
      '2025-01-26': '春节调休上班',
      '2025-02-08': '春节调休上班',
      '2025-04-27': '劳动节调休上班',
      '2025-09-28': '国庆节/中秋节调休上班',
      '2025-10-11': '国庆节/中秋节调休上班',
    }),
  }),
  2026: Object.freeze({
    holidays: Object.freeze({
      '2026-01-01': '元旦',
      '2026-01-02': '元旦',
      '2026-01-03': '元旦',
      '2026-02-15': '春节',
      '2026-02-16': '春节',
      '2026-02-17': '春节',
      '2026-02-18': '春节',
      '2026-02-19': '春节',
      '2026-02-20': '春节',
      '2026-02-21': '春节',
      '2026-02-22': '春节',
      '2026-02-23': '春节',
      '2026-04-04': '清明节',
      '2026-04-05': '清明节',
      '2026-04-06': '清明节',
      '2026-05-01': '劳动节',
      '2026-05-02': '劳动节',
      '2026-05-03': '劳动节',
      '2026-05-04': '劳动节',
      '2026-05-05': '劳动节',
      '2026-06-19': '端午节',
      '2026-06-20': '端午节',
      '2026-06-21': '端午节',
      '2026-09-25': '中秋节',
      '2026-09-26': '中秋节',
      '2026-09-27': '中秋节',
      '2026-10-01': '国庆节',
      '2026-10-02': '国庆节',
      '2026-10-03': '国庆节',
      '2026-10-04': '国庆节',
      '2026-10-05': '国庆节',
      '2026-10-06': '国庆节',
      '2026-10-07': '国庆节',
    }),
    adjustedWorkdays: Object.freeze({
      '2026-01-04': '元旦调休上班',
      '2026-02-14': '春节调休上班',
      '2026-02-28': '春节调休上班',
      '2026-05-09': '劳动节调休上班',
      '2026-09-20': '国庆节调休上班',
      '2026-10-10': '国庆节调休上班',
    }),
  }),
})

function isValidDateText(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
}

function parseDateParts(dateText) {
  if (!isValidDateText(dateText)) return null
  const [yearText, monthText, dayText] = String(dateText).split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  return { year, month, day }
}

function createUtcDate(dateText) {
  const parts = parseDateParts(dateText)
  if (!parts) return null
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

function formatUtcDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function listDateRange(startDate, endDate) {
  const start = createUtcDate(startDate)
  const end = createUtcDate(endDate)
  if (!start || !end || start > end) return []

  const dates = []
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(formatUtcDate(cursor))
  }
  return dates
}

function getChinaBusinessDayInfo(dateText) {
  const normalizedDate = String(dateText || '').trim()
  const utcDate = createUtcDate(normalizedDate)
  if (!utcDate) {
    return {
      date: normalizedDate,
      supported_year: false,
      is_workday: false,
      is_weekend: false,
      is_holiday: false,
      is_adjusted_workday: false,
      day_type: 'UNKNOWN',
      day_label: '未知',
      holiday_name: null,
      note: null,
    }
  }

  const year = utcDate.getUTCFullYear()
  const rules = HOLIDAY_RULES_BY_YEAR[year] || null
  const holidayName = rules?.holidays?.[normalizedDate] || null
  const adjustedWorkdayName = rules?.adjustedWorkdays?.[normalizedDate] || null
  const dayOfWeek = utcDate.getUTCDay()
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  if (adjustedWorkdayName) {
    return {
      date: normalizedDate,
      supported_year: Boolean(rules),
      is_workday: true,
      is_weekend: isWeekend,
      is_holiday: false,
      is_adjusted_workday: true,
      day_type: 'ADJUSTED_WORKDAY',
      day_label: '调休工作日',
      holiday_name: null,
      note: adjustedWorkdayName,
    }
  }

  if (holidayName) {
    return {
      date: normalizedDate,
      supported_year: Boolean(rules),
      is_workday: false,
      is_weekend: isWeekend,
      is_holiday: true,
      is_adjusted_workday: false,
      day_type: 'HOLIDAY',
      day_label: '节假日',
      holiday_name: holidayName,
      note: holidayName,
    }
  }

  if (isWeekend) {
    return {
      date: normalizedDate,
      supported_year: Boolean(rules),
      is_workday: false,
      is_weekend: true,
      is_holiday: false,
      is_adjusted_workday: false,
      day_type: 'WEEKEND',
      day_label: '周末',
      holiday_name: null,
      note: '周末',
    }
  }

  return {
    date: normalizedDate,
    supported_year: Boolean(rules),
    is_workday: true,
    is_weekend: false,
    is_holiday: false,
    is_adjusted_workday: false,
    day_type: 'WORKDAY',
    day_label: '工作日',
    holiday_name: null,
    note: null,
  }
}

function buildChinaBusinessCalendarRange(startDate, endDate) {
  const dates = listDateRange(startDate, endDate).map((date) => getChinaBusinessDayInfo(date))
  const workdayCount = dates.filter((item) => item.is_workday).length
  const supportedYearCoverage = dates.every((item) => item.supported_year)
  return {
    dates,
    calendar_day_count: dates.length,
    workday_count: workdayCount,
    supported_year_coverage: supportedYearCoverage,
  }
}

module.exports = {
  buildChinaBusinessCalendarRange,
  getChinaBusinessDayInfo,
  listDateRange,
}
