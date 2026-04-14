const UserFeedback = require('../models/UserFeedback')
const { callChatCompletion } = require('./aiClientService')

let configCache = null

function normalizeText(value, maxLength = 0) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (maxLength > 0) return text.slice(0, maxLength)
  return text
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
  return String(categoriesText || '')
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

function extractJsonObject(rawText) {
  const text = String(rawText || '')
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null

  const candidate = String(match[0])
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")

  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

function summarizeRequest(text) {
  const cleaned = normalizeText(text)
  if (!cleaned) return ''

  const firstSentence = cleaned.split(/[。！？.!?\n]/)[0]
  const target = normalizeText(firstSentence)
  if (!target) return cleaned.slice(0, 24)

  return target.length > 24 ? `${target.slice(0, 24)}...` : target
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

async function ensureChineseQuestion(sourceText, analyzedCnText) {
  const source = normalizeText(sourceText)
  if (!source) return ''

  const candidate = normalizeText(analyzedCnText)
  if (!needsChineseTranslation(source, candidate)) {
    return candidate || source
  }

  const translated = await translateToChinese(source)
  if (translated) return translated
  return candidate || source
}

function buildHeuristicAnalysis(feedback, config) {
  const question = normalizeText(feedback?.user_question)
  const lower = question.toLowerCase()
  const categories = parseCategories(config?.categories)

  const bugKeywords = ['bug', 'error', 'fail', 'crash', '崩溃', '报错', '错误', '异常', '打不开', '卡顿']
  const featureKeywords = ['feature', 'request', '希望', '建议', '新增', '需求', '优化', '改进']
  const complaintKeywords = ['退款', '投诉', '差评', '不满', 'terrible', 'angry', '糟糕', '封禁']
  const positiveKeywords = ['thank', 'great', 'nice', '满意', '喜欢', '好评']
  const negativeKeywords = ['bad', 'terrible', 'angry', '失望', '生气', '投诉', '退款', '崩溃', '错误']

  let category = categories[0] || '咨询'
  if (bugKeywords.some((kw) => lower.includes(kw))) {
    category = categories.find((item) => item.includes('Bug')) || 'Bug'
  } else if (featureKeywords.some((kw) => lower.includes(kw))) {
    category = categories.find((item) => item.includes('功能') || item.includes('需求')) || '功能需求'
  } else if (complaintKeywords.some((kw) => lower.includes(kw))) {
    category = categories.find((item) => item.includes('投诉') || item.includes('申诉')) || '投诉'
  }

  let sentiment = 'Neutral'
  if (negativeKeywords.some((kw) => lower.includes(kw))) {
    sentiment = 'Negative'
  } else if (positiveKeywords.some((kw) => lower.includes(kw))) {
    sentiment = 'Positive'
  }

  const summary = summarizeRequest(question)

  return {
    ai_category: category,
    ai_sentiment: sentiment,
    ai_reply: `我们已经收到你的反馈：${summary || '你的问题'}。非常抱歉给你带来不便，我们会尽快排查并同步进展。`,
    ai_reply_en: 'Thanks for your feedback. We are sorry for the inconvenience and will investigate this issue as soon as possible.',
    user_request: summary || '反馈问题',
    is_new_request: category.includes('需求'),
    user_question_cn: isMostlyChinese(question) || looksLikeEnglish(question) ? question : '',
  }
}

function buildPrompt(feedback, config) {
  const categoryHint = parseCategories(config?.categories).join('、')

  return `# 知识库\n${config.knowledgeBase || ''}\n\n# 限制条件\n${config.limitations || ''}\n\n# 分类候选\n${categoryHint || '咨询、功能需求、Bug、投诉'}\n\n# 用户反馈\n${feedback?.user_question || ''}\n\n# 输出格式\n请只返回 JSON（不要额外说明），字段如下：\n{\n  "ai_category": "分类",\n  "ai_sentiment": "Positive | Neutral | Negative",\n  "ai_reply": "中文回复",\n  "ai_reply_en": "英文回复",\n  "user_request": "用户需求摘要",\n  "is_new_request": true,\n  "user_question_cn": "用户问题中文"\n}`
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

  if (!hasAiCapability()) {
    heuristic.user_question_cn = await ensureChineseQuestion(
      feedback?.user_question,
      heuristic.user_question_cn,
    )
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
      heuristic.user_question_cn = await ensureChineseQuestion(
        feedback?.user_question,
        heuristic.user_question_cn,
      )
      return heuristic
    }

    const userQuestionCn = await ensureChineseQuestion(
      feedback?.user_question,
      parsed.user_question_cn,
    )

    return {
      ai_category: sanitizeCategory(parsed.ai_category, categoryOptions),
      ai_sentiment: normalizeSentiment(parsed.ai_sentiment),
      ai_reply: normalizeText(parsed.ai_reply) || heuristic.ai_reply,
      ai_reply_en:
        normalizeText(parsed.ai_reply_en) ||
        'Thanks for your feedback. We will review it and get back to you soon.',
      user_request: summarizeRequest(parsed.user_request || feedback?.user_question),
      is_new_request: normalizeBool(parsed.is_new_request, false),
      user_question_cn: userQuestionCn,
    }
  } catch (error) {
    console.warn('反馈 AI 分析失败，回退到规则分析:', error?.message || error)
    heuristic.user_question_cn = await ensureChineseQuestion(
      feedback?.user_question,
      heuristic.user_question_cn,
    )
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
