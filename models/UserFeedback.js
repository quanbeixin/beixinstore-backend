const pool = require('../utils/db')

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const DEFAULT_PROMPT_CONFIG = Object.freeze({
  systemPrompt:
    '你是一位专业且富有同理心的客服专员，擅长理解用户情绪、分析问题本质，并给出温暖、专业的回复。',
  knowledgeBase: '',
  categories: '会员订阅-未激活,会员订阅-取消订阅,会员订阅-要求退款,功能反馈-无法生成,功能反馈-无法打开,数据安全,封禁申诉,删除账户,登录账户',
  replyStyle:
    '语气亲切自然，像朋友聊天一样。表达同理心，理解用户的困扰。避免过于正式的套话，用简洁口语化表达。',
  limitations: '回复必须基于知识库内容，用户需求请尽量简练。',
})

let ensureTablesPromise = null
let tablesReady = false

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function toTinyBool(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 1 || value === '1' || value === 'true') return 1
  if (value === false || value === 0 || value === '0' || value === 'false') return 0
  return fallback
}

function normalizeText(value, maxLength = 0) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (maxLength > 0) return text.slice(0, maxLength)
  return text
}

function normalizeNullableText(value, maxLength = 0) {
  const text = normalizeText(value, maxLength)
  return text || null
}

