const pool = require('../utils/db')

const REVIEW_STATUS = Object.freeze({
  PENDING: 'PENDING',
  IN_REVIEW: 'IN_REVIEW',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
})

const PARTICIPANT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
})

const LOG_ACTION = Object.freeze({
  INIT: 'INIT',
  UPDATE: 'UPDATE',
  SUBMIT: 'SUBMIT',
  REOPEN: 'REOPEN',
  SKIP: 'SKIP',
  UNSKIP: 'UNSKIP',
  PARTICIPANTS_UPDATE: 'PARTICIPANTS_UPDATE',
  PARTICIPANT_SUBMIT: 'PARTICIPANT_SUBMIT',
})

let tableReady = false

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function toPositiveIntList(value) {
  const list = Array.isArray(value)
    ? value
    : String(value === undefined || value === null ? '' : value)
        .split(',')
        .map((item) => String(item || '').trim())
  return Array.from(new Set(list.map((item) => toPositiveInt(item)).filter(Boolean)))
}

function normalizeText(value, maxLen = 5000) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeDemandId(value) {
  return normalizeText(value, 64).toUpperCase()
}

function normalizeDate(value) {
  const text = normalizeText(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function normalizeReviewStatus(value, fallback = REVIEW_STATUS.PENDING) {
  const status = normalizeText(value, 32).toUpperCase()
  return Object.values(REVIEW_STATUS).includes(status) ? status : fallback
}

function normalizeParticipantStatus(value, fallback = PARTICIPANT_STATUS.PENDING) {
  const status = normalizeText(value, 32).toUpperCase()
  return Object.values(PARTICIPANT_STATUS).includes(status) ? status : fallback
}

function toScore(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  if (!Number.isInteger(num)) return null
  if (num < 0 || num > 100) return null
  return num
}

function formatDateTime(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function mapReviewRow(row = {}) {
  return {
    id: Number(row.id || 0),
    demand_id: row.demand_id || '',
    status: normalizeReviewStatus(row.status),
    overall_score: row.overall_score === null || row.overall_score === undefined ? null : Number(row.overall_score),
    related_okr: row.related_okr || '',
    review_value_summary: row.review_value_summary || '',
    review_benefit_result: row.review_benefit_result || '',
    review_improvement_notes: row.review_improvement_notes || '',
    skip_reason: row.skip_reason || '',
    created_by: Number(row.created_by || 0),
    updated_by: row.updated_by ? Number(row.updated_by) : null,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
    submitted_at: formatDateTime(row.submitted_at),
    review_date: row.review_date || null,
    demand_name: row.demand_name || '',
    demand_owner_user_id: row.demand_owner_user_id ? Number(row.demand_owner_user_id) : null,
    demand_owner_name: row.demand_owner_name || '',
    demand_expected_release_date: row.demand_expected_release_date || null,
    demand_created_at: row.demand_created_at || null,
    demand_business_value_expectation: row.demand_business_value_expectation || '',
    demand_status: row.demand_status || '',
  }
}

function mapReviewLogRow(row = {}) {
  return {
    id: Number(row.id || 0),
    review_id: Number(row.review_id || 0),
    action_type: row.action_type || '',
    from_status: row.from_status || '',
    to_status: row.to_status || '',
    action_note: row.action_note || '',
    operator_user_id: Number(row.operator_user_id || 0),
    operator_name: row.operator_name || '',
    created_at: formatDateTime(row.created_at),
  }
}

function buildParticipantSubmitActionNote(participant = {}) {
  const completionScore = Number(participant?.completion_score)
  const valueScore = Number(participant?.value_score)
  const hasCompletionScore = Number.isInteger(completionScore) && completionScore >= 0 && completionScore <= 100
  const hasValueScore = Number.isInteger(valueScore) && valueScore >= 0 && valueScore <= 100
  const reason = normalizeText(participant?.score_reason, 120)

  if (hasCompletionScore && hasValueScore) {
    return `提交评价：完成度${completionScore}分，价值${valueScore}分${reason ? `；理由：${reason}` : ''}`
  }
  if (reason) {
    return `提交评价：理由：${reason}`
  }
  return '提交评价'
}

function normalizeParticipantSubmitLogNote(log = {}, participants = []) {
  if (String(log?.action_type || '').toUpperCase() !== LOG_ACTION.PARTICIPANT_SUBMIT) {
    return log?.action_note || ''
  }

  const actionNote = String(log?.action_note || '').trim()
  if (!actionNote) return '提交评价'
  if (actionNote.includes('完成度') && actionNote.includes('价值')) return actionNote

  const matchedUserId = actionNote.match(/user_id\s*=\s*(\d+)/i)
  const fallbackUserId = toPositiveInt(log?.operator_user_id)
  const userId = toPositiveInt(matchedUserId?.[1]) || fallbackUserId
  if (!userId) return actionNote

  const participant = (Array.isArray(participants) ? participants : []).find(
    (item) => toPositiveInt(item?.user_id) === userId,
  )
  if (!participant) return actionNote

  return buildParticipantSubmitActionNote(participant)
}

function mapParticipantRow(row = {}) {
  return {
    id: Number(row.id || 0),
    review_id: Number(row.review_id || 0),
    user_id: Number(row.user_id || 0),
    status: normalizeParticipantStatus(row.status),
    created_by: Number(row.created_by || 0),
    updated_by: row.updated_by ? Number(row.updated_by) : null,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
    user_name: row.user_name || '',
    completion_score:
      row.completion_score === null || row.completion_score === undefined ? null : Number(row.completion_score),
    value_score: row.value_score === null || row.value_score === undefined ? null : Number(row.value_score),
    score_reason: row.score_reason || '',
  }
}

async function ensureTable() {
  if (tableReady) return

  await pool.query(
    `CREATE TABLE IF NOT EXISTS demand_value_reviews (
      id BIGINT NOT NULL AUTO_INCREMENT,
      demand_id VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      overall_score INT DEFAULT NULL,
      related_okr TEXT DEFAULT NULL,
      review_value_summary TEXT DEFAULT NULL,
      review_benefit_result TEXT DEFAULT NULL,
      review_improvement_notes TEXT DEFAULT NULL,
      skip_reason TEXT DEFAULT NULL,
      created_by INT NOT NULL,
      updated_by INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      submitted_at DATETIME DEFAULT NULL,
      review_date DATE DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uk_demand_value_review_demand (demand_id),
      KEY idx_demand_value_review_status (status),
      KEY idx_demand_value_review_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  )

  await pool.query(
    `CREATE TABLE IF NOT EXISTS demand_value_review_logs (
      id BIGINT NOT NULL AUTO_INCREMENT,
      review_id BIGINT NOT NULL,
      action_type VARCHAR(32) NOT NULL,
      from_status VARCHAR(32) DEFAULT NULL,
      to_status VARCHAR(32) DEFAULT NULL,
      action_note TEXT DEFAULT NULL,
      operator_user_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_demand_value_review_logs_review_id (review_id),
      KEY idx_demand_value_review_logs_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  )

  await pool.query(
    `CREATE TABLE IF NOT EXISTS demand_value_review_participants (
      id BIGINT NOT NULL AUTO_INCREMENT,
      review_id BIGINT NOT NULL,
      user_id INT NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      created_by INT NOT NULL,
      updated_by INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_demand_value_review_participant (review_id, user_id),
      KEY idx_demand_value_review_participants_review_id (review_id),
      KEY idx_demand_value_review_participants_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  )

  await pool.query(
    `CREATE TABLE IF NOT EXISTS demand_value_review_participant_scores (
      id BIGINT NOT NULL AUTO_INCREMENT,
      participant_id BIGINT NOT NULL,
      completion_score INT NOT NULL,
      value_score INT NOT NULL,
      score_reason TEXT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_demand_value_review_participant_score (participant_id),
      KEY idx_demand_value_review_participant_scores_participant_id (participant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  )

  const [reviewDateColumnRows] = await pool.query(
    `SHOW COLUMNS FROM demand_value_reviews LIKE 'review_date'`,
  )
  if (!Array.isArray(reviewDateColumnRows) || reviewDateColumnRows.length === 0) {
    await pool.query(
      `ALTER TABLE demand_value_reviews
       ADD COLUMN review_date DATE DEFAULT NULL AFTER submitted_at`,
    )
  }

  const [relatedOkrColumnRows] = await pool.query(
    `SHOW COLUMNS FROM demand_value_reviews LIKE 'related_okr'`,
  )
  if (!Array.isArray(relatedOkrColumnRows) || relatedOkrColumnRows.length === 0) {
    await pool.query(
      `ALTER TABLE demand_value_reviews
       ADD COLUMN related_okr TEXT DEFAULT NULL AFTER overall_score`,
    )
  }

  tableReady = true
}

async function appendReviewLog(
  conn,
  {
    reviewId,
    actionType,
    fromStatus = null,
    toStatus = null,
    actionNote = null,
    operatorUserId,
  },
) {
  await conn.query(
    `INSERT INTO demand_value_review_logs (
      review_id, action_type, from_status, to_status, action_note, operator_user_id
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      toPositiveInt(reviewId),
      normalizeText(actionType, 32).toUpperCase() || LOG_ACTION.UPDATE,
      fromStatus ? normalizeReviewStatus(fromStatus) : null,
      toStatus ? normalizeReviewStatus(toStatus) : null,
      normalizeText(actionNote, 10000) || null,
      toPositiveInt(operatorUserId) || 0,
    ],
  )
}

async function getDemandById(demandId) {
  const normalizedDemandId = normalizeDemandId(demandId)
  if (!normalizedDemandId) return null
  const [rows] = await pool.query(
    `SELECT
       d.id,
       d.name,
       d.owner_user_id,
       d.status,
       DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS expected_release_date,
       COALESCE(NULLIF(u.real_name, ''), u.username) AS owner_name
     FROM work_demands d
     LEFT JOIN users u ON u.id = d.owner_user_id
     WHERE d.id = ?
     LIMIT 1`,
    [normalizedDemandId],
  )
  return rows[0] || null
}

async function getReviewById(reviewId) {
  await ensureTable()
  const normalizedReviewId = toPositiveInt(reviewId)
  if (!normalizedReviewId) return null

  const [rows] = await pool.query(
    `SELECT
       r.*,
       d.name AS demand_name,
       d.owner_user_id AS demand_owner_user_id,
       COALESCE(NULLIF(u.real_name, ''), u.username, '') AS demand_owner_name,
       DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS demand_expected_release_date,
       DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS demand_created_at,
       d.business_value_expectation AS demand_business_value_expectation,
       d.status AS demand_status
     FROM demand_value_reviews r
     LEFT JOIN work_demands d ON d.id = r.demand_id
     LEFT JOIN users u ON u.id = d.owner_user_id
     WHERE r.id = ?
     LIMIT 1`,
    [normalizedReviewId],
  )
  return rows[0] ? mapReviewRow(rows[0]) : null
}

async function getReviewByDemandId(demandId) {
  await ensureTable()
  const normalizedDemandId = normalizeDemandId(demandId)
  if (!normalizedDemandId) return null
  const [rows] = await pool.query(
    `SELECT
       r.*,
       d.name AS demand_name,
       d.owner_user_id AS demand_owner_user_id,
       COALESCE(NULLIF(u.real_name, ''), u.username, '') AS demand_owner_name,
       DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS demand_expected_release_date,
       DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i:%s') AS demand_created_at,
       d.business_value_expectation AS demand_business_value_expectation,
       d.status AS demand_status
     FROM demand_value_reviews r
     LEFT JOIN work_demands d ON d.id = r.demand_id
     LEFT JOIN users u ON u.id = d.owner_user_id
     WHERE r.demand_id = ?
     LIMIT 1`,
    [normalizedDemandId],
  )
  return rows[0] ? mapReviewRow(rows[0]) : null
}

async function listParticipantsByReviewId(reviewId) {
  const normalizedReviewId = toPositiveInt(reviewId)
  if (!normalizedReviewId) return []
  const [rows] = await pool.query(
    `SELECT
       p.*,
       COALESCE(NULLIF(u.real_name, ''), u.username, CONCAT('用户#', p.user_id)) AS user_name,
       s.completion_score,
       s.value_score,
       s.score_reason
     FROM demand_value_review_participants p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN demand_value_review_participant_scores s ON s.participant_id = p.id
     WHERE p.review_id = ?
     ORDER BY p.id ASC`,
    [normalizedReviewId],
  )
  return rows.map((row) => mapParticipantRow(row))
}

async function syncParticipants(conn, reviewId, participantUserIds, operatorUserId) {
  const normalizedReviewId = toPositiveInt(reviewId)
  const normalizedOperatorId = toPositiveInt(operatorUserId)
  const nextUserIds = toPositiveIntList(participantUserIds)
  if (!normalizedReviewId || !normalizedOperatorId) {
    return {
      addedUserIds: [],
      removedUserIds: [],
      currentParticipants: [],
    }
  }

  const [existingRows] = await conn.query(
    `SELECT id, user_id
     FROM demand_value_review_participants
     WHERE review_id = ?`,
    [normalizedReviewId],
  )
  const existingByUserId = new Map()
  existingRows.forEach((row) => {
    const userId = toPositiveInt(row.user_id)
    if (!userId) return
    existingByUserId.set(userId, {
      id: Number(row.id || 0),
      user_id: userId,
    })
  })

  const nextSet = new Set(nextUserIds)
  const addedUserIds = []
  const removedParticipants = []

  nextUserIds.forEach((userId) => {
    if (existingByUserId.has(userId)) return
    addedUserIds.push(userId)
  })

  existingByUserId.forEach((item, userId) => {
    if (nextSet.has(userId)) return
    removedParticipants.push(item)
  })

  if (removedParticipants.length > 0) {
    const participantIds = removedParticipants.map((item) => Number(item.id || 0)).filter((id) => id > 0)
    if (participantIds.length > 0) {
      const placeholders = participantIds.map(() => '?').join(', ')
      await conn.query(
        `DELETE FROM demand_value_review_participant_scores
         WHERE participant_id IN (${placeholders})`,
        participantIds,
      )
      await conn.query(
        `DELETE FROM demand_value_review_participants
         WHERE id IN (${placeholders})`,
        participantIds,
      )
    }
  }

  for (const userId of addedUserIds) {
    await conn.query(
      `INSERT INTO demand_value_review_participants (
         review_id, user_id, status, created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?)`,
      [normalizedReviewId, userId, PARTICIPANT_STATUS.PENDING, normalizedOperatorId, normalizedOperatorId],
    )
  }

  return {
    addedUserIds,
    removedUserIds: removedParticipants.map((item) => item.user_id),
    currentParticipants: nextUserIds,
  }
}

async function buildReviewDetail(reviewId) {
  const record = await getReviewById(reviewId)
  if (!record) return null

  const [logsRows] = await pool.query(
    `SELECT
       l.*,
       COALESCE(NULLIF(u.real_name, ''), u.username, '') AS operator_name
     FROM demand_value_review_logs l
     LEFT JOIN users u ON u.id = l.operator_user_id
     WHERE l.review_id = ?
     ORDER BY l.id DESC`,
    [record.id],
  )

  const [[supportRow]] = await pool.query(
    `SELECT
       COUNT(*) AS log_count,
       ROUND(COALESCE(SUM(COALESCE(l.actual_hours, 0)), 0), 1) AS total_actual_hours,
       ROUND(COALESCE(SUM(COALESCE(l.personal_estimate_hours, 0)), 0), 1) AS total_estimate_hours,
       MAX(l.updated_at) AS latest_log_updated_at
     FROM work_logs l
     WHERE l.demand_id = ?`,
    [record.demand_id],
  )

  const [[bugStatsRow]] = await pool.query(
    `SELECT
       COUNT(*) AS total_bug_count
     FROM bugs b
     WHERE b.demand_id = ?`,
    [record.demand_id],
  )

  const participants = await listParticipantsByReviewId(record.id)
  const submittedParticipantCount = participants.filter((item) => item.status === PARTICIPANT_STATUS.SUBMITTED).length

  return {
    ...record,
    support: {
      log_count: Number(supportRow?.log_count || 0),
      total_actual_hours: Number(supportRow?.total_actual_hours || 0),
      total_estimate_hours: Number(supportRow?.total_estimate_hours || 0),
      latest_log_updated_at: formatDateTime(supportRow?.latest_log_updated_at),
      total_bug_count: Number(bugStatsRow?.total_bug_count || 0),
    },
    participants,
    participant_stats: {
      total: participants.length,
      submitted: submittedParticipantCount,
      pending: Math.max(participants.length - submittedParticipantCount, 0),
    },
    logs: logsRows.map((row) => {
      const mapped = mapReviewLogRow(row)
      return {
        ...mapped,
        action_note: normalizeParticipantSubmitLogNote(mapped, participants),
      }
    }),
  }
}

const DemandValueReview = {
  REVIEW_STATUS,
  PARTICIPANT_STATUS,
  LOG_ACTION,

  async initForDemand(demandId, operatorUserId, participantUserIds = []) {
    await ensureTable()
    const normalizedDemandId = normalizeDemandId(demandId)
    const normalizedOperatorId = toPositiveInt(operatorUserId)
    const normalizedParticipantUserIds = toPositiveIntList(participantUserIds)
    if (!normalizedDemandId || !normalizedOperatorId) {
      const error = new Error('参数无效')
      error.code = 'INVALID_PARAMS'
      throw error
    }
    if (normalizedParticipantUserIds.length === 0) {
      const error = new Error('请至少选择一位复盘参与人')
      error.code = 'PARTICIPANT_REQUIRED'
      throw error
    }

    const demand = await getDemandById(normalizedDemandId)
    if (!demand) {
      const error = new Error('需求不存在')
      error.code = 'DEMAND_NOT_FOUND'
      throw error
    }
    if (String(demand.status || '').trim().toUpperCase() !== 'DONE') {
      const error = new Error('当前需求未上线，暂不可发起价值复盘')
      error.code = 'DEMAND_NOT_DONE'
      throw error
    }

    const existing = await getReviewByDemandId(normalizedDemandId)
    if (existing) {
      const detail = await this.updateParticipants(existing.id, normalizedParticipantUserIds, normalizedOperatorId)
      return {
        created: false,
        record: detail,
      }
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [result] = await conn.query(
        `INSERT INTO demand_value_reviews (
           demand_id, status, created_by, updated_by
         ) VALUES (?, ?, ?, ?)`,
        [normalizedDemandId, REVIEW_STATUS.PENDING, normalizedOperatorId, normalizedOperatorId],
      )
      const reviewId = Number(result?.insertId || 0)

      await syncParticipants(conn, reviewId, normalizedParticipantUserIds, normalizedOperatorId)

      await appendReviewLog(conn, {
        reviewId,
        actionType: LOG_ACTION.INIT,
        fromStatus: null,
        toStatus: REVIEW_STATUS.PENDING,
        actionNote: `发起价值复盘，参与人数量：${normalizedParticipantUserIds.length}`,
        operatorUserId: normalizedOperatorId,
      })
      await conn.commit()
      const record = await buildReviewDetail(reviewId)
      return {
        created: true,
        record,
      }
    } catch (error) {
      await conn.rollback()
      if (error?.code === 'ER_DUP_ENTRY') {
        const record = await getReviewByDemandId(normalizedDemandId)
        if (!record) throw error
        const detail = await this.updateParticipants(record.id, normalizedParticipantUserIds, normalizedOperatorId)
        return { created: false, record: detail }
      }
      throw error
    } finally {
      conn.release()
    }
  },

  async list({
    keyword = '',
    status = '',
    ownerUserId = null,
    startDate = '',
    endDate = '',
    reviewStartDate = '',
    reviewEndDate = '',
    sortBy = '',
    sortOrder = '',
    page = 1,
    pageSize = 20,
  } = {}) {
    await ensureTable()
    const normalizedPage = Math.max(toPositiveInt(page) || 1, 1)
    const normalizedPageSize = Math.min(Math.max(toPositiveInt(pageSize) || 20, 1), 200)
    const offset = (normalizedPage - 1) * normalizedPageSize

    const conditions = []
    const params = []
    const normalizedKeyword = normalizeText(keyword, 120)
    const normalizedStatus = normalizeReviewStatus(status, '')
    const normalizedOwnerUserId = toPositiveInt(ownerUserId)
    const normalizedStartDate = /^\d{4}-\d{2}-\d{2}$/.test(String(startDate || '').trim()) ? String(startDate).trim() : ''
    const normalizedEndDate = /^\d{4}-\d{2}-\d{2}$/.test(String(endDate || '').trim()) ? String(endDate).trim() : ''
    const normalizedReviewStartDate = /^\d{4}-\d{2}-\d{2}$/.test(String(reviewStartDate || '').trim()) ? String(reviewStartDate).trim() : ''
    const normalizedReviewEndDate = /^\d{4}-\d{2}-\d{2}$/.test(String(reviewEndDate || '').trim()) ? String(reviewEndDate).trim() : ''

    if (normalizedKeyword) {
      conditions.push('(r.demand_id LIKE ? OR d.name LIKE ?)')
      params.push(`%${normalizedKeyword}%`, `%${normalizedKeyword}%`)
    }
    if (normalizedStatus) {
      conditions.push('r.status = ?')
      params.push(normalizedStatus)
    }
    if (normalizedOwnerUserId) {
      conditions.push('d.owner_user_id = ?')
      params.push(normalizedOwnerUserId)
    }
    if (normalizedStartDate) {
      conditions.push('DATE(r.created_at) >= ?')
      params.push(normalizedStartDate)
    }
    if (normalizedEndDate) {
      conditions.push('DATE(r.created_at) <= ?')
      params.push(normalizedEndDate)
    }
    if (normalizedReviewStartDate) {
      conditions.push('r.review_date >= ?')
      params.push(normalizedReviewStartDate)
    }
    if (normalizedReviewEndDate) {
      conditions.push('r.review_date <= ?')
      params.push(normalizedReviewEndDate)
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const normalizedSortBy = normalizeText(sortBy, 64).toLowerCase()
    const normalizedSortOrder = normalizeText(sortOrder, 16).toLowerCase() === 'asc' ? 'ASC' : 'DESC'
    const orderSql =
      normalizedSortBy === 'overall_score'
        ? `ORDER BY (r.overall_score IS NULL) ASC, r.overall_score ${normalizedSortOrder}, r.updated_at DESC, r.id DESC`
        : 'ORDER BY r.updated_at DESC, r.id DESC'
    const [rows] = await pool.query(
      `SELECT
         r.*,
         d.name AS demand_name,
         d.owner_user_id AS demand_owner_user_id,
         COALESCE(NULLIF(u.real_name, ''), u.username, '') AS demand_owner_name,
         DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS demand_expected_release_date,
         d.status AS demand_status
       FROM demand_value_reviews r
       LEFT JOIN work_demands d ON d.id = r.demand_id
       LEFT JOIN users u ON u.id = d.owner_user_id
       ${whereSql}
       ${orderSql}
       LIMIT ? OFFSET ?`,
      [...params, normalizedPageSize, offset],
    )

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM demand_value_reviews r
       LEFT JOIN work_demands d ON d.id = r.demand_id
       ${whereSql}`,
      params,
    )

    const reviewIds = rows.map((item) => Number(item.id || 0)).filter((id) => id > 0)
    const participantStatsMap = {}
    if (reviewIds.length > 0) {
      const placeholders = reviewIds.map(() => '?').join(', ')
      const [statRows] = await pool.query(
        `SELECT
           p.review_id,
           COUNT(*) AS participant_total,
           SUM(CASE WHEN p.status = 'SUBMITTED' THEN 1 ELSE 0 END) AS participant_submitted
         FROM demand_value_review_participants p
         WHERE p.review_id IN (${placeholders})
         GROUP BY p.review_id`,
        reviewIds,
      )
      statRows.forEach((row) => {
        const reviewId = Number(row.review_id || 0)
        if (!reviewId) return
        const total = Number(row.participant_total || 0)
        const submitted = Number(row.participant_submitted || 0)
        participantStatsMap[reviewId] = {
          total,
          submitted,
          pending: Math.max(total - submitted, 0),
        }
      })
    }

    return {
      list: rows.map((row) => {
        const review = mapReviewRow(row)
        return {
          ...review,
          participant_stats: participantStatsMap[review.id] || { total: 0, submitted: 0, pending: 0 },
        }
      }),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total: Number(countRow?.total || 0),
    }
  },

  async getDetailById(reviewId) {
    await ensureTable()
    return buildReviewDetail(reviewId)
  },

  async updateParticipants(reviewId, participantUserIds, operatorUserId) {
    await ensureTable()
    const normalizedReviewId = toPositiveInt(reviewId)
    const normalizedOperatorId = toPositiveInt(operatorUserId)
    const normalizedParticipantUserIds = toPositiveIntList(participantUserIds)
    if (!normalizedReviewId || !normalizedOperatorId) {
      const error = new Error('参数无效')
      error.code = 'INVALID_PARAMS'
      throw error
    }
    if (normalizedParticipantUserIds.length === 0) {
      const error = new Error('请至少选择一位复盘参与人')
      error.code = 'PARTICIPANT_REQUIRED'
      throw error
    }

    const existing = await getReviewById(normalizedReviewId)
    if (!existing) {
      const error = new Error('复盘任务不存在')
      error.code = 'NOT_FOUND'
      throw error
    }
    if (existing.status === REVIEW_STATUS.COMPLETED) {
      const error = new Error('复盘已完成，不可调整参与人')
      error.code = 'COMPLETED_IMMUTABLE'
      throw error
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const syncResult = await syncParticipants(
        conn,
        normalizedReviewId,
        normalizedParticipantUserIds,
        normalizedOperatorId,
      )
      await conn.query(
        `UPDATE demand_value_reviews
         SET updated_by = ?, updated_at = NOW()
         WHERE id = ?`,
        [normalizedOperatorId, normalizedReviewId],
      )
      await appendReviewLog(conn, {
        reviewId: normalizedReviewId,
        actionType: LOG_ACTION.PARTICIPANTS_UPDATE,
        fromStatus: existing.status,
        toStatus: existing.status,
        actionNote: `参与人更新：新增 ${syncResult.addedUserIds.length} 人，移除 ${syncResult.removedUserIds.length} 人`,
        operatorUserId: normalizedOperatorId,
      })
      await conn.commit()
      return this.getDetailById(normalizedReviewId)
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  },

  async listMyPendingReviews(userId, { page = 1, pageSize = 50 } = {}) {
    await ensureTable()
    const normalizedUserId = toPositiveInt(userId)
    if (!normalizedUserId) return { list: [], page: 1, pageSize: 50, total: 0 }
    const normalizedPage = Math.max(toPositiveInt(page) || 1, 1)
    const normalizedPageSize = Math.min(Math.max(toPositiveInt(pageSize) || 50, 1), 200)
    const offset = (normalizedPage - 1) * normalizedPageSize

    const [rows] = await pool.query(
      `SELECT
         p.id AS participant_id,
         p.review_id,
         p.status AS participant_status,
         r.status AS review_status,
         r.overall_score,
         r.updated_at AS review_updated_at,
         r.demand_id,
         d.name AS demand_name,
         DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS demand_expected_release_date,
         s.completion_score,
         s.value_score,
         s.score_reason,
         stat.participant_total,
         stat.participant_submitted
       FROM demand_value_review_participants p
       INNER JOIN demand_value_reviews r ON r.id = p.review_id
       LEFT JOIN work_demands d ON d.id = r.demand_id
       LEFT JOIN demand_value_review_participant_scores s ON s.participant_id = p.id
       LEFT JOIN (
         SELECT
           review_id,
           COUNT(*) AS participant_total,
           SUM(CASE WHEN status = 'SUBMITTED' THEN 1 ELSE 0 END) AS participant_submitted
         FROM demand_value_review_participants
         GROUP BY review_id
       ) stat ON stat.review_id = p.review_id
       WHERE p.user_id = ?
         AND r.status IN ('PENDING', 'IN_REVIEW')
       ORDER BY r.updated_at DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      [normalizedUserId, normalizedPageSize, offset],
    )

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM demand_value_review_participants p
       INNER JOIN demand_value_reviews r ON r.id = p.review_id
       WHERE p.user_id = ?
         AND r.status IN ('PENDING', 'IN_REVIEW')`,
      [normalizedUserId],
    )

    return {
      list: (rows || []).map((row) => ({
        participant_id: Number(row.participant_id || 0),
        review_id: Number(row.review_id || 0),
        participant_status: normalizeParticipantStatus(row.participant_status),
        review_status: normalizeReviewStatus(row.review_status),
        overall_score: row.overall_score === null || row.overall_score === undefined ? null : Number(row.overall_score),
        review_updated_at: formatDateTime(row.review_updated_at),
        demand_id: row.demand_id || '',
        demand_name: row.demand_name || '',
        demand_expected_release_date: row.demand_expected_release_date || null,
        completion_score: row.completion_score === null || row.completion_score === undefined ? null : Number(row.completion_score),
        value_score: row.value_score === null || row.value_score === undefined ? null : Number(row.value_score),
        score_reason: row.score_reason || '',
        participant_stats: {
          total: Number(row.participant_total || 0),
          submitted: Number(row.participant_submitted || 0),
          pending: Math.max(Number(row.participant_total || 0) - Number(row.participant_submitted || 0), 0),
        },
      })),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total: Number(countRow?.total || 0),
    }
  },

  async getMyReviewDetail(reviewId, userId) {
    await ensureTable()
    const normalizedReviewId = toPositiveInt(reviewId)
    const normalizedUserId = toPositiveInt(userId)
    if (!normalizedReviewId || !normalizedUserId) return null

    const [participantRows] = await pool.query(
      `SELECT id, status
       FROM demand_value_review_participants
       WHERE review_id = ? AND user_id = ?
       LIMIT 1`,
      [normalizedReviewId, normalizedUserId],
    )
    const participant = participantRows[0] || null
    if (!participant) {
      const error = new Error('当前复盘任务未分配给你')
      error.code = 'FORBIDDEN'
      throw error
    }

    const detail = await buildReviewDetail(normalizedReviewId)
    if (!detail) return null
    return {
      ...detail,
      my_participant: {
        id: Number(participant.id || 0),
        status: normalizeParticipantStatus(participant.status),
      },
    }
  },

  async submitMyScore(reviewId, userId, payload = {}) {
    await ensureTable()
    const normalizedReviewId = toPositiveInt(reviewId)
    const normalizedUserId = toPositiveInt(userId)
    if (!normalizedReviewId || !normalizedUserId) {
      const error = new Error('参数无效')
      error.code = 'INVALID_PARAMS'
      throw error
    }

    const completionScore = toScore(payload.completion_score)
    const valueScore = toScore(payload.value_score)
    const scoreReason = normalizeText(payload.score_reason, 10000)
    if (completionScore === null || valueScore === null || !scoreReason) {
      const error = new Error('请完整填写完成度评分、价值评分和评分理由')
      error.code = 'INVALID_SUBMIT_PAYLOAD'
      throw error
    }

    const review = await getReviewById(normalizedReviewId)
    if (!review) {
      const error = new Error('复盘任务不存在')
      error.code = 'NOT_FOUND'
      throw error
    }
    if (review.status === REVIEW_STATUS.COMPLETED) {
      const error = new Error('复盘已完成，无法继续提交')
      error.code = 'REVIEW_COMPLETED'
      throw error
    }
    if (review.status === REVIEW_STATUS.SKIPPED) {
      const error = new Error('当前复盘已标记为无需复盘')
      error.code = 'REVIEW_SKIPPED'
      throw error
    }

    const [participantRows] = await pool.query(
      `SELECT id, status
       FROM demand_value_review_participants
       WHERE review_id = ? AND user_id = ?
       LIMIT 1`,
      [normalizedReviewId, normalizedUserId],
    )
    const participant = participantRows[0] || null
    if (!participant) {
      const error = new Error('当前复盘任务未分配给你')
      error.code = 'FORBIDDEN'
      throw error
    }
    const participantId = Number(participant.id || 0)
    if (!participantId) {
      const error = new Error('参与人状态异常')
      error.code = 'INVALID_PARTICIPANT'
      throw error
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query(
        `INSERT INTO demand_value_review_participant_scores (
           participant_id, completion_score, value_score, score_reason
         ) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           completion_score = VALUES(completion_score),
           value_score = VALUES(value_score),
           score_reason = VALUES(score_reason),
           updated_at = CURRENT_TIMESTAMP`,
        [participantId, completionScore, valueScore, scoreReason],
      )

      await conn.query(
        `UPDATE demand_value_review_participants
         SET status = ?, updated_by = ?, updated_at = NOW()
         WHERE id = ?`,
        [PARTICIPANT_STATUS.SUBMITTED, normalizedUserId, participantId],
      )

      const nextReviewStatus = review.status === REVIEW_STATUS.PENDING ? REVIEW_STATUS.IN_REVIEW : review.status
      await conn.query(
        `UPDATE demand_value_reviews
         SET status = ?, updated_by = ?, updated_at = NOW()
         WHERE id = ?`,
        [nextReviewStatus, normalizedUserId, normalizedReviewId],
      )

      await appendReviewLog(conn, {
        reviewId: normalizedReviewId,
        actionType: LOG_ACTION.PARTICIPANT_SUBMIT,
        fromStatus: review.status,
        toStatus: nextReviewStatus,
        actionNote: `提交评价：完成度${completionScore}分，价值${valueScore}分；理由：${String(scoreReason || '').slice(0, 120)}`,
        operatorUserId: normalizedUserId,
      })
      await conn.commit()
      return this.getMyReviewDetail(normalizedReviewId, normalizedUserId)
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  },

  async updateDraft(reviewId, payload = {}, operatorUserId) {
    await ensureTable()
    const normalizedReviewId = toPositiveInt(reviewId)
    const normalizedOperatorId = toPositiveInt(operatorUserId)
    if (!normalizedReviewId || !normalizedOperatorId) {
      const error = new Error('参数无效')
      error.code = 'INVALID_PARAMS'
      throw error
    }

    const existing = await getReviewById(normalizedReviewId)
    if (!existing) {
      const error = new Error('复盘任务不存在')
      error.code = 'NOT_FOUND'
      throw error
    }
    if (existing.status === REVIEW_STATUS.COMPLETED) {
      const error = new Error('已完成复盘不可编辑')
      error.code = 'COMPLETED_IMMUTABLE'
      throw error
    }

    const nextStatus = existing.status === REVIEW_STATUS.PENDING ? REVIEW_STATUS.IN_REVIEW : existing.status
    const overallScore =
      payload.overall_score === undefined
        ? existing.overall_score
        : payload.overall_score === null || payload.overall_score === ''
          ? null
          : toScore(payload.overall_score)
    if (payload.overall_score !== undefined && payload.overall_score !== null && payload.overall_score !== '' && overallScore === null) {
      const error = new Error('整体价值分需为 0-100 的整数')
      error.code = 'INVALID_SCORE'
      throw error
    }

    const reviewValueSummary =
      payload.review_value_summary === undefined
        ? existing.review_value_summary
        : normalizeText(payload.review_value_summary, 10000)
    const relatedOkr =
      payload.related_okr === undefined
        ? existing.related_okr
        : normalizeText(payload.related_okr, 10000)
    const reviewBenefitResult =
      payload.review_benefit_result === undefined
        ? existing.review_benefit_result
        : normalizeText(payload.review_benefit_result, 10000)
    const reviewImprovementNotes =
      payload.review_improvement_notes === undefined
        ? existing.review_improvement_notes
        : normalizeText(payload.review_improvement_notes, 10000)
    const reviewDate =
      payload.review_date === undefined
        ? existing.review_date
        : normalizeDate(payload.review_date) || null

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query(
        `UPDATE demand_value_reviews
         SET
           status = ?,
           overall_score = ?,
           related_okr = ?,
           review_value_summary = ?,
           review_benefit_result = ?,
           review_improvement_notes = ?,
           review_date = ?,
           updated_by = ?,
           updated_at = NOW()
         WHERE id = ?`,
        [
          nextStatus,
          overallScore,
          relatedOkr || null,
          reviewValueSummary || null,
          reviewBenefitResult || null,
          reviewImprovementNotes || null,
          reviewDate,
          normalizedOperatorId,
          normalizedReviewId,
        ],
      )
      await appendReviewLog(conn, {
        reviewId: normalizedReviewId,
        actionType: LOG_ACTION.UPDATE,
        fromStatus: existing.status,
        toStatus: nextStatus,
        actionNote: '更新复盘草稿',
        operatorUserId: normalizedOperatorId,
      })
      await conn.commit()
      return this.getDetailById(normalizedReviewId)
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  },

  async submit(reviewId, payload = {}, operatorUserId) {
    await ensureTable()
    const normalizedReviewId = toPositiveInt(reviewId)
    const normalizedOperatorId = toPositiveInt(operatorUserId)
    if (!normalizedReviewId || !normalizedOperatorId) {
      const error = new Error('参数无效')
      error.code = 'INVALID_PARAMS'
      throw error
    }

    const existing = await getReviewById(normalizedReviewId)
    if (!existing) {
      const error = new Error('复盘任务不存在')
      error.code = 'NOT_FOUND'
      throw error
    }
    if (existing.status === REVIEW_STATUS.SKIPPED) {
      const error = new Error('当前复盘已标记为无需复盘，请先撤销后再提交')
      error.code = 'SKIPPED_IMMUTABLE'
      throw error
    }

    const overallScore = toScore(payload.overall_score)
    const relatedOkr = normalizeText(payload.related_okr, 10000)
    const reviewValueSummary = normalizeText(payload.review_value_summary, 10000)
    const reviewBenefitResult = normalizeText(payload.review_benefit_result, 10000)
    const reviewImprovementNotes = normalizeText(payload.review_improvement_notes, 10000)
    const reviewDate =
      payload.review_date === undefined
        ? existing.review_date
        : normalizeDate(payload.review_date) || null

    if (overallScore === null || !reviewValueSummary || !reviewBenefitResult || !reviewImprovementNotes) {
      const error = new Error('请完整填写价值评分与复盘记录后再提交')
      error.code = 'INVALID_SUBMIT_PAYLOAD'
      throw error
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query(
        `UPDATE demand_value_reviews
         SET
           status = ?,
           overall_score = ?,
           related_okr = ?,
           review_value_summary = ?,
           review_benefit_result = ?,
           review_improvement_notes = ?,
           review_date = ?,
           skip_reason = NULL,
           submitted_at = NOW(),
           updated_by = ?,
           updated_at = NOW()
         WHERE id = ?`,
        [
          REVIEW_STATUS.COMPLETED,
          overallScore,
          relatedOkr || null,
          reviewValueSummary,
          reviewBenefitResult,
          reviewImprovementNotes,
          reviewDate,
          normalizedOperatorId,
          normalizedReviewId,
        ],
      )
      await appendReviewLog(conn, {
        reviewId: normalizedReviewId,
        actionType: LOG_ACTION.SUBMIT,
        fromStatus: existing.status,
        toStatus: REVIEW_STATUS.COMPLETED,
        actionNote: '提交复盘',
        operatorUserId: normalizedOperatorId,
      })
      await conn.commit()
      return this.getDetailById(normalizedReviewId)
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  },

  async skip(reviewId, skipReason, operatorUserId) {
    await ensureTable()
    const normalizedReviewId = toPositiveInt(reviewId)
    const normalizedOperatorId = toPositiveInt(operatorUserId)
    const normalizedReason = normalizeText(skipReason, 10000)
    if (!normalizedReviewId || !normalizedOperatorId) {
      const error = new Error('参数无效')
      error.code = 'INVALID_PARAMS'
      throw error
    }
    if (!normalizedReason) {
      const error = new Error('请填写无需复盘原因')
      error.code = 'SKIP_REASON_REQUIRED'
      throw error
    }

    const existing = await getReviewById(normalizedReviewId)
    if (!existing) {
      const error = new Error('复盘任务不存在')
      error.code = 'NOT_FOUND'
      throw error
    }
    if (![REVIEW_STATUS.PENDING, REVIEW_STATUS.IN_REVIEW].includes(existing.status)) {
      const error = new Error('当前状态不可标记为无需复盘')
      error.code = 'INVALID_SKIP_STATUS'
      throw error
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query(
        `UPDATE demand_value_reviews
         SET
           status = ?,
           skip_reason = ?,
           updated_by = ?,
           updated_at = NOW()
         WHERE id = ?`,
        [REVIEW_STATUS.SKIPPED, normalizedReason, normalizedOperatorId, normalizedReviewId],
      )
      await appendReviewLog(conn, {
        reviewId: normalizedReviewId,
        actionType: LOG_ACTION.SKIP,
        fromStatus: existing.status,
        toStatus: REVIEW_STATUS.SKIPPED,
        actionNote: normalizedReason,
        operatorUserId: normalizedOperatorId,
      })
      await conn.commit()
      return this.getDetailById(normalizedReviewId)
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  },

  async unskip(reviewId, operatorUserId) {
    await ensureTable()
    const normalizedReviewId = toPositiveInt(reviewId)
    const normalizedOperatorId = toPositiveInt(operatorUserId)
    if (!normalizedReviewId || !normalizedOperatorId) {
      const error = new Error('参数无效')
      error.code = 'INVALID_PARAMS'
      throw error
    }

    const existing = await getReviewById(normalizedReviewId)
    if (!existing) {
      const error = new Error('复盘任务不存在')
      error.code = 'NOT_FOUND'
      throw error
    }
    if (existing.status !== REVIEW_STATUS.SKIPPED) {
      const error = new Error('仅无需复盘状态可撤销')
      error.code = 'INVALID_UNSKIP_STATUS'
      throw error
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query(
        `UPDATE demand_value_reviews
         SET
           status = ?,
           skip_reason = NULL,
           updated_by = ?,
           updated_at = NOW()
         WHERE id = ?`,
        [REVIEW_STATUS.PENDING, normalizedOperatorId, normalizedReviewId],
      )
      await appendReviewLog(conn, {
        reviewId: normalizedReviewId,
        actionType: LOG_ACTION.UNSKIP,
        fromStatus: REVIEW_STATUS.SKIPPED,
        toStatus: REVIEW_STATUS.PENDING,
        actionNote: '撤销无需复盘',
        operatorUserId: normalizedOperatorId,
      })
      await conn.commit()
      return this.getDetailById(normalizedReviewId)
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  },

  async reopenForEdit(reviewId, operatorUserId) {
    await ensureTable()
    const normalizedReviewId = toPositiveInt(reviewId)
    const normalizedOperatorId = toPositiveInt(operatorUserId)
    if (!normalizedReviewId || !normalizedOperatorId) {
      const error = new Error('参数无效')
      error.code = 'INVALID_PARAMS'
      throw error
    }

    const existing = await getReviewById(normalizedReviewId)
    if (!existing) {
      const error = new Error('复盘任务不存在')
      error.code = 'NOT_FOUND'
      throw error
    }
    if (existing.status !== REVIEW_STATUS.COMPLETED) {
      const error = new Error('仅已提交复盘可调整为复盘中')
      error.code = 'INVALID_REOPEN_STATUS'
      throw error
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query(
        `UPDATE demand_value_reviews
         SET
           status = ?,
           submitted_at = NULL,
           updated_by = ?,
           updated_at = NOW()
         WHERE id = ?`,
        [REVIEW_STATUS.IN_REVIEW, normalizedOperatorId, normalizedReviewId],
      )
      await appendReviewLog(conn, {
        reviewId: normalizedReviewId,
        actionType: LOG_ACTION.REOPEN,
        fromStatus: REVIEW_STATUS.COMPLETED,
        toStatus: REVIEW_STATUS.IN_REVIEW,
        actionNote: '调整状态为复盘中，允许继续编辑',
        operatorUserId: normalizedOperatorId,
      })
      await conn.commit()
      return this.getDetailById(normalizedReviewId)
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  },

  async deleteReview(reviewId, operatorUserId) {
    await ensureTable()
    const normalizedReviewId = toPositiveInt(reviewId)
    const normalizedOperatorId = toPositiveInt(operatorUserId)
    if (!normalizedReviewId || !normalizedOperatorId) {
      const error = new Error('参数无效')
      error.code = 'INVALID_PARAMS'
      throw error
    }

    const existing = await getReviewById(normalizedReviewId)
    if (!existing) {
      const error = new Error('复盘任务不存在')
      error.code = 'NOT_FOUND'
      throw error
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [participantRows] = await conn.query(
        `SELECT id
         FROM demand_value_review_participants
         WHERE review_id = ?`,
        [normalizedReviewId],
      )
      const participantIds = (Array.isArray(participantRows) ? participantRows : [])
        .map((row) => Number(row?.id || 0))
        .filter((id) => Number.isInteger(id) && id > 0)

      let deletedScoreCount = 0
      if (participantIds.length > 0) {
        const placeholders = participantIds.map(() => '?').join(', ')
        const [scoreDeleteResult] = await conn.query(
          `DELETE FROM demand_value_review_participant_scores
           WHERE participant_id IN (${placeholders})`,
          participantIds,
        )
        deletedScoreCount = Number(scoreDeleteResult?.affectedRows || 0)
      }

      const [participantDeleteResult] = await conn.query(
        `DELETE FROM demand_value_review_participants
         WHERE review_id = ?`,
        [normalizedReviewId],
      )
      const deletedParticipantCount = Number(participantDeleteResult?.affectedRows || 0)

      const [logDeleteResult] = await conn.query(
        `DELETE FROM demand_value_review_logs
         WHERE review_id = ?`,
        [normalizedReviewId],
      )
      const deletedLogCount = Number(logDeleteResult?.affectedRows || 0)

      const [reviewDeleteResult] = await conn.query(
        `DELETE FROM demand_value_reviews
         WHERE id = ?
         LIMIT 1`,
        [normalizedReviewId],
      )
      if (Number(reviewDeleteResult?.affectedRows || 0) <= 0) {
        const error = new Error('复盘任务不存在')
        error.code = 'NOT_FOUND'
        throw error
      }

      await conn.commit()
      return {
        review_id: normalizedReviewId,
        demand_id: existing.demand_id || '',
        deleted_counts: {
          scores: deletedScoreCount,
          participants: deletedParticipantCount,
          logs: deletedLogCount,
          reviews: Number(reviewDeleteResult?.affectedRows || 0),
        },
      }
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  },

  async getReviewMapByDemandIds(demandIds = []) {
    await ensureTable()
    const normalizedDemandIds = Array.from(
      new Set((Array.isArray(demandIds) ? demandIds : []).map((item) => normalizeDemandId(item)).filter(Boolean)),
    )
    if (normalizedDemandIds.length === 0) return {}

    const placeholders = normalizedDemandIds.map(() => '?').join(', ')
    const [rows] = await pool.query(
      `SELECT id, demand_id, status, overall_score, updated_at
       FROM demand_value_reviews
       WHERE demand_id IN (${placeholders})`,
      normalizedDemandIds,
    )

    const reviewIds = rows.map((row) => Number(row.id || 0)).filter((id) => id > 0)
    const participantMap = {}
    if (reviewIds.length > 0) {
      const participantPlaceholders = reviewIds.map(() => '?').join(', ')
      const [participantRows] = await pool.query(
        `SELECT
           p.review_id,
           p.user_id,
           p.status,
           COALESCE(NULLIF(u.real_name, ''), u.username, CONCAT('用户#', p.user_id)) AS user_name
         FROM demand_value_review_participants p
         LEFT JOIN users u ON u.id = p.user_id
         WHERE p.review_id IN (${participantPlaceholders})
         ORDER BY p.id ASC`,
        reviewIds,
      )
      participantRows.forEach((row) => {
        const reviewId = Number(row.review_id || 0)
        if (!reviewId) return
        if (!Array.isArray(participantMap[reviewId])) participantMap[reviewId] = []
        participantMap[reviewId].push({
          user_id: Number(row.user_id || 0),
          user_name: row.user_name || '',
          status: normalizeParticipantStatus(row.status),
        })
      })
    }

    const map = {}
    rows.forEach((row) => {
      const demandId = normalizeDemandId(row.demand_id)
      if (!demandId) return
      const reviewId = Number(row.id || 0)
      map[demandId] = {
        id: reviewId,
        demand_id: demandId,
        status: normalizeReviewStatus(row.status),
        overall_score: row.overall_score === null || row.overall_score === undefined ? null : Number(row.overall_score),
        updated_at: formatDateTime(row.updated_at),
        participants: participantMap[reviewId] || [],
      }
    })
    return map
  },
}

module.exports = DemandValueReview
