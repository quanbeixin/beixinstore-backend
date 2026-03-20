const pool = require('../utils/db')

const DEMAND_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']
const DEMAND_PRIORITIES = ['P0', 'P1', 'P2', 'P3']
const DEMAND_PHASE_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']
const WORK_LOG_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE']
const DEMAND_PHASE_DICT_KEY = 'demand_phase_type'
const ISSUE_TYPE_DICT_KEY = 'issue_type'
const TRUE_LIKE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on'])
const FALLBACK_DEMAND_PHASES = [
  { phase_key: 'COMPETITOR_RESEARCH', phase_name: 'Competitor Research', init_ratio: 0.08, sort_order: 10 },
  { phase_key: 'PRODUCT_SOLUTION', phase_name: 'Product Solution', init_ratio: 0.12, sort_order: 20 },
  { phase_key: 'DATA_ANALYSIS', phase_name: 'Data Analysis', init_ratio: 0.1, sort_order: 30 },
  { phase_key: 'PRODUCT_PLANNING', phase_name: 'Product Planning', init_ratio: 0.12, sort_order: 40 },
  { phase_key: 'PRODUCT_ACCEPTANCE', phase_name: 'Product Acceptance', init_ratio: 0.08, sort_order: 50 },
  { phase_key: 'DEV', phase_name: 'Development', init_ratio: 0.3, sort_order: 60 },
  { phase_key: 'TEST', phase_name: 'Testing', init_ratio: 0.1, sort_order: 70 },
  { phase_key: 'BUG_FIX', phase_name: 'Bug Fix', init_ratio: 0.06, sort_order: 80 },
  { phase_key: 'RELEASE_FOLLOWUP', phase_name: 'Release Follow-up', init_ratio: 0.04, sort_order: 90 },
]

const ITEM_TYPE_LOOKUP_SQL = `
  SELECT
    CAST(i.id AS SIGNED) AS id,
    i.item_code AS type_key,
    i.item_name AS name,
    i.enabled AS enabled,
    i.sort_order AS sort_order,
    CASE
      WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(i.extra_json, '$.require_demand')), '')) IN ('1', 'true', 'yes', 'y', 'on')
        THEN 1
      WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(i.extra_json, '$.requireDemand')), '')) IN ('1', 'true', 'yes', 'y', 'on')
        THEN 1
      ELSE 0
    END AS require_demand
  FROM config_dict_items i
  INNER JOIN config_dict_types t ON t.type_key = i.type_key
  WHERE i.type_key = '${ISSUE_TYPE_DICT_KEY}' AND t.enabled = 1
  UNION ALL
  SELECT
    w.id AS id,
    w.type_key AS type_key,
    w.name AS name,
    w.enabled AS enabled,
    w.sort_order AS sort_order,
    w.require_demand AS require_demand
  FROM work_item_types w
  WHERE NOT EXISTS (
    SELECT 1
    FROM config_dict_items i2
    INNER JOIN config_dict_types t2 ON t2.type_key = i2.type_key
    WHERE i2.type_key = '${ISSUE_TYPE_DICT_KEY}' AND t2.enabled = 1
  )
`

function normalizeStatus(value) {
  const status = String(value || 'TODO').trim().toUpperCase()
  return DEMAND_STATUSES.includes(status) ? status : 'TODO'
}

function normalizePriority(value) {
  const priority = String(value || 'P2').trim().toUpperCase()
  return DEMAND_PRIORITIES.includes(priority) ? priority : 'P2'
}

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeDecimal(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Number(num.toFixed(1))
}

function parseExtraJson(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  if (typeof raw !== 'string') return null

  try {
    return JSON.parse(raw)
  } catch (err) {
    return null
  }
}

function parseRequireDemand(extraJson, fallback = 0) {
  if (!extraJson || typeof extraJson !== 'object') return fallback

  const candidates = [
    extraJson.require_demand,
    extraJson.requireDemand,
    extraJson.need_demand,
    extraJson.needDemand,
  ]

  for (const item of candidates) {
    if (item === undefined || item === null) continue
    const normalized = String(item).trim().toLowerCase()
    if (TRUE_LIKE_VALUES.has(normalized)) return 1
    if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return 0
  }

  return fallback
}

function mapIssueTypeDictRow(row) {
  const extraJson = parseExtraJson(row.extra_json)
  return {
    id: Number(row.id),
    type_key: row.item_code,
    name: row.item_name,
    require_demand: parseRequireDemand(extraJson, 0),
    enabled: Number(row.enabled) === 1 ? 1 : 0,
    sort_order: Number(row.sort_order) || 0,
  }
}

async function syncDemandOwnerEstimateByPhases(conn, demandId) {
  const [[sumRow]] = await conn.query(
    `SELECT ROUND(COALESCE(SUM(estimate_hours), 0), 1) AS total_estimate
     FROM work_demand_phases
     WHERE demand_id = ?`,
    [demandId],
  )

  const totalEstimate = Number(sumRow?.total_estimate || 0)
  await conn.query(
    `UPDATE work_demands
     SET owner_estimate_hours = ?
     WHERE id = ?`,
    [totalEstimate, demandId],
  )

  return totalEstimate
}

