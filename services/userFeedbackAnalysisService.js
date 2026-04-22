const UserFeedback = require('../models/UserFeedback')
const { callChatCompletion } = require('./aiClientService')

let configCache = null
const REFUND_INTENT_KEYWORDS = [
  'refund',
  'refunding',
  'reimbursement',
  'money back',
  'chargeback',
  '申请退款',
  '要求退款',
  '退款',
  '退费',
]
const CANCEL_INTENT_KEYWORDS = [
  'cancel subscription',
  'subscription cancel',
  'cancel my subscription',
  'unsubscribe',
  '取消订阅',
  '停止订阅',
  '关闭自动续费',
]

function normalizeText(value, maxLength = 0) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (maxLength > 0) return text.slice(0, maxLength)
  return text
}

function buildFeedbackQuestionText(feedback, { labeled = false } = {}) {
  const subject = normalizeText(feedback?.email_subject)
  const question = normalizeText(feedback?.user_question)

  if (subject && question) {
    return labeled
      ? `邮件标题：${subject}\n邮件正文：${question}`
      : `${subject}\n${question}`
  }
  if (subject) {
    return labeled ? `邮件标题：${subject}` : subject
  }
  if (question) {
    return labeled ? `邮件正文：${question}` : question
  }
  return ''
}

function hasAiCapability() {
  return Boolean(
    normalizeText(process.env.FEEDBACK_AI_API_KEY) ||
      normalizeText(process.env.AGENT_AI_API_KEY) ||
      normalizeText(process.env.OPENAI_API_KEY) ||
      normalizeText(process.env.DEEPSEEK_API_KEY),
  )
}

function parseCategories(categoriesText) {
  const rawLines = String(categoriesText || '')
    .split(/\n+/)
    .map((item) => normalizeText(item, 500))
    .filter(Boolean)

  const categoryLines = []
  let started = false
  for (const line of rawLines) {
    if (/^【/.test(line)) {
      if (started) break
      continue
    }
    started = true
    categoryLines.push(line)
  }

  const sourceText = categoryLines.length > 0 ? categoryLines.join('\n') : String(categoriesText || '')

  return sourceText
    .split(/[,\n，；;|]/)
    .map((item) => normalizeText(item, 200))
    .map((item) => {
      if (!item) return ''
      const stripped = item.replace(/^[-*.\d)(、\s]+/, '')
      const parts = stripped.split(/[：:]/).map((part) => normalizeText(part, 100))
      const candidate = parts.length > 1 ? parts[parts.length - 1] : stripped
      return normalizeText(candidate, 100)
    })
    .filter((item) => {
      if (!item) return false
      if (/(优先从以下选择|以下分类|请从以下|问题分类|如果.*新增)/.test(item)) return false
      if (item.length > 28 && /(优先|以下|选择|分类|新增|请)/.test(item)) return false
      return true
    })
    .map((item) => normalizeText(item, 100))
    .filter(Boolean)
}

function normalizeSentiment(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'positive') return 'Positive'
  if (normalized === 'negative') return 'Negative'
  return 'Neutral'
}

function sanitizeCategory(inputCategory, categoryOptions) {
  const normalized = normalizeText(inputCategory, 100)
  if (!normalized) {
    return categoryOptions[0] || '咨询'
  }

  const lower = normalized.toLowerCase()
  if (hasIntentKeyword(lower, REFUND_INTENT_KEYWORDS)) {
    return getRefundCategory(categoryOptions) || normalized
  }
  if (hasIntentKeyword(lower, CANCEL_INTENT_KEYWORDS)) {
    return getCancelCategory(categoryOptions) || normalized
  }
  if (/(ban appeal|appeal|banned|封禁|申诉)/.test(lower)) {
    return findCategoryByKeywords(categoryOptions, ['封禁', '申诉', '投诉']) || normalized
  }
  if (/(login|sign in|log in|登录|账号)/.test(lower)) {
    return findCategoryByKeywords(categoryOptions, ['登录', '账户', '账号']) || normalized
  }

  const exact = categoryOptions.find(
    (item) => item.toLowerCase() === normalized.toLowerCase(),
  )
  if (exact) return exact

  const fuzzy = categoryOptions.find(
    (item) => normalized.includes(item) || item.includes(normalized),
  )
  if (fuzzy) return fuzzy

  if (normalized.length > 28 && /(优先|以下|选择|分类|新增|请)/.test(normalized)) {
    return categoryOptions[0] || '咨询'
  }

  return normalized
}

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  if (value === false || value === 0 || value === '0' || value === 'false') return false
  return fallback
}

