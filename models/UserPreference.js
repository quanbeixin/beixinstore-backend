const pool = require('../utils/db')

const DEFAULT_VALUES = {
  display_name: '',
  mobile: '',
  default_home: '/work-logs',
  date_display_mode: 'datetime',
  demand_list_compact_default: 1,
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
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_user_preferences_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

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
    }

    await pool.query(
      `INSERT INTO user_preferences (
         user_id, display_name, mobile, default_home, date_display_mode, demand_list_compact_default
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         mobile = VALUES(mobile),
         default_home = VALUES(default_home),
         date_display_mode = VALUES(date_display_mode),
         demand_list_compact_default = VALUES(demand_list_compact_default)`,
      [
        userId,
        next.display_name || null,
        next.mobile || null,
        next.default_home,
        next.date_display_mode,
        next.demand_list_compact_default,
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