function normalizeDemandPhaseStatusByDemandStatus(status) {
  if (status === 'DONE') return 'DONE'
  if (status === 'CANCELLED') return 'CANCELLED'
  return 'TODO'
}

function parsePhaseInitRatio(extraJson, fallback = null) {
  if (!extraJson || typeof extraJson !== 'object') return fallback
  const candidates = [extraJson.init_ratio, extraJson.initRatio, extraJson.ratio]
  for (const value of candidates) {
    if (value === undefined || value === null || value === '') continue
    const num = Number(value)
    if (Number.isFinite(num) && num >= 0) return num
  }
  return fallback
}

async function listDemandPhaseTemplates(conn, { enabledOnly = true } = {}) {
  const whereEnabled = enabledOnly ? 'AND i.enabled = 1' : ''
  const [rows] = await conn.query(
    `SELECT
       i.item_code,
       i.item_name,
       i.sort_order,
       i.extra_json
     FROM config_dict_items i
     INNER JOIN config_dict_types t ON t.type_key = i.type_key
     WHERE i.type_key = ? AND t.enabled = 1 ${whereEnabled}
     ORDER BY i.sort_order ASC, i.id ASC`,
    [DEMAND_PHASE_DICT_KEY],
  )

  const templates = rows.map((row) => {
    const extraJson = parseExtraJson(row.extra_json)
    return {
      phase_key: row.item_code,
      phase_name: row.item_name,
      sort_order: Number(row.sort_order) || 0,
      init_ratio: parsePhaseInitRatio(extraJson, null),
    }
  })

  if (templates.length > 0) return templates
  return FALLBACK_DEMAND_PHASES
}

function normalizePhaseRatios(templates) {
  if (!Array.isArray(templates) || templates.length === 0) return []

  const raw = templates.map((item) => {
    const num = Number(item.init_ratio)
    return Number.isFinite(num) && num >= 0 ? num : null
  })

  const hasAnyRatio = raw.some((item) => item !== null)
  if (!hasAnyRatio) {
    const even = 1 / templates.length
    return templates.map(() => even)
  }

  const sum = raw.reduce((acc, item) => acc + (item || 0), 0)
  if (sum <= 0) {
    const even = 1 / templates.length
    return templates.map(() => even)
  }

  return raw.map((item) => (item || 0) / sum)
}

function buildDefaultDemandPhaseRows({ templates = [], ownerUserId = null, ownerEstimateHours = 0, demandStatus = 'TODO' }) {
  const phaseStatus = normalizeDemandPhaseStatusByDemandStatus(demandStatus)
  const safeTemplates = Array.isArray(templates) && templates.length > 0 ? templates : FALLBACK_DEMAND_PHASES
  const ratios = normalizePhaseRatios(safeTemplates)
  const totalEstimate = Number(ownerEstimateHours || 0)

  let allocated = 0
  return safeTemplates.map((item, index) => {
    const estimate =
      index === safeTemplates.length - 1
        ? Number((totalEstimate - allocated).toFixed(1))
        : Number((totalEstimate * ratios[index]).toFixed(1))

    allocated += estimate

    return {
      phase_key: item.phase_key,
      phase_name: item.phase_name,
      owner_user_id: ownerUserId || null,
      estimate_hours: estimate < 0 ? 0 : estimate,
      status: phaseStatus,
      sort_order: Number(item.sort_order) || 0,
    }
  })
}

async function seedDemandPhases(conn, { demandId, ownerUserId = null, ownerEstimateHours = 0, demandStatus = 'TODO' }) {
  const templates = await listDemandPhaseTemplates(conn, { enabledOnly: true })
  const rows = buildDefaultDemandPhaseRows({
    templates,
    ownerUserId,
    ownerEstimateHours,
    demandStatus,
  })

  for (const row of rows) {
    await conn.query(
      `INSERT INTO work_demand_phases (
         demand_id, phase_key, phase_name, owner_user_id, estimate_hours, status, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         phase_name = VALUES(phase_name),
         sort_order = VALUES(sort_order),
         owner_user_id = IFNULL(work_demand_phases.owner_user_id, VALUES(owner_user_id))`,
      [
        demandId,
        row.phase_key,
        row.phase_name,
        row.owner_user_id,
        row.estimate_hours,
        row.status,
        row.sort_order,
      ],
    )
  }
}