function normalizeCategoryList(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n，；;|]/)
      : []

  return [...new Set(source.map((item) => normalizeText(item, 100)).filter(Boolean))]
}

function extractJsonObject(rawText) {
  const text = String(rawText || '').trim()
  if (!text) return null

  const candidates = []
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) {
    candidates.push(String(fencedMatch[1]).trim())
  }

  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch?.[0]) {
    candidates.push(String(objectMatch[0]).trim())
  }

  if (candidates.length === 0) {
    candidates.push(text)
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // try next candidate
    }
  }

  return null
}

function summarizeRequest(text) {
  const cleaned = normalizeText(text)
  if (!cleaned) return ''

  const lower = cleaned.toLowerCase()
  if (/(refund|refunding|reimbursement|money back|chargeback|cancel subscription|subscription cancel|取消订阅|申请退款|要求退款|退款)/.test(lower)) {
    return '用户希望退款或取消订阅'
  }
  if (/(ban appeal|appeal|banned|suspend|suspended|封禁|申诉|解封)/.test(lower)) {
    return '用户发起封禁申诉'
  }
  if (/(login|sign in|log in|登录|账号无法登录|无法登录)/.test(lower)) {
    return '用户反馈登录或账号访问问题'
  }

  const firstSentence = cleaned.split(/[。！？.!?\n]/)[0]
  const target = normalizeText(firstSentence)
  if (!target) return cleaned.slice(0, 24)

  return target.length > 24 ? `${target.slice(0, 24)}...` : target
}

function hasIntentKeyword(text, keywords = []) {
  const source = String(text || '').toLowerCase()
  if (!source) return false
  return keywords.some((keyword) => source.includes(String(keyword || '').toLowerCase()))
}

function findCategoryByKeywords(categoryOptions, keywords = []) {
  if (!Array.isArray(categoryOptions) || categoryOptions.length === 0) return ''
  const normalizedKeywords = keywords
    .map((item) => normalizeText(item, 50).toLowerCase())
    .filter(Boolean)

  if (normalizedKeywords.length === 0) return ''

  const exact = categoryOptions.find((item) => {
    const label = normalizeText(item, 100).toLowerCase()
    return normalizedKeywords.some((keyword) => label.includes(keyword))
  })
  return exact || ''
}

function getRefundCategory(categoryOptions) {
  return (
    findCategoryByKeywords(categoryOptions, ['要求退款', '退款', '退费']) ||
    findCategoryByKeywords(categoryOptions, ['投诉', '申诉']) ||
    '退款'
  )
}

function getCancelCategory(categoryOptions) {
  return (
    findCategoryByKeywords(categoryOptions, ['取消订阅']) ||
    '取消订阅'
  )
}

function looksLikeEnglish(text) {
  const raw = String(text || '')
  if (!raw) return false

  const letters = (raw.match(/[A-Za-z]/g) || []).length
  const chinese = (raw.match(/[\u4e00-\u9fa5]/g) || []).length
  return letters > 0 && letters >= chinese * 2
}

function hasChineseChars(text) {
  return /[\u4e00-\u9fa5]/.test(String(text || ''))
}

function isMostlyChinese(text) {
  const raw = String(text || '')
  if (!raw) return false

  const letters = (raw.match(/[A-Za-z]/g) || []).length
  const chinese = (raw.match(/[\u4e00-\u9fa5]/g) || []).length
  return chinese > 0 && chinese >= letters
}

function needsChineseTranslation(sourceText, translatedText) {
  const source = normalizeText(sourceText)
  if (!source) return false
  if (isMostlyChinese(source)) return false

  const translated = normalizeText(translatedText)
  if (!translated) return true
  if (translated === source) return true
  if (!hasChineseChars(translated)) return true
  return false
}

