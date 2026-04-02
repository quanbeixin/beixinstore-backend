const pool = require('../utils/db')

let ensureAgentTablesPromise = null
let areAgentTablesReady = false

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeText(value, maxLength = 0) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (maxLength > 0) return text.slice(0, maxLength)
  return text
}

function toNumberOrDefault(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizeAgentRow(row) {
  if (!row) return null
  return {
    id: toPositiveInt(row.id),
    agent_code: normalizeText(row.agent_code, 64).toUpperCase(),
    agent_name: normalizeText(row.agent_name, 128),
    business_purpose: normalizeText(row.business_purpose, 255),
    scene_code: normalizeText(row.scene_code, 64).toUpperCase(),
    description: normalizeText(row.description, 500),
    model: normalizeText(row.model, 64),
    system_prompt: String(row.system_prompt || ''),
    output_format_instruction: String(row.output_format_instruction || ''),
    temperature: Number(toNumberOrDefault(row.temperature, 0.7)),
    max_tokens: Number.isInteger(Number(row.max_tokens)) ? Number(row.max_tokens) : 2000,
    enabled: Number(row.enabled) === 1 ? 1 : 0,
    sort_order: Number.isInteger(Number(row.sort_order)) ? Number(row.sort_order) : 100,
    created_by: toPositiveInt(row.created_by),
    updated_by: toPositiveInt(row.updated_by),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    updated_by_name: normalizeText(row.updated_by_name, 120),
  }
}

async function ensureAgentTables() {
  if (areAgentTablesReady) return
  if (ensureAgentTablesPromise) return ensureAgentTablesPromise

  ensureAgentTablesPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_configs (
        id BIGINT NOT NULL AUTO_INCREMENT,
        agent_code VARCHAR(64) NOT NULL,
        agent_name VARCHAR(128) NOT NULL,
        business_purpose VARCHAR(255) NOT NULL,
        scene_code VARCHAR(64) NOT NULL,
        description VARCHAR(500) DEFAULT NULL,
        model VARCHAR(64) NOT NULL,
        system_prompt TEXT NOT NULL,
        output_format_instruction TEXT DEFAULT NULL,
        temperature DECIMAL(4,2) NOT NULL DEFAULT 0.70,
        max_tokens INT NOT NULL DEFAULT 2000,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 100,
        created_by BIGINT DEFAULT NULL,
        updated_by BIGINT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_agent_configs_code (agent_code),
        KEY idx_agent_configs_scene_enabled_sort (scene_code, enabled, sort_order),
        KEY idx_agent_configs_updated_by (updated_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS agent_execution_logs (
        id BIGINT NOT NULL AUTO_INCREMENT,
        scene_code VARCHAR(64) NOT NULL,
        agent_id BIGINT NOT NULL,
        triggered_by BIGINT NOT NULL,
        trigger_source VARCHAR(64) NOT NULL,
        request_payload_json JSON DEFAULT NULL,
        context_summary LONGTEXT DEFAULT NULL,
        response_text LONGTEXT DEFAULT NULL,
        status VARCHAR(32) NOT NULL,
        error_message TEXT DEFAULT NULL,
        started_at DATETIME NOT NULL,
        finished_at DATETIME DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_agent_execution_logs_scene (scene_code),
        KEY idx_agent_execution_logs_agent (agent_id),
        KEY idx_agent_execution_logs_user (triggered_by),
        KEY idx_agent_execution_logs_status (status),
        KEY idx_agent_execution_logs_started (started_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    areAgentTablesReady = true
  })()

  try {
    await ensureAgentTablesPromise
  } finally {
    ensureAgentTablesPromise = null
  }
}

function buildListWhere(filters = {}) {
  const clauses = []
  const params = []

  const sceneCode = normalizeText(filters.sceneCode, 64).toUpperCase()
  if (sceneCode) {
    clauses.push('a.scene_code = ?')
    params.push(sceneCode)
  }

  if (filters.enabled === 0 || filters.enabled === 1) {
    clauses.push('a.enabled = ?')
    params.push(Number(filters.enabled))
  }

  const keyword = normalizeText(filters.keyword, 120)
  if (keyword) {
    const like = `%${keyword}%`
    clauses.push('(a.agent_name LIKE ? OR a.agent_code LIKE ? OR a.business_purpose LIKE ?)')
    params.push(like, like, like)
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  }
}

const Agent = {
  async ensureAgentTables() {
    await ensureAgentTables()
  },

  async listAgents(filters = {}) {
    await ensureAgentTables()
    const { whereSql, params } = buildListWhere(filters)
    const [rows] = await pool.query(
      `SELECT
         a.*,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS updated_by_name
       FROM agent_configs a
       LEFT JOIN users u ON u.id = a.updated_by
       ${whereSql}
       ORDER BY a.enabled DESC, a.sort_order ASC, a.id DESC`,
      params,
    )
    return rows.map((row) => normalizeAgentRow(row))
  },

  async getAgentById(id) {
    await ensureAgentTables()
    const agentId = toPositiveInt(id)
    if (!agentId) return null
    const [rows] = await pool.query(
      `SELECT
         a.*,
         COALESCE(NULLIF(u.real_name, ''), u.username) AS updated_by_name
       FROM agent_configs a
       LEFT JOIN users u ON u.id = a.updated_by
       WHERE a.id = ?
       LIMIT 1`,
      [agentId],
    )
    return normalizeAgentRow(rows[0] || null)
  },

  async createAgent(payload = {}) {
    await ensureAgentTables()
    const [result] = await pool.query(
      `INSERT INTO agent_configs (
         agent_code,
         agent_name,
         business_purpose,
         scene_code,
         description,
         model,
         system_prompt,
         output_format_instruction,
         temperature,
         max_tokens,
         enabled,
         sort_order,
         created_by,
         updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizeText(payload.agent_code, 64).toUpperCase(),
        normalizeText(payload.agent_name, 128),
        normalizeText(payload.business_purpose, 255),
        normalizeText(payload.scene_code, 64).toUpperCase(),
        normalizeText(payload.description, 500) || null,
        normalizeText(payload.model, 64),
        String(payload.system_prompt || ''),
        normalizeText(payload.output_format_instruction) || null,
        toNumberOrDefault(payload.temperature, 0.7),
        Number.isInteger(Number(payload.max_tokens)) ? Number(payload.max_tokens) : 2000,
        Number(payload.enabled) === 1 ? 1 : 0,
        Number.isInteger(Number(payload.sort_order)) ? Number(payload.sort_order) : 100,
        toPositiveInt(payload.created_by),
        toPositiveInt(payload.updated_by),
      ],
    )
    return this.getAgentById(result.insertId)
  },

  async updateAgent(id, payload = {}) {
    await ensureAgentTables()
    const agentId = toPositiveInt(id)
    if (!agentId) return null
    await pool.query(
      `UPDATE agent_configs
       SET agent_code = ?,
           agent_name = ?,
           business_purpose = ?,
           scene_code = ?,
           description = ?,
           model = ?,
           system_prompt = ?,
           output_format_instruction = ?,
           temperature = ?,
           max_tokens = ?,
           enabled = ?,
           sort_order = ?,
           updated_by = ?
       WHERE id = ?`,
      [
        normalizeText(payload.agent_code, 64).toUpperCase(),
        normalizeText(payload.agent_name, 128),
        normalizeText(payload.business_purpose, 255),
        normalizeText(payload.scene_code, 64).toUpperCase(),
        normalizeText(payload.description, 500) || null,
        normalizeText(payload.model, 64),
        String(payload.system_prompt || ''),
        normalizeText(payload.output_format_instruction) || null,
        toNumberOrDefault(payload.temperature, 0.7),
        Number.isInteger(Number(payload.max_tokens)) ? Number(payload.max_tokens) : 2000,
        Number(payload.enabled) === 1 ? 1 : 0,
        Number.isInteger(Number(payload.sort_order)) ? Number(payload.sort_order) : 100,
        toPositiveInt(payload.updated_by),
        agentId,
      ],
    )
    return this.getAgentById(agentId)
  },

  async setAgentEnabled(id, enabled, updatedBy) {
    await ensureAgentTables()
    const agentId = toPositiveInt(id)
    if (!agentId) return null
    await pool.query(
      `UPDATE agent_configs
       SET enabled = ?, updated_by = ?
       WHERE id = ?`,
      [Number(enabled) === 1 ? 1 : 0, toPositiveInt(updatedBy), agentId],
    )
    return this.getAgentById(agentId)
  },

  async listAgentOptions(sceneCode = '') {
    await ensureAgentTables()
    const normalizedSceneCode = normalizeText(sceneCode, 64).toUpperCase()
    const clauses = ['a.enabled = 1']
    const params = []
    if (normalizedSceneCode) {
      clauses.push('a.scene_code = ?')
      params.push(normalizedSceneCode)
    }

    const [rows] = await pool.query(
      `SELECT
         a.id,
         a.agent_code,
         a.agent_name,
         a.business_purpose,
         a.scene_code
       FROM agent_configs a
       WHERE ${clauses.join(' AND ')}
       ORDER BY a.sort_order ASC, a.id DESC`,
      params,
    )
    return rows.map((row) => ({
      id: toPositiveInt(row.id),
      agent_code: normalizeText(row.agent_code, 64).toUpperCase(),
      agent_name: normalizeText(row.agent_name, 128),
      business_purpose: normalizeText(row.business_purpose, 255),
      scene_code: normalizeText(row.scene_code, 64).toUpperCase(),
    }))
  },

  async createExecutionLog(payload = {}) {
    await ensureAgentTables()
    const [result] = await pool.query(
      `INSERT INTO agent_execution_logs (
         scene_code,
         agent_id,
         triggered_by,
         trigger_source,
         request_payload_json,
         context_summary,
         status,
         started_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizeText(payload.scene_code, 64).toUpperCase(),
        toPositiveInt(payload.agent_id),
        toPositiveInt(payload.triggered_by),
        normalizeText(payload.trigger_source, 64) || 'MANUAL',
        payload.request_payload_json ? JSON.stringify(payload.request_payload_json) : null,
        String(payload.context_summary || ''),
        normalizeText(payload.status, 32) || 'RUNNING',
        payload.started_at || new Date(),
      ],
    )
    return toPositiveInt(result.insertId)
  },

  async finishExecutionLog(id, payload = {}) {
    await ensureAgentTables()
    const logId = toPositiveInt(id)
    if (!logId) return
    await pool.query(
      `UPDATE agent_execution_logs
       SET response_text = ?,
           status = ?,
           error_message = ?,
           finished_at = ?
       WHERE id = ?`,
      [
        payload.response_text === undefined ? null : String(payload.response_text || ''),
        normalizeText(payload.status, 32) || 'SUCCESS',
        payload.error_message ? String(payload.error_message) : null,
        payload.finished_at || new Date(),
        logId,
      ],
    )
  },
}

module.exports = Agent
