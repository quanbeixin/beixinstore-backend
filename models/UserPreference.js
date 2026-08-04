const pool = require('../utils/db')

const DEFAULT_VALUES = {
  display_name: '',
  mobile: '',
  default_home: '/work-logs',
  date_display_mode: 'datetime',
  demand_list_compact_default: 1,
  app_version_release_group_by: ['developer', 'app', 'status'],
}

let tableReady = false

function normalizeDefaultHome(value) {
  const allowed = new Set(['/work-logs', '/my-demands', '/work-demands', '/owner-workbench', '/performance-dashboard'])
  const path = String(value || '').trim()
  return allowed.has(path) ? path : DEFAULT_VALUES.default_home
}

function normalizeDateDisplayMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  return mode === 'date' ? 'date' : 'datetime'
}

function normalizeCompactDefault(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_VALUES.demand_list_compact_default
  if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true') return 1
  return 0
}

function normalizeText(value, maxLen = 64) {
  const text = String(value || '').trim()
  return text.slice(0, maxLen)
}

function normalizeAppVersionReleaseGroupBy(value) {
  const allowed = new Set(['developer', 'app', 'status', 'company_subject', 'owner', 'urgency'])
  const rawList = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  const normalized = []
  const seen = new Set()
  rawList.forEach((item) => {
    const key = String(item || '').trim().toLowerCase()
    if (!allowed.has(key) || seen.has(key)) return
    seen.add(key)
    normalized.push(key)
  })
  return normalized.length > 0 ? normalized : DEFAULT_VALUES.app_version_release_group_by.slice()
}

function parseJsonText(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return fallback
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName],
  )
  return Number(rows[0]?.total || 0) > 0
}

async function ensureTable() {
  if (tableReady) return

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INT NOT NULL PRIMARY KEY,
      display_name VARCHAR(64) DEFAULT NULL,
      mobile VARCHAR(20) DEFAULT NULL,
      default_home VARCHAR(64) NOT NULL DEFAULT '/work-logs',
      date_display_mode VARCHAR(16) NOT NULL DEFAULT 'datetime',
      demand_list_compact_default TINYINT(1) NOT NULL DEFAULT 1,
      app_version_release_group_by_json LONGTEXT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_user_preferences_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  if (!(await columnExists('user_preferences', 'app_version_release_group_by_json'))) {
    await pool.query(
      'ALTER TABLE user_preferences ADD COLUMN app_version_release_group_by_json LONGTEXT DEFAULT NULL AFTER demand_list_compact_default',
    )
  }

  tableReady = true
}

function mapRow(row) {
  return {
    user_id: Number(row?.user_id || 0),
    display_name: row?.display_name || '',
    mobile: row?.mobile || '',
    default_home: normalizeDefaultHome(row?.default_home),
    date_display_mode: normalizeDateDisplayMode(row?.date_display_mode),
    demand_list_compact_default: Number(row?.demand_list_compact_default || 0) === 1 ? 1 : 0,
    app_version_release_group_by: normalizeAppVersionReleaseGroupBy(
      parseJsonText(row?.app_version_release_group_by_json, DEFAULT_VALUES.app_version_release_group_by),
    ),
  }
}

const UserPreference = {
  DEFAULT_VALUES,

  async getByUserId(userId) {
    await ensureTable()
    const [rows] = await pool.query(
      `SELECT
         user_id,
         display_name,
         mobile,
         default_home,
         date_display_mode,
         demand_list_compact_default
       FROM user_preferences
       WHERE user_id = ?
       LIMIT 1`,
      [userId],
    )

    if (!rows[0]) {
      return {
        user_id: Number(userId),
        ...DEFAULT_VALUES,
      }
    }

    return mapRow(rows[0])
  },

  async upsertByUserId(
    userId,
    {
      display_name = undefined,
      mobile = undefined,
      default_home = undefined,
      date_display_mode = undefined,
      demand_list_compact_default = undefined,
      app_version_release_group_by = undefined,
    } = {},
  ) {
    await ensureTable()
    const current = await this.getByUserId(userId)

    const next = {
      display_name: display_name === undefined ? current.display_name : normalizeText(display_name, 64),
      mobile: mobile === undefined ? current.mobile : normalizeText(mobile, 20),
      default_home: default_home === undefined ? current.default_home : normalizeDefaultHome(default_home),
      date_display_mode:
        date_display_mode === undefined ? current.date_display_mode : normalizeDateDisplayMode(date_display_mode),
      demand_list_compact_default:
        demand_list_compact_default === undefined
          ? current.demand_list_compact_default
          : normalizeCompactDefault(demand_list_compact_default),
      app_version_release_group_by:
        app_version_release_group_by === undefined
          ? current.app_version_release_group_by
          : normalizeAppVersionReleaseGroupBy(app_version_release_group_by),
    }

    await pool.query(
      `INSERT INTO user_preferences (
         user_id, display_name, mobile, default_home, date_display_mode, demand_list_compact_default, app_version_release_group_by_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         mobile = VALUES(mobile),
         default_home = VALUES(default_home),
         date_display_mode = VALUES(date_display_mode),
         demand_list_compact_default = VALUES(demand_list_compact_default),
         app_version_release_group_by_json = VALUES(app_version_release_group_by_json)`,
      [
        userId,
        next.display_name || null,
        next.mobile || null,
        next.default_home,
        next.date_display_mode,
        next.demand_list_compact_default,
        JSON.stringify(next.app_version_release_group_by || DEFAULT_VALUES.app_version_release_group_by),
      ],
    )

    return this.getByUserId(userId)
  },

  async isMobileTaken(mobile, excludeUserId = null) {
    const normalizedMobile = normalizeText(mobile, 20)
    if (!normalizedMobile) return false

    await ensureTable()

    let sql = 'SELECT user_id FROM user_preferences WHERE mobile = ?'
    const params = [normalizedMobile]
    if (excludeUserId) {
      sql += ' AND user_id <> ?'
      params.push(excludeUserId)
    }
    sql += ' LIMIT 1'

    const [rows] = await pool.query(sql, params)
    return Boolean(rows[0])
  },
}

module.exports = UserPreference