function needsEnglishTranslation(sourceText, translatedText) {
  const source = normalizeText(sourceText)
  if (!source) return false
  if (looksLikeEnglish(source) && !isMostlyChinese(source)) return false

  const translated = extractPlainAiText(translatedText)
  if (!translated) return true
  if (translated === source) return true
  if (!looksLikeEnglish(translated)) return true
  return false
}

function extractPlainAiText(rawText) {
  const text = normalizeText(rawText)
  if (!text) return ''

  return normalizeText(
    text
      .replace(/^```[\w-]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .replace(/^["“”']+/, '')
      .replace(/["“”']+$/, ''),
  )
}

async function translateToChinese(text) {
  const source = normalizeText(text)
  if (!source) return ''
  if (isMostlyChinese(source)) return source
  if (!hasAiCapability()) return ''

  try {
    const response = await callFeedbackAi({
      systemPrompt:
        '你是专业翻译助手。请把用户原文准确翻译成简体中文，仅输出翻译文本，不要任何解释或 JSON。',
      userPrompt: `请翻译为简体中文：\n${source}`,
      temperature: 0.1,
      maxTokens: 600,
    })

    return extractPlainAiText(response?.content)
  } catch (error) {
    console.warn('用户问题翻译失败，保留原文:', error?.message || error)
    return ''
  }
}

async function translateToEnglish(text) {
  const source = normalizeText(text)
  if (!source) return ''
  if (looksLikeEnglish(source) && !isMostlyChinese(source)) return source
  if (!hasAiCapability()) return ''

  try {
    const response = await callFeedbackAi({
      systemPrompt:
        'You are a professional translator. Translate the given text into natural, fluent English. Only output the English translation, without explanations or JSON.',
      userPrompt: `Please translate into English:\n${source}`,
      temperature: 0.1,
      maxTokens: 800,
    })

    return extractPlainAiText(response?.content)
  } catch (error) {
    console.warn('AI 回复英文翻译失败，保留候选文案:', error?.message || error)
    return ''
  }
}

async function ensureChineseQuestion(sourceText) {
  const source = normalizeText(sourceText)
  if (!source) return ''

  if (!needsChineseTranslation(source, '')) return source

  const translated = await translateToChinese(source)
  if (translated) return translated
  return source
}

async function ensureEnglishReply(sourceText, analyzedEnText) {
  const source = normalizeText(sourceText)
  if (!source) return ''

  const candidate = extractPlainAiText(analyzedEnText)
  if (!needsEnglishTranslation(source, candidate)) {
    return candidate || source
  }

  const translated = await translateToEnglish(source)
  if (looksLikeEnglish(translated)) return translated
  if (looksLikeEnglish(candidate)) return candidate

  return 'Thanks for your feedback. We will review it and get back to you soon.'
}

function buildHeuristicAnalysis(feedback, config) {
  const question = buildFeedbackQuestionText(feedback)
  const lower = question.toLowerCase()
  const categories = parseCategories(config?.categories)

  const bugKeywords = ['bug', 'error', 'fail', 'crash', '崩溃', '报错', '错误', '异常', '打不开', '卡顿']
  const refundKeywords = REFUND_INTENT_KEYWORDS.concat([
    'billing issue',
    'double charged',
    'charged twice',
  ])
  const complaintKeywords = ['投诉', '差评', '不满', 'terrible', 'angry', '糟糕', '封禁', 'ban appeal', 'banned', 'appeal']
  const featureKeywords = ['feature', 'feature request', '希望', '建议', '新增', '需求', '优化', '改进']
  const positiveKeywords = ['thank', 'great', 'nice', '满意', '喜欢', '好评']
  const negativeKeywords = ['bad', 'terrible', 'angry', '失望', '生气', '投诉', '退款', 'refund', 'chargeback', '崩溃', '错误']
  const cancelKeywords = CANCEL_INTENT_KEYWORDS

  const matchedCategories = []
  const refundCategory = getRefundCategory(categories)
  const cancelCategory = getCancelCategory(categories)
  const bugCategory = categories.find((item) => item.includes('Bug')) || 'Bug'
  const complaintCategory = findCategoryByKeywords(categories, ['投诉', '申诉', '封禁']) || '投诉'
  const featureCategory = findCategoryByKeywords(categories, ['功能', '需求']) || '功能需求'

  if (hasIntentKeyword(lower, refundKeywords)) {
    matchedCategories.push(refundCategory)
  }
  if (hasIntentKeyword(lower, cancelKeywords)) {
    matchedCategories.push(cancelCategory)
  }
  if (bugKeywords.some((kw) => lower.includes(kw))) {
    matchedCategories.push(bugCategory)
  }
  if (complaintKeywords.some((kw) => lower.includes(kw))) {
    matchedCategories.push(complaintCategory)
  }
  if (featureKeywords.some((kw) => lower.includes(kw))) {
    matchedCategories.push(featureCategory)
  }

  const aiAllCategories = normalizeCategoryList(matchedCategories)
  const aiPrimaryCategory = aiAllCategories[0] || categories[0] || '咨询'
  const aiSecondaryCategories = aiAllCategories.slice(1)

  let sentiment = 'Neutral'
  if (negativeKeywords.some((kw) => lower.includes(kw))) {
    sentiment = 'Negative'
  } else if (positiveKeywords.some((kw) => lower.includes(kw))) {
    sentiment = 'Positive'
  }

  const summary = summarizeRequest(question)

  return {
    ai_category: aiPrimaryCategory,
    ai_primary_category: aiPrimaryCategory,
    ai_secondary_categories: aiSecondaryCategories,
    ai_all_categories: [aiPrimaryCategory].concat(aiSecondaryCategories).filter(Boolean),
    ai_sentiment: sentiment,
    ai_reply: `我们已经收到你的反馈：${summary || '你的问题'}。非常抱歉给你带来不便，我们会尽快排查并同步进展。`,
    ai_reply_en: 'Thanks for your feedback. We are sorry for the inconvenience and will investigate this issue as soon as possible.',
    user_request: summary || '反馈问题',
    is_new_request: aiPrimaryCategory.includes('需求'),
    user_question_cn: isMostlyChinese(question) || looksLikeEnglish(question) ? question : '',
  }
}

function buildPrompt(feedback, config) {
  const categoryHint = parseCategories(config?.categories).join('、')
  const userFeedbackText = buildFeedbackQuestionText(feedback, { labeled: true })

  return `# 知识库\n${config.knowledgeBase || ''}\n\n# 限制条件\n${config.limitations || ''}\n\n# 分类候选\n${categoryHint || '咨询、功能需求、Bug、投诉'}\n\n# 用户反馈\n${userFeedbackText || ''}\n\n# 输出格式\n请只返回 JSON（不要额外说明），字段如下：\n{\n  "ai_primary_category": "主分类",\n  "ai_secondary_categories": ["次分类1", "次分类2"],\n  "ai_sentiment": "Positive | Neutral | Negative",\n  "ai_reply": "中文回复",\n  "ai_reply_en": "英文回复",\n  "user_request": "用户需求摘要",\n  "is_new_request": true\n}\n\n要求：\n1. ai_primary_category 必填。\n2. ai_secondary_categories 没有时返回 []。\n3. ai_secondary_categories 中不得重复 ai_primary_category。\n4. user_request 只保留用户诉求摘要，不要返回用户原文翻译。`
}

function sanitizeCategoryList(input, categoryOptions, { exclude = [] } = {}) {
  const excluded = new Set(normalizeCategoryList(exclude))
  return normalizeCategoryList(input)
    .map((item) => sanitizeCategory(item, categoryOptions))
    .filter((item) => item && !excluded.has(item))
}

function applyIntentCategoryOverrides({
  feedback,
  userRequest,
  aiPrimaryCategory,
  aiSecondaryCategories,
  categoryOptions,
}) {
  const sourceText = [
    buildFeedbackQuestionText(feedback),
    normalizeText(userRequest),
  ].filter(Boolean).join('\n').toLowerCase()

  let primary = aiPrimaryCategory
  const secondary = normalizeCategoryList(aiSecondaryCategories)

  if (hasIntentKeyword(sourceText, REFUND_INTENT_KEYWORDS)) {
    const refundCategory = getRefundCategory(categoryOptions)
    if (refundCategory) {
      if (primary && primary !== refundCategory) {
        secondary.unshift(primary)
      }
      primary = refundCategory
    }
  }

  if (hasIntentKeyword(sourceText, CANCEL_INTENT_KEYWORDS)) {
    const cancelCategory = getCancelCategory(categoryOptions)
    if (cancelCategory && cancelCategory !== primary) {
      secondary.push(cancelCategory)
    }
  }

  const normalizedSecondary = sanitizeCategoryList(secondary, categoryOptions, {
    exclude: [primary],
  })

  return {
    aiPrimaryCategory: primary,
    aiSecondaryCategories: normalizedSecondary,
    aiAllCategories: [primary].concat(normalizedSecondary).filter(Boolean),
  }
}

async function getPromptConfig() {
  if (configCache) return configCache
  configCache = await UserFeedback.getPromptConfig()
  return configCache
}

function clearConfigCache() {
  configCache = null
}

function shouldRetryWithFallbackModel(error) {
  const message = String(error?.message || '').toLowerCase()
  return (
    message.includes('insufficient') ||
    message.includes('quota') ||
    message.includes('balance') ||
    message.includes('rate limit')
  )
}

async function callFeedbackAi(payload = {}) {
  const preferredApiKey = normalizeText(process.env.FEEDBACK_AI_API_KEY, 256) || undefined
  const preferredBaseUrl = normalizeText(process.env.FEEDBACK_AI_BASE_URL, 255) || undefined
  const preferredModel = normalizeText(process.env.FEEDBACK_AI_MODEL, 64) || undefined

  try {
    return await callChatCompletion({
      ...payload,
      apiKey: preferredApiKey,
      baseUrl: preferredBaseUrl,
      model: preferredModel,
    })
  } catch (error) {
    const fallbackApiKey =
      normalizeText(process.env.AGENT_AI_API_KEY, 256) ||
      normalizeText(process.env.OPENAI_API_KEY, 256) ||
      normalizeText(process.env.DEEPSEEK_API_KEY, 256)
    const fallbackBaseUrl =
      normalizeText(process.env.AGENT_AI_BASE_URL, 255) ||
      normalizeText(process.env.OPENAI_BASE_URL, 255) ||
      normalizeText(process.env.DEEPSEEK_BASE_URL, 255) ||
      preferredBaseUrl ||
      undefined
    const fallbackModel =
      normalizeText(process.env.AGENT_AI_DEFAULT_MODEL, 64) || preferredModel || undefined
    const hasDifferentFallback = Boolean(fallbackApiKey) && fallbackApiKey !== preferredApiKey

    if (!hasDifferentFallback || !shouldRetryWithFallbackModel(error)) {
      throw error
    }

    console.warn('反馈 AI 主配置不可用，自动切换备用模型:', error?.message || error)
    return callChatCompletion({
      ...payload,
      apiKey: fallbackApiKey,
      baseUrl: fallbackBaseUrl,
      model: fallbackModel,
    })
  }
}

async function analyzeFeedback(feedback) {
  const config = await getPromptConfig()
  const categoryOptions = parseCategories(config?.categories)
  const heuristic = buildHeuristicAnalysis(feedback, config)
  const feedbackQuestionText = buildFeedbackQuestionText(feedback)
  const feedbackQuestionSourceText = normalizeText(feedback?.user_question) || feedbackQuestionText

  if (!hasAiCapability()) {
    heuristic.user_question_cn = await ensureChineseQuestion(feedbackQuestionSourceText)
    heuristic.ai_reply_en = await ensureEnglishReply(heuristic.ai_reply, heuristic.ai_reply_en)
    return heuristic
  }

  try {
    const response = await callFeedbackAi({
      systemPrompt: `${config.systemPrompt || ''}\n\n${config.replyStyle || ''}`,
      userPrompt: buildPrompt(feedback, config),
      temperature: Number.isFinite(Number(process.env.FEEDBACK_AI_TEMPERATURE))
        ? Number(process.env.FEEDBACK_AI_TEMPERATURE)
        : 0.4,
      maxTokens: Number.isInteger(Number(process.env.FEEDBACK_AI_MAX_TOKENS))
        ? Number(process.env.FEEDBACK_AI_MAX_TOKENS)
        : 800,
    })

    const parsed = extractJsonObject(response?.content)
    if (!parsed) {
      console.warn('反馈 AI 返回内容无法解析为 JSON，回退到规则分析:', {
        feedbackId: feedback?.id || null,
        preview: normalizeText(response?.content, 400),
      })
      heuristic.user_question_cn = await ensureChineseQuestion(feedbackQuestionSourceText)
      heuristic.ai_reply_en = await ensureEnglishReply(heuristic.ai_reply, heuristic.ai_reply_en)
      return heuristic
    }

    const userQuestionCn = await ensureChineseQuestion(feedbackQuestionSourceText)
    const aiPrimaryCategory = sanitizeCategory(
      parsed.ai_primary_category || parsed.primary_category || parsed.ai_category,
      categoryOptions,
    )
    const secondarySource =
      parsed.ai_secondary_categories ||
      parsed.secondary_categories ||
      normalizeCategoryList(parsed.ai_all_categories).filter((item) => item !== aiPrimaryCategory)
    const aiSecondaryCategories = sanitizeCategoryList(
      secondarySource,
      categoryOptions,
      { exclude: [aiPrimaryCategory] },
    )
    const aiReply = normalizeText(parsed.ai_reply) || heuristic.ai_reply
    const aiReplyEn = await ensureEnglishReply(aiReply, parsed.ai_reply_en)
    const userRequest = summarizeRequest(parsed.user_request || feedbackQuestionText)
    const categoryOverride = applyIntentCategoryOverrides({
      feedback,
      userRequest,
      aiPrimaryCategory,
      aiSecondaryCategories,
      categoryOptions,
    })

    return {
      ai_category: categoryOverride.aiPrimaryCategory,
      ai_primary_category: categoryOverride.aiPrimaryCategory,
      ai_secondary_categories: categoryOverride.aiSecondaryCategories,
      ai_all_categories: categoryOverride.aiAllCategories,
      ai_sentiment: normalizeSentiment(parsed.ai_sentiment),
      ai_reply: aiReply,
      ai_reply_en: aiReplyEn,
      user_request: userRequest,
      is_new_request: normalizeBool(parsed.is_new_request, false),
      user_question_cn: userQuestionCn,
    }
  } catch (error) {
    console.warn('反馈 AI 分析失败，回退到规则分析:', error?.message || error)
    heuristic.user_question_cn = await ensureChineseQuestion(feedbackQuestionSourceText)
    heuristic.ai_reply_en = await ensureEnglishReply(heuristic.ai_reply, heuristic.ai_reply_en)
    return heuristic
  }
}

async function analyzeSingleFeedback(feedbackId, options = {}) {
  const row = await UserFeedback.getById(feedbackId)
  if (!row) {
    const error = new Error('反馈不存在')
    error.code = 'NOT_FOUND'
    throw error
  }

  const analysis = await analyzeFeedback(row)
  await UserFeedback.markAnalysis(feedbackId, analysis, {
    operatorUserId: options?.operatorUserId,
  })

  return {
    success: true,
    message: '分析完成',
    data: analysis,
  }
}

async function analyzeUnprocessedFeedback(limit = 10, options = {}) {
  const list = await UserFeedback.listUnprocessed(limit)
  if (!list.length) {
    return {
      success: true,
      message: '没有待分析的反馈',
      processed: 0,
      failed: 0,
      results: [],
    }
  }

  let processed = 0
  let failed = 0
  const results = []

  for (const item of list) {
    try {
      const analysis = await analyzeFeedback(item)
      await UserFeedback.markAnalysis(item.id, analysis, {
        operatorUserId: options?.operatorUserId,
      })
      processed += 1
      results.push({ id: item.id, status: 'success', analysis })
    } catch (error) {
      failed += 1
      results.push({
        id: item.id,
        status: 'failed',
        error: error?.message || '分析失败',
      })
    }
  }

  return {
    success: true,
    message: `分析完成：成功 ${processed} 条，失败 ${failed} 条`,
    processed,
    failed,
    results,
  }
}

module.exports = {
  analyzeSingleFeedback,
  analyzeUnprocessedFeedback,
  clearConfigCache,
}