async function generateDemandId(conn) {
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING(id, 4) AS UNSIGNED)) AS max_no
     FROM work_demands
     WHERE id REGEXP '^REQ[0-9]+$'`,
  )

  const nextNo = Number(row?.max_no || 0) + 1
  return `REQ${String(nextNo).padStart(3, '0')}`
}

async function getTeamMemberIds(ownerUserId) {
  const [rows] = await pool.query(
    `SELECT u.id
     FROM users u
     WHERE u.department_id = (
       SELECT department_id FROM users WHERE id = ?
     )`,
    [ownerUserId],
  )
  return rows.map((row) => row.id).filter((id) => Number.isInteger(Number(id)))
}

const Work = {
  DEMAND_STATUSES,
  DEMAND_PRIORITIES,
  DEMAND_PHASE_STATUSES,
  WORK_LOG_STATUSES,

  async listIssueTypeDictItems({ enabledOnly = true } = {}) {
    const whereEnabled = enabledOnly ? 'AND i.enabled = 1' : ''
    const [rows] = await pool.query(
      `SELECT
         i.id,
         i.item_code,
         i.item_name,
         i.enabled,
         i.sort_order,
         i.extra_json
       FROM config_dict_items i
       INNER JOIN config_dict_types t ON t.type_key = i.type_key
       WHERE i.type_key = ? AND t.enabled = 1 ${whereEnabled}
       ORDER BY i.sort_order ASC, i.id ASC`,
      [ISSUE_TYPE_DICT_KEY],
    )
    return rows.map(mapIssueTypeDictRow)
  },

  async findIssueTypeDictItemById(id) {
    const [rows] = await pool.query(
      `SELECT
         i.id,
         i.item_code,
         i.item_name,
         i.enabled,
         i.sort_order,
         i.extra_json
       FROM config_dict_items i
       INNER JOIN config_dict_types t ON t.type_key = i.type_key
       WHERE i.type_key = ? AND i.id = ? AND t.enabled = 1
       LIMIT 1`,
      [ISSUE_TYPE_DICT_KEY, id],
    )
    return rows[0] ? mapIssueTypeDictRow(rows[0]) : null
  },

  async hasIssueTypeDictItems() {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM config_dict_items i
       INNER JOIN config_dict_types t ON t.type_key = i.type_key
       WHERE i.type_key = ? AND t.enabled = 1`,
      [ISSUE_TYPE_DICT_KEY],
    )
    return Number(row?.total || 0) > 0
  },

  async listItemTypes({ enabledOnly = true } = {}) {
    const dictRows = await this.listIssueTypeDictItems({ enabledOnly })
    if (dictRows.length > 0) {
      return dictRows
    }

    const sql = enabledOnly
      ? `SELECT id, type_key, name, require_demand, enabled, sort_order
         FROM work_item_types
         WHERE enabled = 1
         ORDER BY sort_order ASC, id ASC`
      : `SELECT id, type_key, name, require_demand, enabled, sort_order
         FROM work_item_types
         ORDER BY enabled DESC, sort_order ASC, id ASC`

    const [rows] = await pool.query(sql)
    return rows
  },

  async findItemTypeById(id) {
    const dictItem = await this.findIssueTypeDictItemById(id)
    if (dictItem) {
      return dictItem
    }

    const hasDictItems = await this.hasIssueTypeDictItems()
    if (hasDictItems) {
      return null
    }

    const [rows] = await pool.query(
      `SELECT id, type_key, name, require_demand, enabled, sort_order
       FROM work_item_types
       WHERE id = ?`,
      [id],
    )
    return rows[0] || null
  },

  async createItemType({ typeKey, name, requireDemand = 0, enabled = 1, sortOrder = 0 }) {
    const [result] = await pool.query(
      `INSERT INTO work_item_types (type_key, name, require_demand, enabled, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [typeKey, name, requireDemand, enabled, sortOrder],
    )
    return result.insertId
  },

  async listDemands({
    page = 1,
    pageSize = 10,
    keyword = '',
    status = '',
    priority = '',
    ownerUserId = null,
    mineUserId = null,
  } = {}) {
    const offset = (page - 1) * pageSize
    const conditions = ['1 = 1']
    const params = []

    if (keyword) {
      conditions.push('(d.id LIKE ? OR d.name LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`)
    }

    if (status) {
      conditions.push('d.status = ?')
      params.push(normalizeStatus(status))
    }

    if (priority) {
      conditions.push('d.priority = ?')
      params.push(normalizePriority(priority))
    }

    if (ownerUserId) {
      conditions.push('d.owner_user_id = ?')
      params.push(ownerUserId)
    }

    if (mineUserId) {
      conditions.push(
        `(d.owner_user_id = ? OR EXISTS (
          SELECT 1 FROM work_logs mwl WHERE mwl.demand_id = d.id AND mwl.user_id = ?
        ))`,
      )
      params.push(mineUserId, mineUserId)
    }

    const whereSql = conditions.join(' AND ')
    const listSql = `
      SELECT
        d.id,
        d.name,
        d.owner_user_id,
        u.username AS owner_name,
        d.status,
        d.priority,
        d.owner_estimate_hours,
        d.description,
        d.created_by,
        d.created_at,
        d.updated_at,
        d.completed_at,
        COALESCE(ta.total_personal_estimate_hours, 0) AS total_personal_estimate_hours,
        COALESCE(ta.total_actual_hours, 0) AS total_actual_hours,
        COALESCE(lr.remaining_hours, 0) AS latest_remaining_hours,
        CASE
          WHEN d.owner_estimate_hours IS NULL THEN NULL
          ELSE ROUND((COALESCE(ta.total_actual_hours, 0) + COALESCE(lr.remaining_hours, 0)) - d.owner_estimate_hours, 1)
        END AS deviation_hours
      FROM work_demands d
      LEFT JOIN users u ON u.id = d.owner_user_id
      LEFT JOIN (
        SELECT
          demand_id,
          SUM(personal_estimate_hours) AS total_personal_estimate_hours,
          SUM(actual_hours) AS total_actual_hours
        FROM work_logs
        WHERE demand_id IS NOT NULL
        GROUP BY demand_id
      ) ta ON ta.demand_id = d.id
      LEFT JOIN (
        SELECT l1.demand_id, l1.remaining_hours
        FROM work_logs l1
        INNER JOIN (
          SELECT demand_id, MAX(id) AS max_id
          FROM work_logs
          WHERE demand_id IS NOT NULL
          GROUP BY demand_id
        ) l2 ON l1.id = l2.max_id
      ) lr ON lr.demand_id = d.id
      WHERE ${whereSql}
      ORDER BY
        CASE d.priority
          WHEN 'P0' THEN 0
          WHEN 'P1' THEN 1
          WHEN 'P2' THEN 2
          ELSE 3
        END ASC,
        d.updated_at DESC
      LIMIT ? OFFSET ?`

    const [rows] = await pool.query(listSql, [...params, pageSize, offset])
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM work_demands d
       WHERE ${whereSql}`,
      params,
    )

    return { rows, total }
  },

  async findDemandById(id) {
    const [rows] = await pool.query(
      `SELECT
         d.id,
         d.name,
         d.owner_user_id,
         u.username AS owner_name,
         d.status,
         d.priority,
         d.owner_estimate_hours,
         d.description,
         d.created_by,
         d.created_at,
         d.updated_at,
         d.completed_at
       FROM work_demands d
       LEFT JOIN users u ON u.id = d.owner_user_id
       WHERE d.id = ?`,
      [id],
    )
    return rows[0] || null
  },

  async listDemandPhases(demandId) {
    const [rows] = await pool.query(
      `SELECT
         p.id,
         p.demand_id,
         p.phase_key,
         COALESCE(di.item_name, p.phase_name) AS phase_name,
         p.owner_user_id,
         u.username AS owner_name,
         p.estimate_hours,
         p.status,
         COALESCE(di.sort_order, p.sort_order) AS sort_order,
         p.started_at,
         p.completed_at,
         p.remark,
         p.created_at,
         p.updated_at,
         COALESCE(ta.personal_estimate_hours, 0) AS personal_estimate_hours,
         COALESCE(ta.actual_hours, 0) AS actual_hours,
         COALESCE(lr.remaining_hours, 0) AS latest_remaining_hours,
         ROUND(COALESCE(ta.actual_hours, 0) + COALESCE(lr.remaining_hours, 0) - COALESCE(p.estimate_hours, 0), 1) AS deviation_hours
       FROM work_demand_phases p
       LEFT JOIN config_dict_items di
         ON di.type_key = '${DEMAND_PHASE_DICT_KEY}'
        AND di.item_code = p.phase_key
        AND di.enabled = 1
       LEFT JOIN users u ON u.id = p.owner_user_id
       LEFT JOIN (
         SELECT
           demand_id,
           phase_key,
           SUM(personal_estimate_hours) AS personal_estimate_hours,
           SUM(actual_hours) AS actual_hours
         FROM work_logs
         WHERE demand_id IS NOT NULL AND phase_key IS NOT NULL AND phase_key <> ''
         GROUP BY demand_id, phase_key
       ) ta ON ta.demand_id = p.demand_id AND ta.phase_key = p.phase_key
       LEFT JOIN (
         SELECT l1.demand_id, l1.phase_key, l1.remaining_hours
         FROM work_logs l1
         INNER JOIN (
           SELECT demand_id, phase_key, MAX(id) AS max_id
           FROM work_logs
           WHERE demand_id IS NOT NULL AND phase_key IS NOT NULL AND phase_key <> ''
           GROUP BY demand_id, phase_key
         ) l2 ON l1.id = l2.max_id
       ) lr ON lr.demand_id = p.demand_id AND lr.phase_key = p.phase_key
       WHERE p.demand_id = ?
         AND (
           di.id IS NOT NULL
           OR EXISTS (
             SELECT 1
             FROM work_logs wl
             WHERE wl.demand_id = p.demand_id
               AND wl.phase_key = p.phase_key
           )
         )
       ORDER BY COALESCE(di.sort_order, p.sort_order) ASC, p.id ASC`,
      [demandId],
    )
    return rows
  },

  async ensureDemandPhases(demandId) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [demandRows] = await conn.query(
        `SELECT id, owner_user_id, owner_estimate_hours, status
         FROM work_demands
         WHERE id = ?
         LIMIT 1`,
        [demandId],
      )

      const demand = demandRows[0]
      if (!demand) {
        await conn.commit()
        return false
      }

      await seedDemandPhases(conn, {
        demandId: demand.id,
        ownerUserId: demand.owner_user_id,
        ownerEstimateHours: normalizeDecimal(demand.owner_estimate_hours, 0),
        demandStatus: demand.status,
      })

      await conn.commit()
      return true
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async findDemandPhase(demandId, phaseKey) {
    const [rows] = await pool.query(
      `SELECT
         id,
         demand_id,
         phase_key,
         phase_name,
         owner_user_id,
         estimate_hours,
         status,
         sort_order,
         started_at,
         completed_at,
         remark,
         created_at,
         updated_at
       FROM work_demand_phases
       WHERE demand_id = ? AND phase_key = ?
       LIMIT 1`,
      [demandId, phaseKey],
    )
    return rows[0] || null
  },

  async batchUpsertDemandPhases(demandId, phases = []) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      for (const phase of phases) {
        await conn.query(
          `INSERT INTO work_demand_phases (
             demand_id, phase_key, phase_name, owner_user_id, estimate_hours, status, sort_order, remark
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             phase_name = VALUES(phase_name),
             owner_user_id = VALUES(owner_user_id),
             estimate_hours = VALUES(estimate_hours),
             status = VALUES(status),
             sort_order = VALUES(sort_order),
             remark = VALUES(remark)`,
          [
            demandId,
            phase.phase_key,
            phase.phase_name,
            phase.owner_user_id || null,
            normalizeDecimal(phase.estimate_hours, 0),
            phase.status,
            Number(phase.sort_order) || 0,
            phase.remark || null,
          ],
        )
      }

      await syncDemandOwnerEstimateByPhases(conn, demandId)
      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async createDemand({
    demandId = '',
    name,
    ownerUserId,
    status = 'TODO',
    priority = 'P2',
    ownerEstimateHours = null,
    description = '',
    createdBy = null,
  }) {
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const finalDemandId = demandId || (await generateDemandId(conn))
      await conn.query(
        `INSERT INTO work_demands (
          id, name, owner_user_id, status, priority, owner_estimate_hours, description, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalDemandId,
          name,
          ownerUserId,
          normalizeStatus(status),
          normalizePriority(priority),
          normalizeDecimal(ownerEstimateHours),
          description || null,
          createdBy,
        ],
      )

      await seedDemandPhases(conn, {
        demandId: finalDemandId,
        ownerUserId,
        ownerEstimateHours: normalizeDecimal(ownerEstimateHours, 0),
        demandStatus: normalizeStatus(status),
      })

      await conn.commit()
      return finalDemandId
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async updateDemand(
    demandId,
    { name, ownerUserId, status, priority, ownerEstimateHours, description, completedAt },
  ) {
    const [result] = await pool.query(
      `UPDATE work_demands
       SET
         name = ?,
         owner_user_id = ?,
         status = ?,
         priority = ?,
         owner_estimate_hours = ?,
         description = ?,
         completed_at = ?
       WHERE id = ?`,
      [
        name,
        ownerUserId,
        normalizeStatus(status),
        normalizePriority(priority),
        normalizeDecimal(ownerEstimateHours),
        description || null,
        completedAt || null,
        demandId,
      ],
    )
    return result.affectedRows
  },

  async listLogs({
    page = 1,
    pageSize = 20,
    keyword = '',
    userId = null,
    demandId = '',
    phaseKey = '',
    itemTypeId = null,
    startDate = '',
    endDate = '',
    teamScopeUserId = null,
  } = {}) {
    const offset = (page - 1) * pageSize
    const conditions = ['1 = 1']
    const params = []

    if (userId) {
      conditions.push('l.user_id = ?')
      params.push(userId)
    }

    if (teamScopeUserId) {
      conditions.push(
        `u.department_id = (
          SELECT department_id FROM users WHERE id = ?
        )`,
      )
      params.push(teamScopeUserId)
    }

    if (demandId) {
      conditions.push('l.demand_id = ?')
      params.push(demandId)
    }

    if (phaseKey) {
      conditions.push('l.phase_key = ?')
      params.push(phaseKey)
    }

    if (itemTypeId) {
      conditions.push('l.item_type_id = ?')
      params.push(itemTypeId)
    }

    if (startDate) {
      conditions.push('l.log_date >= ?')
      params.push(startDate)
    }

    if (endDate) {
      conditions.push('l.log_date <= ?')
      params.push(endDate)
    }

    if (keyword) {
      conditions.push('(l.description LIKE ? OR COALESCE(l.demand_id, \'\') LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`)
    }

    const whereSql = conditions.join(' AND ')
    const listSql = `
      SELECT
        l.id,
        l.user_id,
        u.username,
        DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
        l.item_type_id,
        COALESCE(t.type_key, '-') AS item_type_key,
        COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
        COALESCE(t.require_demand, 0) AS require_demand,
        l.description,
        l.personal_estimate_hours,
        l.actual_hours,
        l.remaining_hours,
        COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
        l.demand_id,
        l.phase_key,
        DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
        DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
        COALESCE(p.phase_name, l.phase_key, '-') AS phase_name,
        d.name AS demand_name,
        l.created_at,
        l.updated_at
      FROM work_logs l
      INNER JOIN users u ON u.id = l.user_id
      LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
      LEFT JOIN work_demands d ON d.id = l.demand_id
      LEFT JOIN work_demand_phases p ON p.demand_id = l.demand_id AND p.phase_key = l.phase_key
      WHERE ${whereSql}
      ORDER BY l.log_date DESC, l.id DESC
      LIMIT ? OFFSET ?`

    const [rows] = await pool.query(listSql, [...params, pageSize, offset])
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM work_logs l
       INNER JOIN users u ON u.id = l.user_id
       WHERE ${whereSql}`,
      params,
    )

    return { rows, total }
  },

  async findLogById(id) {
    const [rows] = await pool.query(
      `SELECT
         l.id,
         l.user_id,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         l.item_type_id,
         l.description,
         l.personal_estimate_hours,
         l.actual_hours,
         l.remaining_hours,
         COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
         l.demand_id,
         l.phase_key,
         DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
         DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
         l.created_at,
         l.updated_at
       FROM work_logs l
       WHERE l.id = ?`,
      [id],
    )
    return rows[0] || null
  },

  async createLog({
    userId,
    logDate,
    itemTypeId,
    description,
    personalEstimateHours,
    actualHours,
    remainingHours,
    logStatus = 'IN_PROGRESS',
    demandId = null,
    phaseKey = null,
    expectedCompletionDate = null,
    logCompletedAt = null,
  }) {
    const [result] = await pool.query(
      `INSERT INTO work_logs (
         user_id, log_date, item_type_id, description, personal_estimate_hours, actual_hours, remaining_hours, log_status, demand_id, phase_key, expected_completion_date, log_completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'DONE' THEN COALESCE(?, NOW()) ELSE NULL END)`,
      [
        userId,
        logDate,
        itemTypeId,
        description,
        normalizeDecimal(personalEstimateHours, 0),
        normalizeDecimal(actualHours, 0),
        normalizeDecimal(remainingHours, 0),
        WORK_LOG_STATUSES.includes(String(logStatus || '').toUpperCase())
          ? String(logStatus).toUpperCase()
          : 'IN_PROGRESS',
        demandId,
        phaseKey,
        expectedCompletionDate,
        WORK_LOG_STATUSES.includes(String(logStatus || '').toUpperCase())
          ? String(logStatus).toUpperCase()
          : 'IN_PROGRESS',
        logCompletedAt,
      ],
    )
    return result.insertId
  },

  async updateLog(
    id,
    {
      logDate,
      itemTypeId,
      description,
      personalEstimateHours,
      actualHours,
      remainingHours,
      logStatus = 'IN_PROGRESS',
      demandId = null,
      phaseKey = null,
      expectedCompletionDate = null,
      logCompletedAt = null,
    },
  ) {
    const [result] = await pool.query(
      `UPDATE work_logs
       SET
         log_date = ?,
         item_type_id = ?,
         description = ?,
         personal_estimate_hours = ?,
         actual_hours = ?,
         remaining_hours = ?,
         log_status = ?,
         demand_id = ?,
         phase_key = ?,
         expected_completion_date = ?,
         log_completed_at = CASE
           WHEN ? = 'DONE' THEN COALESCE(?, log_completed_at, NOW())
           ELSE NULL
         END
       WHERE id = ?`,
      [
        logDate,
        itemTypeId,
        description,
        normalizeDecimal(personalEstimateHours, 0),
        normalizeDecimal(actualHours, 0),
        normalizeDecimal(remainingHours, 0),
        WORK_LOG_STATUSES.includes(String(logStatus || '').toUpperCase())
          ? String(logStatus).toUpperCase()
          : 'IN_PROGRESS',
        demandId,
        phaseKey,
        expectedCompletionDate,
        WORK_LOG_STATUSES.includes(String(logStatus || '').toUpperCase())
          ? String(logStatus).toUpperCase()
          : 'IN_PROGRESS',
        logCompletedAt,
        id,
      ],
    )
    return result.affectedRows
  },

  async getMyWorkbench(userId) {
    const [[today]] = await pool.query(
      `SELECT
         COUNT(*) AS log_count_today,
         COALESCE(SUM(personal_estimate_hours), 0) AS personal_estimate_hours_today,
         COALESCE(SUM(actual_hours), 0) AS actual_hours_today,
         COALESCE(SUM(remaining_hours), 0) AS remaining_hours_today
       FROM work_logs
       WHERE user_id = ? AND log_date = CURDATE()`,
      [userId],
    )

    const [activeItems] = await pool.query(
      `SELECT
         l.id,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         l.item_type_id,
         COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name,
         l.description,
         l.personal_estimate_hours,
         l.actual_hours,
         l.remaining_hours,
         COALESCE(l.log_status, 'IN_PROGRESS') AS log_status,
         DATE_FORMAT(l.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
         DATE_FORMAT(l.log_completed_at, '%Y-%m-%d %H:%i:%s') AS log_completed_at,
         l.demand_id,
         d.name AS demand_name,
         l.phase_key,
         COALESCE(p.phase_name, l.phase_key, '-') AS phase_name
       FROM work_logs l
       LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
       LEFT JOIN work_demands d ON d.id = l.demand_id
       LEFT JOIN work_demand_phases p ON p.demand_id = l.demand_id AND p.phase_key = l.phase_key
       WHERE l.user_id = ?
         AND COALESCE(l.log_status, 'IN_PROGRESS') <> 'DONE'
       ORDER BY
         CASE COALESCE(l.log_status, 'IN_PROGRESS')
           WHEN 'TODO' THEN 0
           WHEN 'IN_PROGRESS' THEN 1
           ELSE 2
         END ASC,
         CASE WHEN l.expected_completion_date IS NULL THEN 1 ELSE 0 END ASC,
         l.expected_completion_date ASC,
         l.updated_at DESC
       LIMIT 30`,
      [userId],
    )

    const [recentLogs] = await pool.query(
      `SELECT
         l.id,
         DATE_FORMAT(l.log_date, '%Y-%m-%d') AS log_date,
         l.personal_estimate_hours,
         l.actual_hours,
         l.remaining_hours,
         l.description,
         l.demand_id,
         COALESCE(t.name, CONCAT('类型#', l.item_type_id)) AS item_type_name
       FROM work_logs l
       LEFT JOIN (${ITEM_TYPE_LOOKUP_SQL}) t ON t.id = l.item_type_id
       WHERE l.user_id = ?
       ORDER BY l.log_date DESC, l.id DESC
       LIMIT 10`,
      [userId],
    )

    return {
      today: {
        log_count_today: Number(today?.log_count_today || 0),
        personal_estimate_hours_today: Number(today?.personal_estimate_hours_today || 0),
        actual_hours_today: Number(today?.actual_hours_today || 0),
        remaining_hours_today: Number(today?.remaining_hours_today || 0),
      },
      active_items: activeItems,
      recent_logs: recentLogs,
    }
  },

  async getOwnerWorkbench(ownerUserId) {
    const teamMemberIds = await getTeamMemberIds(ownerUserId)
    const ids = teamMemberIds.length > 0 ? teamMemberIds : [ownerUserId]

    const [[overview]] = await pool.query(
      `SELECT
         COUNT(*) AS team_size,
         COUNT(DISTINCT CASE WHEN wl.log_date = CURDATE() THEN wl.user_id END) AS filled_users_today,
         COALESCE(SUM(CASE WHEN wl.log_date = CURDATE() THEN wl.personal_estimate_hours ELSE 0 END), 0) AS total_personal_estimate_hours_today,
         COALESCE(SUM(CASE WHEN wl.log_date = CURDATE() THEN wl.actual_hours ELSE 0 END), 0) AS total_actual_hours_today
       FROM users u
       LEFT JOIN work_logs wl ON wl.user_id = u.id
       WHERE u.id IN (?)`,
      [ids],
    )

    const [noFillMembers] = await pool.query(
      `SELECT
         u.id,
         u.username
       FROM users u
       LEFT JOIN (
         SELECT DISTINCT user_id
         FROM work_logs
         WHERE log_date = CURDATE()
       ) l ON l.user_id = u.id
       WHERE u.id IN (?) AND l.user_id IS NULL
       ORDER BY u.id ASC`,
      [ids],
    )

    const [demandRisks] = await pool.query(
      `SELECT
         d.id,
         d.name,
         d.status,
         d.priority,
         d.owner_estimate_hours,
         COALESCE(ta.total_personal_estimate_hours, 0) AS total_personal_estimate_hours,
         COALESCE(ta.total_actual_hours, 0) AS total_actual_hours,
         COALESCE(lr.remaining_hours, 0) AS latest_remaining_hours,
         ROUND(
           COALESCE(ta.total_actual_hours, 0) +
           COALESCE(lr.remaining_hours, 0) -
           COALESCE(d.owner_estimate_hours, 0),
           1
         ) AS deviation_hours
       FROM work_demands d
       INNER JOIN users u ON u.id = d.owner_user_id
       LEFT JOIN (
         SELECT
           demand_id,
           SUM(personal_estimate_hours) AS total_personal_estimate_hours,
           SUM(actual_hours) AS total_actual_hours
         FROM work_logs
         WHERE demand_id IS NOT NULL
         GROUP BY demand_id
       ) ta ON ta.demand_id = d.id
       LEFT JOIN (
         SELECT l1.demand_id, l1.remaining_hours
         FROM work_logs l1
         INNER JOIN (
           SELECT demand_id, MAX(id) AS max_id
           FROM work_logs
           WHERE demand_id IS NOT NULL
           GROUP BY demand_id
         ) l2 ON l1.id = l2.max_id
       ) lr ON lr.demand_id = d.id
       WHERE u.id IN (?) AND d.status IN ('TODO', 'IN_PROGRESS')
       ORDER BY deviation_hours DESC, d.updated_at DESC
       LIMIT 20`,
      [ids],
    )

    const [phaseRisks] = await pool.query(
      `SELECT
         p.demand_id,
         d.name AS demand_name,
         p.phase_key,
         p.phase_name,
         p.status,
         p.owner_user_id,
         ou.username AS owner_name,
         p.estimate_hours,
         COALESCE(ta.personal_estimate_hours, 0) AS personal_estimate_hours,
         COALESCE(ta.actual_hours, 0) AS actual_hours,
         COALESCE(lr.remaining_hours, 0) AS latest_remaining_hours,
         ROUND(
           COALESCE(ta.actual_hours, 0) +
           COALESCE(lr.remaining_hours, 0) -
           COALESCE(p.estimate_hours, 0),
           1
         ) AS deviation_hours,
         CASE
           WHEN COALESCE(p.estimate_hours, 0) <= 0 THEN NULL
           ELSE ROUND(
             (
               COALESCE(ta.actual_hours, 0) +
               COALESCE(lr.remaining_hours, 0) -
               COALESCE(p.estimate_hours, 0)
             ) / p.estimate_hours * 100,
             1
           )
         END AS deviation_rate
       FROM work_demand_phases p
       INNER JOIN work_demands d ON d.id = p.demand_id
       INNER JOIN users u ON u.id = d.owner_user_id
       LEFT JOIN users ou ON ou.id = p.owner_user_id
       LEFT JOIN (
         SELECT
           demand_id,
           phase_key,
           SUM(personal_estimate_hours) AS personal_estimate_hours,
           SUM(actual_hours) AS actual_hours
         FROM work_logs
         WHERE demand_id IS NOT NULL AND phase_key IS NOT NULL AND phase_key <> ''
         GROUP BY demand_id, phase_key
       ) ta ON ta.demand_id = p.demand_id AND ta.phase_key = p.phase_key
       LEFT JOIN (
         SELECT l1.demand_id, l1.phase_key, l1.remaining_hours
         FROM work_logs l1
         INNER JOIN (
           SELECT demand_id, phase_key, MAX(id) AS max_id
           FROM work_logs
           WHERE demand_id IS NOT NULL AND phase_key IS NOT NULL AND phase_key <> ''
           GROUP BY demand_id, phase_key
         ) l2 ON l1.id = l2.max_id
       ) lr ON lr.demand_id = p.demand_id AND lr.phase_key = p.phase_key
       WHERE u.id IN (?)
         AND d.status IN ('TODO', 'IN_PROGRESS')
         AND p.status IN ('TODO', 'IN_PROGRESS')
         AND (
           COALESCE(p.estimate_hours, 0) > 0
           OR COALESCE(ta.actual_hours, 0) > 0
           OR COALESCE(lr.remaining_hours, 0) > 0
         )
       ORDER BY deviation_hours DESC, d.updated_at DESC, p.sort_order ASC
       LIMIT 30`,
      [ids],
    )

    const teamSize = Number(overview?.team_size || 0)
    const filledUsersToday = Number(overview?.filled_users_today || 0)

    return {
      team_overview: {
        team_size: teamSize,
        filled_users_today: filledUsersToday,
        unfilled_users_today: Math.max(teamSize - filledUsersToday, 0),
        total_personal_estimate_hours_today: Number(overview?.total_personal_estimate_hours_today || 0),
        total_actual_hours_today: Number(overview?.total_actual_hours_today || 0),
      },
      no_fill_members: noFillMembers,
      demand_risks: demandRisks,
      phase_risks: phaseRisks,
    }
  },

  async previewNoFillReminders(ownerUserId) {
    const ownerWorkbench = await this.getOwnerWorkbench(ownerUserId)
    return {
      date: new Date().toISOString().slice(0, 10),
      total_members: ownerWorkbench.team_overview.team_size,
      no_fill_members: ownerWorkbench.no_fill_members,
    }
  },
}

module.exports = Work