function normalizeDateTime(value, fallback = null) {
  if (value === undefined) return fallback
  if (value === null || value === '') return null

  const text = String(value).trim()
  if (!text) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(text)) return `${text}:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(text)) return text

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return fallback

  const y = parsed.getFullYear()
  const m = String(parsed.getMonth() + 1).padStart(2, '0')
  const d = String(parsed.getDate()).padStart(2, '0')
  const hh = String(parsed.getHours()).padStart(2, '0')
  const mm = String(parsed.getMinutes()).padStart(2, '0')
  const ss = String(parsed.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
}

function escapeLike(value) {
  return String(value || '').trim().replace(/[\\%_]/g, '\\$&')
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase()
  return status === 'processed' ? 'processed' : 'pending'
}

function normalizeFeedbackRow(row) {
  if (!row) return null
  const aiPrimaryCategory =
    normalizeText(row.ai_primary_category, 100) ||
    normalizeText(row.ai_category, 100) ||
    null
  const aiSecondaryCategories = parseJsonArray(row.ai_secondary_categories)
  const aiAllCategoriesRaw = parseJsonArray(row.ai_all_categories)
  const aiAllCategories = aiAllCategoriesRaw.length > 0
    ? aiAllCategoriesRaw
    : normalizeStringList([aiPrimaryCategory, ...aiSecondaryCategories], 100)

  return {
    ...row,
    id: toPositiveInt(row.id),
    is_new_request: Number(row.is_new_request) === 1,
    ai_processed: Number(row.ai_processed) === 1,
    ai_category: aiPrimaryCategory,
    ai_primary_category: aiPrimaryCategory,
    ai_secondary_categories: aiSecondaryCategories,
    ai_all_categories: aiAllCategories,
  }
}

function normalizeStringList(value, maxItemLength = 100) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n，；;|]/)
      : []

  return [...new Set(
    list
      .map((item) => normalizeText(item, maxItemLength))
      .filter(Boolean),
  )]
}

function normalizeNullableJsonArray(value, maxItemLength = 100) {
  const list = normalizeStringList(value, maxItemLength)
  return list.length > 0 ? JSON.stringify(list) : null
}

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return normalizeStringList(value)
  }

  if (typeof value === 'string') {
    const text = normalizeText(value)
    if (!text) return []

    try {
      const parsed = JSON.parse(text)
      return normalizeStringList(parsed)
    } catch {
      return normalizeStringList(text)
    }
  }

  return []
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
  return Number(rows?.[0]?.total || 0) > 0
}

async function indexExists(tableName, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    [tableName, indexName],
  )
  return Number(rows?.[0]?.total || 0) > 0
}

function buildFilterClauses(filters = {}) {
  const clauses = []
  const params = []

  const searchText = normalizeText(filters.searchText, 120)
  if (searchText) {
    const like = `%${escapeLike(searchText)}%`
    clauses.push(
      `(
        user_email LIKE ? ESCAPE '\\\\'
        OR email_subject LIKE ? ESCAPE '\\\\'
        OR user_question LIKE ? ESCAPE '\\\\'
        OR user_question_cn LIKE ? ESCAPE '\\\\'
        OR ai_reply LIKE ? ESCAPE '\\\\'
        OR ai_reply_en LIKE ? ESCAPE '\\\\'
        OR product LIKE ? ESCAPE '\\\\'
        OR ai_category LIKE ? ESCAPE '\\\\'
        OR ai_primary_category LIKE ? ESCAPE '\\\\'
        OR CAST(ai_secondary_categories AS CHAR) LIKE ? ESCAPE '\\\\'
      )`,
    )
    params.push(like, like, like, like, like, like, like, like, like, like)
  }

  const product = normalizeText(filters.product, 100)
  if (product) {
    clauses.push('product = ?')
    params.push(product)
  }

  const status = normalizeText(filters.status, 32)
  if (status) {
    clauses.push('status = ?')
    params.push(normalizeStatus(status))
  }

  if (typeof filters.isNewRequest === 'boolean') {
    clauses.push('is_new_request = ?')
    params.push(filters.isNewRequest ? 1 : 0)
  }

  const aiCategory = normalizeText(filters.aiCategory, 100)
  if (aiCategory) {
    clauses.push(`(
      ai_category = ?
      OR ai_primary_category = ?
      OR JSON_SEARCH(ai_secondary_categories, 'one', ?) IS NOT NULL
      OR JSON_SEARCH(ai_all_categories, 'one', ?) IS NOT NULL
    )`)
    params.push(aiCategory, aiCategory, aiCategory, aiCategory)
  }

  const dateStart = normalizeDateTime(filters.dateStart)
  if (dateStart) {
    clauses.push('`date` >= ?')
    params.push(dateStart)
  }

  const dateEnd = normalizeDateTime(filters.dateEnd)
  if (dateEnd) {
    clauses.push('`date` <= ?')
    params.push(dateEnd)
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  return { whereSql, params }
}

function normalizePromptConfig(value = {}) {
  const next = {
    ...DEFAULT_PROMPT_CONFIG,
    ...(value && typeof value === 'object' ? value : {}),
  }

  return {
    systemPrompt: normalizeText(next.systemPrompt) || DEFAULT_PROMPT_CONFIG.systemPrompt,
    knowledgeBase: normalizeText(next.knowledgeBase),
    categories: normalizeText(next.categories) || DEFAULT_PROMPT_CONFIG.categories,
    replyStyle: normalizeText(next.replyStyle) || DEFAULT_PROMPT_CONFIG.replyStyle,
    limitations: normalizeText(next.limitations) || DEFAULT_PROMPT_CONFIG.limitations,
  }
}

async function ensureTables() {
  if (tablesReady) return
  if (ensureTablesPromise) return ensureTablesPromise

  ensureTablesPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_feedback (
        id BIGINT NOT NULL AUTO_INCREMENT,
        \`date\` DATETIME NULL,
        user_email VARCHAR(255) NOT NULL DEFAULT '',
        email_subject VARCHAR(255) NULL,
        product VARCHAR(100) NOT NULL DEFAULT '未指定',
        channel VARCHAR(100) NOT NULL DEFAULT '其他',
        user_question TEXT NOT NULL,
        user_question_cn TEXT NULL,
        issue_type VARCHAR(100) NULL,
        user_request VARCHAR(255) NULL,
        is_new_request TINYINT(1) NOT NULL DEFAULT 0,
        ai_category VARCHAR(100) NULL,
        ai_primary_category VARCHAR(100) NULL,
        ai_secondary_categories JSON NULL,
        ai_all_categories JSON NULL,
        ai_sentiment VARCHAR(32) NULL,
        ai_reply TEXT NULL,
        ai_reply_en TEXT NULL,
        support_reply TEXT NULL,
        support_reply_en TEXT NULL,
        ai_processed TINYINT(1) NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        created_by BIGINT NULL,
        updated_by BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_user_feedback_date (\`date\`),
        KEY idx_user_feedback_status (status),
        KEY idx_user_feedback_product (product),
        KEY idx_user_feedback_ai_processed (ai_processed),
        KEY idx_user_feedback_ai_primary_category (ai_primary_category),
        KEY idx_user_feedback_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    const alterStatements = [
      [
        'email_subject',
        'ALTER TABLE user_feedback ADD COLUMN email_subject VARCHAR(255) NULL AFTER user_email',
      ],
      [
        'ai_primary_category',
        'ALTER TABLE user_feedback ADD COLUMN ai_primary_category VARCHAR(100) NULL AFTER ai_category',
      ],
      [
        'ai_secondary_categories',
        'ALTER TABLE user_feedback ADD COLUMN ai_secondary_categories JSON NULL AFTER ai_primary_category',
      ],
      [
        'ai_all_categories',
        'ALTER TABLE user_feedback ADD COLUMN ai_all_categories JSON NULL AFTER ai_secondary_categories',
      ],
    ]

    for (const [columnName, sql] of alterStatements) {
      if (!(await columnExists('user_feedback', columnName))) {
        await pool.query(sql)
      }
    }

    if (!(await indexExists('user_feedback', 'idx_user_feedback_ai_primary_category'))) {
      await pool.query('CREATE INDEX idx_user_feedback_ai_primary_category ON user_feedback(ai_primary_category)')
    }

    await pool.query(
      `UPDATE user_feedback
       SET ai_primary_category = ai_category
       WHERE (ai_primary_category IS NULL OR ai_primary_category = '')
         AND ai_category IS NOT NULL
         AND ai_category <> ''`,
    )

    await pool.query(
      `UPDATE user_feedback
       SET ai_all_categories = JSON_ARRAY(ai_primary_category)
       WHERE ai_all_categories IS NULL
         AND ai_primary_category IS NOT NULL
         AND ai_primary_category <> ''`,
    )

    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback_ai_prompt_configs (
        id BIGINT NOT NULL AUTO_INCREMENT,
        config_key VARCHAR(64) NOT NULL,
        config_value_json JSON NOT NULL,
        updated_by BIGINT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_feedback_ai_prompt_configs_key (config_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)

    tablesReady = true
  })().finally(() => {
    ensureTablesPromise = null
  })

  return ensureTablesPromise
}

const UserFeedback = {
  DEFAULT_PROMPT_CONFIG,

  async ensureTables() {
    await ensureTables()
  },

  async listFeedback({
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
    filters = {},
  } = {}) {
    await ensureTables()

    const normalizedPage = Math.max(toPositiveInt(page) || 1, 1)
    const normalizedPageSize = Math.min(
      Math.max(toPositiveInt(pageSize) || DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE,
    )
    const offset = (normalizedPage - 1) * normalizedPageSize

    const { whereSql, params } = buildFilterClauses(filters)

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM user_feedback ${whereSql}`,
      params,
    )
    const total = Number(countRows?.[0]?.total) || 0

    const [rows] = await pool.query(
      `SELECT
         id,
         \`date\`,
         user_email,
         email_subject,
         product,
         channel,
         user_question,
         user_question_cn,
         issue_type,
         user_request,
         is_new_request,
         ai_category,
         ai_primary_category,
         ai_secondary_categories,
         ai_all_categories,
         ai_sentiment,
         ai_reply,
         ai_reply_en,
         support_reply,
         support_reply_en,
         ai_processed,
         status,
         created_by,
         updated_by,
         created_at,
         updated_at
       FROM user_feedback
       ${whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, normalizedPageSize, offset],
    )

    return {
      rows: rows.map(normalizeFeedbackRow),
      pagination: {
        total,
        page: normalizedPage,
        pageSize: normalizedPageSize,
      },
    }
  },

  async listAllFeedback(filters = {}) {
    await ensureTables()
    const { whereSql, params } = buildFilterClauses(filters)
    const [rows] = await pool.query(
      `SELECT
         id,
         \`date\`,
         user_email,
         email_subject,
         product,
         channel,
         user_question,
         user_question_cn,
         issue_type,
         user_request,
         is_new_request,
         ai_category,
         ai_primary_category,
         ai_secondary_categories,
         ai_all_categories,
         ai_sentiment,
         ai_reply,
         ai_reply_en,
         support_reply,
         support_reply_en,
         ai_processed,
         status,
         created_by,
         updated_by,
         created_at,
         updated_at
       FROM user_feedback
       ${whereSql}
       ORDER BY created_at DESC, id DESC`,
      params,
    )

    return rows.map(normalizeFeedbackRow)
  },

  async getById(id) {
    await ensureTables()
    const feedbackId = toPositiveInt(id)
    if (!feedbackId) return null

    const [rows] = await pool.query(
      `SELECT
         id,
         \`date\`,
         user_email,
         email_subject,
         product,
         channel,
         user_question,
         user_question_cn,
         issue_type,
         user_request,
         is_new_request,
         ai_category,
         ai_primary_category,
         ai_secondary_categories,
         ai_all_categories,
         ai_sentiment,
         ai_reply,
         ai_reply_en,
         support_reply,
         support_reply_en,
         ai_processed,
         status,
         created_by,
         updated_by,
         created_at,
         updated_at
       FROM user_feedback
       WHERE id = ?
       LIMIT 1`,
      [feedbackId],
    )

    return normalizeFeedbackRow(rows[0] || null)
  },

  async create(payload = {}, options = {}) {
    await ensureTables()

    const operatorUserId = toPositiveInt(options.operatorUserId)
    const normalizedPrimaryCategory =
      normalizeNullableText(payload.ai_primary_category, 100) ||
      normalizeNullableText(payload.ai_category, 100)
    const normalizedSecondaryCategories = normalizeNullableJsonArray(payload.ai_secondary_categories, 100)
    const normalizedAllCategories =
      normalizeNullableJsonArray(payload.ai_all_categories, 100) ||
      normalizeNullableJsonArray(
        [
          normalizedPrimaryCategory,
          ...normalizeStringList(payload.ai_secondary_categories, 100),
        ],
        100,
      )
    const feedback = {
      date: normalizeDateTime(payload.date, normalizeDateTime(new Date().toISOString())),
      user_email: normalizeText(payload.user_email, 255) || 'anonymous@form.com',
      email_subject: normalizeNullableText(payload.email_subject, 255),
      product: normalizeText(payload.product, 100) || '未指定',
      channel: normalizeText(payload.channel, 100) || '其他',
      user_question: normalizeText(payload.user_question),
      user_question_cn: normalizeNullableText(payload.user_question_cn),
      issue_type: normalizeNullableText(payload.issue_type, 100) || '待分类',
      user_request: normalizeNullableText(payload.user_request, 255),
      is_new_request: toTinyBool(payload.is_new_request, 0),
      ai_category: normalizedPrimaryCategory,
      ai_primary_category: normalizedPrimaryCategory,
      ai_secondary_categories: normalizedSecondaryCategories,
      ai_all_categories: normalizedAllCategories,
      ai_sentiment: normalizeNullableText(payload.ai_sentiment, 32),
      ai_reply: normalizeNullableText(payload.ai_reply),
      ai_reply_en: normalizeNullableText(payload.ai_reply_en),
      support_reply: normalizeNullableText(payload.support_reply),
      support_reply_en: normalizeNullableText(payload.support_reply_en),
      ai_processed: toTinyBool(payload.ai_processed, 0),
      status: normalizeStatus(payload.status),
      created_by: operatorUserId,
      updated_by: operatorUserId,
    }

    if (!feedback.user_question) {
      const error = new Error('缺少必填字段：user_question')
      error.code = 'INVALID_PAYLOAD'
      throw error
    }

    const [result] = await pool.query(
      `INSERT INTO user_feedback (
         \`date\`,
         user_email,
         email_subject,
         product,
         channel,
         user_question,
         user_question_cn,
         issue_type,
         user_request,
         is_new_request,
         ai_category,
         ai_primary_category,
         ai_secondary_categories,
         ai_all_categories,
         ai_sentiment,
         ai_reply,
         ai_reply_en,
         support_reply,
         support_reply_en,
         ai_processed,
         status,
         created_by,
         updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        feedback.date,
        feedback.user_email,
        feedback.email_subject,
        feedback.product,
        feedback.channel,
        feedback.user_question,
        feedback.user_question_cn,
        feedback.issue_type,
        feedback.user_request,
        feedback.is_new_request,
        feedback.ai_category,
        feedback.ai_primary_category,
        feedback.ai_secondary_categories,
        feedback.ai_all_categories,
        feedback.ai_sentiment,
        feedback.ai_reply,
        feedback.ai_reply_en,
        feedback.support_reply,
        feedback.support_reply_en,
        feedback.ai_processed,
        feedback.status,
        feedback.created_by,
        feedback.updated_by,
      ],
    )

    return this.getById(result.insertId)
  },

  async update(id, payload = {}, options = {}) {
    await ensureTables()

    const feedbackId = toPositiveInt(id)
    if (!feedbackId) return null

    const operatorUserId = toPositiveInt(options.operatorUserId)
    const updates = []
    const params = []
    const hasAiPrimaryCategory = Object.prototype.hasOwnProperty.call(payload, 'ai_primary_category')
    const hasAiCategory = Object.prototype.hasOwnProperty.call(payload, 'ai_category')
    const hasAiSecondaryCategories = Object.prototype.hasOwnProperty.call(payload, 'ai_secondary_categories')
    const hasAiAllCategories = Object.prototype.hasOwnProperty.call(payload, 'ai_all_categories')
    const shouldUpdatePrimaryCategory = hasAiPrimaryCategory || hasAiCategory
    const normalizedPrimaryCategory =
      normalizeNullableText(
        hasAiPrimaryCategory ? payload.ai_primary_category : payload.ai_category,
        100,
      ) ||
      normalizeNullableText(
        hasAiCategory ? payload.ai_category : payload.ai_primary_category,
        100,
      )
    const normalizedSecondaryCategories = normalizeNullableJsonArray(payload.ai_secondary_categories, 100)
    const normalizedAllCategories =
      normalizeNullableJsonArray(payload.ai_all_categories, 100) ||
      normalizeNullableJsonArray(
        [
          normalizedPrimaryCategory,
          ...normalizeStringList(payload.ai_secondary_categories, 100),
        ],
        100,
      )

    if (Object.prototype.hasOwnProperty.call(payload, 'date')) {
      updates.push('`date` = ?')
      params.push(normalizeDateTime(payload.date, null))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'user_email')) {
      updates.push('user_email = ?')
      params.push(normalizeText(payload.user_email, 255))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'email_subject')) {
      updates.push('email_subject = ?')
      params.push(normalizeNullableText(payload.email_subject, 255))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'product')) {
      updates.push('product = ?')
      params.push(normalizeText(payload.product, 100))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'channel')) {
      updates.push('channel = ?')
      params.push(normalizeText(payload.channel, 100))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'user_question')) {
      updates.push('user_question = ?')
      params.push(normalizeText(payload.user_question))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'user_question_cn')) {
      updates.push('user_question_cn = ?')
      params.push(normalizeNullableText(payload.user_question_cn))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'issue_type')) {
      updates.push('issue_type = ?')
      params.push(normalizeNullableText(payload.issue_type, 100))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'user_request')) {
      updates.push('user_request = ?')
      params.push(normalizeNullableText(payload.user_request, 255))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'is_new_request')) {
      updates.push('is_new_request = ?')
      params.push(toTinyBool(payload.is_new_request, 0))
    }
    if (shouldUpdatePrimaryCategory) {
      updates.push('ai_category = ?')
      params.push(normalizedPrimaryCategory)
      updates.push('ai_primary_category = ?')
      params.push(normalizedPrimaryCategory)
    }
    if (hasAiSecondaryCategories) {
      updates.push('ai_secondary_categories = ?')
      params.push(normalizedSecondaryCategories)
    }
    if (hasAiAllCategories || shouldUpdatePrimaryCategory) {
      updates.push('ai_all_categories = ?')
      params.push(normalizedAllCategories)
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'ai_sentiment')) {
      updates.push('ai_sentiment = ?')
      params.push(normalizeNullableText(payload.ai_sentiment, 32))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'ai_reply')) {
      updates.push('ai_reply = ?')
      params.push(normalizeNullableText(payload.ai_reply))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'ai_reply_en')) {
      updates.push('ai_reply_en = ?')
      params.push(normalizeNullableText(payload.ai_reply_en))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'support_reply')) {
      updates.push('support_reply = ?')
      params.push(normalizeNullableText(payload.support_reply))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'support_reply_en')) {
      updates.push('support_reply_en = ?')
      params.push(normalizeNullableText(payload.support_reply_en))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'ai_processed')) {
      updates.push('ai_processed = ?')
      params.push(toTinyBool(payload.ai_processed, 0))
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
      updates.push('status = ?')
      params.push(normalizeStatus(payload.status))
    }

    updates.push('updated_by = ?')
    params.push(operatorUserId)

    if (updates.length === 0) {
      return this.getById(feedbackId)
    }

    params.push(feedbackId)

    await pool.query(
      `UPDATE user_feedback SET ${updates.join(', ')} WHERE id = ?`,
      params,
    )

    return this.getById(feedbackId)
  },

  async remove(id) {
    await ensureTables()
    const feedbackId = toPositiveInt(id)
    if (!feedbackId) return 0

    const [result] = await pool.query('DELETE FROM user_feedback WHERE id = ?', [feedbackId])
    return result.affectedRows || 0
  },

  async updateStatus(id, status, options = {}) {
    await ensureTables()
    const feedbackId = toPositiveInt(id)
    if (!feedbackId) return null

    const operatorUserId = toPositiveInt(options.operatorUserId)
    await pool.query(
      `UPDATE user_feedback
       SET status = ?, updated_by = ?
       WHERE id = ?`,
      [normalizeStatus(status), operatorUserId, feedbackId],
    )

    return this.getById(feedbackId)
  },

  async batchUpdateStatus(ids = [], status, options = {}) {
    await ensureTables()

    const normalizedIds = [...new Set((Array.isArray(ids) ? ids : [])
      .map((item) => toPositiveInt(item))
      .filter(Boolean))]

    if (normalizedIds.length === 0) {
      return []
    }

    const operatorUserId = toPositiveInt(options.operatorUserId)
    const placeholders = normalizedIds.map(() => '?').join(', ')
    await pool.query(
      `UPDATE user_feedback
       SET status = ?, updated_by = ?
       WHERE id IN (${placeholders})`,
      [normalizeStatus(status), operatorUserId, ...normalizedIds],
    )

    const [rows] = await pool.query(
      `SELECT
         id,
         \`date\`,
         user_email,
         email_subject,
         product,
         channel,
         user_question,
         user_question_cn,
         issue_type,
         user_request,
         is_new_request,
         ai_category,
         ai_primary_category,
         ai_secondary_categories,
         ai_all_categories,
         ai_sentiment,
         ai_reply,
         ai_reply_en,
         support_reply,
         support_reply_en,
         ai_processed,
         status,
         created_by,
         updated_by,
         created_at,
         updated_at
       FROM user_feedback
       WHERE id IN (${placeholders})
       ORDER BY id DESC`,
      normalizedIds,
    )

    return rows.map(normalizeFeedbackRow)
  },

  async batchImport(list = [], options = {}) {
    await ensureTables()

    const rows = Array.isArray(list) ? list : []
    if (rows.length === 0) {
      const error = new Error('导入数据不能为空')
      error.code = 'INVALID_PAYLOAD'
      throw error
    }

    const operatorUserId = toPositiveInt(options.operatorUserId)

    const values = []
    const placeholders = []

    rows.forEach((item) => {
      const userQuestion = normalizeText(item?.user_question)
      if (!userQuestion) {
        return
      }

      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      const normalizedPrimaryCategory =
        normalizeNullableText(item?.ai_primary_category, 100) ||
        normalizeNullableText(item?.ai_category, 100)
      const normalizedSecondaryCategories = normalizeNullableJsonArray(item?.ai_secondary_categories, 100)
      const normalizedAllCategories =
        normalizeNullableJsonArray(item?.ai_all_categories, 100) ||
        normalizeNullableJsonArray(
          [
            normalizedPrimaryCategory,
            ...normalizeStringList(item?.ai_secondary_categories, 100),
          ],
          100,
        )
      values.push(
        normalizeDateTime(item?.date, normalizeDateTime(new Date().toISOString())),
        normalizeText(item?.user_email, 255) || 'anonymous@form.com',
        normalizeNullableText(item?.email_subject, 255),
        normalizeText(item?.product, 100) || '未指定',
        normalizeText(item?.channel, 100) || '其他',
        userQuestion,
        normalizeNullableText(item?.user_question_cn),
        normalizeNullableText(item?.issue_type, 100) || '待分类',
        normalizeNullableText(item?.user_request, 255),
        toTinyBool(item?.is_new_request, 0),
        normalizedPrimaryCategory,
        normalizedPrimaryCategory,
        normalizedSecondaryCategories,
        normalizedAllCategories,
        normalizeNullableText(item?.ai_sentiment, 32),
        normalizeNullableText(item?.ai_reply),
        normalizeNullableText(item?.ai_reply_en),
        normalizeNullableText(item?.support_reply),
        normalizeNullableText(item?.support_reply_en),
        toTinyBool(item?.ai_processed, 0),
        normalizeStatus(item?.status),
        operatorUserId,
        operatorUserId,
      )
    })

    if (placeholders.length === 0) {
      const error = new Error('导入数据缺少有效的 user_question')
      error.code = 'INVALID_PAYLOAD'
      throw error
    }

    const [result] = await pool.query(
      `INSERT INTO user_feedback (
         \`date\`,
         user_email,
         email_subject,
         product,
         channel,
         user_question,
         user_question_cn,
         issue_type,
         user_request,
         is_new_request,
         ai_category,
         ai_primary_category,
         ai_secondary_categories,
         ai_all_categories,
         ai_sentiment,
         ai_reply,
         ai_reply_en,
         support_reply,
         support_reply_en,
         ai_processed,
         status,
         created_by,
         updated_by
       ) VALUES ${placeholders.join(', ')}`,
      values,
    )

    const firstId = toPositiveInt(result.insertId) || 0
    const insertedCount = Number(result.affectedRows) || 0
    if (insertedCount <= 0 || firstId <= 0) return []

    const lastId = firstId + insertedCount - 1
    const [insertedRows] = await pool.query(
      `SELECT
         id,
         \`date\`,
         user_email,
         email_subject,
         product,
         channel,
         user_question,
         user_question_cn,
         issue_type,
         user_request,
         is_new_request,
         ai_category,
         ai_primary_category,
         ai_secondary_categories,
         ai_all_categories,
         ai_sentiment,
         ai_reply,
         ai_reply_en,
         support_reply,
         support_reply_en,
         ai_processed,
         status,
         created_by,
         updated_by,
         created_at,
         updated_at
       FROM user_feedback
       WHERE id BETWEEN ? AND ?
       ORDER BY id DESC`,
      [firstId, lastId],
    )

    return insertedRows.map(normalizeFeedbackRow)
  },

  async listUnprocessed(limit = 10) {
    await ensureTables()

    const normalizedLimit = Math.min(Math.max(toPositiveInt(limit) || 10, 1), 100)
    const [rows] = await pool.query(
      `SELECT
         id,
         \`date\`,
         user_email,
         email_subject,
         product,
         channel,
         user_question,
         user_question_cn,
         issue_type,
         user_request,
         is_new_request,
         ai_category,
         ai_primary_category,
         ai_secondary_categories,
         ai_all_categories,
         ai_sentiment,
         ai_reply,
         ai_reply_en,
         support_reply,
         support_reply_en,
         ai_processed,
         status,
         created_by,
         updated_by,
         created_at,
         updated_at
       FROM user_feedback
       WHERE ai_processed = 0 OR ai_processed IS NULL
       ORDER BY created_at ASC, id ASC
       LIMIT ?`,
      [normalizedLimit],
    )

    return rows.map(normalizeFeedbackRow)
  },

  async markAnalysis(id, analysis = {}, options = {}) {
    await ensureTables()

    const feedbackId = toPositiveInt(id)
    if (!feedbackId) return null

    const operatorUserId = toPositiveInt(options.operatorUserId)

    await pool.query(
      `UPDATE user_feedback
       SET ai_category = ?,
           ai_primary_category = ?,
           ai_secondary_categories = ?,
           ai_all_categories = ?,
           ai_sentiment = ?,
           ai_reply = ?,
           ai_reply_en = ?,
           user_request = ?,
           is_new_request = ?,
           user_question_cn = ?,
           ai_processed = 1,
           updated_by = ?
       WHERE id = ?`,
      [
        normalizeNullableText(analysis.ai_category, 100),
        normalizeNullableText(analysis.ai_primary_category, 100) || normalizeNullableText(analysis.ai_category, 100),
        normalizeNullableJsonArray(analysis.ai_secondary_categories, 100),
        normalizeNullableJsonArray(
          analysis.ai_all_categories,
          100,
        ) || normalizeNullableJsonArray([
          normalizeNullableText(analysis.ai_primary_category, 100) || normalizeNullableText(analysis.ai_category, 100),
          ...normalizeStringList(analysis.ai_secondary_categories, 100),
        ], 100),
        normalizeNullableText(analysis.ai_sentiment, 32),
        normalizeNullableText(analysis.ai_reply),
        normalizeNullableText(analysis.ai_reply_en),
        normalizeNullableText(analysis.user_request, 255),
        toTinyBool(analysis.is_new_request, 0),
        normalizeNullableText(analysis.user_question_cn),
        operatorUserId,
        feedbackId,
      ],
    )

    return this.getById(feedbackId)
  },

  async getPromptConfig() {
    await ensureTables()
    const [rows] = await pool.query(
      `SELECT config_value_json
       FROM feedback_ai_prompt_configs
       WHERE config_key = 'prompt'
       LIMIT 1`,
    )

    const raw = rows?.[0]?.config_value_json
    if (!raw) {
      return normalizePromptConfig()
    }

    if (typeof raw === 'object' && raw !== null) {
      return normalizePromptConfig(raw)
    }

    try {
      return normalizePromptConfig(JSON.parse(String(raw)))
    } catch {
      return normalizePromptConfig()
    }
  },

  async updatePromptConfig(configValue = {}, options = {}) {
    await ensureTables()

    const normalized = normalizePromptConfig(configValue)
    const operatorUserId = toPositiveInt(options.operatorUserId)

    await pool.query(
      `INSERT INTO feedback_ai_prompt_configs (config_key, config_value_json, updated_by)
       VALUES ('prompt', CAST(? AS JSON), ?)
       ON DUPLICATE KEY UPDATE
         config_value_json = VALUES(config_value_json),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(normalized), operatorUserId],
    )

    return this.getPromptConfig()
  },
}

module.exports = UserFeedback
