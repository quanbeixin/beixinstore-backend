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
const ACCOUNT_DELETE_INTENT_KEYWORDS = [
  'delete my account',
  'delete account',
  'remove my account',
  'close my account',
  'account deletion',
  'permanent delete account',
  '删除账户',
  '删除账号',
  '注销账户',
  '注销账号',
]
const DATA_DELETE_INTENT_KEYWORDS = [
  'delete my data',
  'delete all data',
  'erase my data',
  'permanent deletion',
  'permanently delete',
  'remove all photos',
  'remove all videos',
  '删除数据',
  '永久删除',
  '删除上传图',
  '删除结果图',
  '删除视频',
  '删除帖子',
  '删除滤镜',
]

function normalizeText(value, maxLength = 0) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (maxLength > 0) return text.slice(0, maxLength)
  return text
}

function normalizeFeedbackBodyText(value) {
  const text = normalizeText(value)
  if (!text) return ''

  const withoutTags = text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalizeText(withoutTags)
}

function buildFeedbackQuestionText(feedback, { labeled = false } = {}) {
  const subject = normalizeText(feedback?.email_subject)
  const question = normalizeFeedbackBodyText(feedback?.user_question)

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

function getDefaultCategory(categoryOptions = []) {
  return (
    findCategoryByKeywords(categoryOptions, ['未说明具体原因']) ||
    findCategoryByKeywords(categoryOptions, ['未说明']) ||
    findCategoryByKeywords(categoryOptions, ['咨询']) ||
    categoryOptions[0] ||
    '咨询'
  )
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
    return getDefaultCategory(categoryOptions)
  }

  const lower = normalized.toLowerCase()
  if (hasIntentKeyword(lower, ACCOUNT_DELETE_INTENT_KEYWORDS)) {
    return (
      findCategoryByKeywords(categoryOptions, ['删除账户', '删除账号']) ||
      findCategoryByKeywords(categoryOptions, ['删除']) ||
      normalized
    )
  }
  if (hasIntentKeyword(lower, DATA_DELETE_INTENT_KEYWORDS)) {
    return (
      findCategoryByKeywords(categoryOptions, ['删除数据', '删除上传图', '删除结果图', '删除视频', '删除帖子', '删除滤镜']) ||
      findCategoryByKeywords(categoryOptions, ['删除']) ||
      normalized
    )
  }
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
    return getDefaultCategory(categoryOptions)
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

function decodeEscapedJsonString(value) {
  const text = String(value || '')
  if (!text) return ''
  try {
    return JSON.parse(`"${text}"`)
  } catch {
    return text
  }
}

function extractLooseJsonLikeObject(rawText) {
  const source = String(rawText || '').trim()
  if (!source) return null

  const stringField = (fieldName) => {
    const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i')
    const match = source.match(pattern)
    if (!match?.[1]) return ''
    return normalizeText(decodeEscapedJsonString(match[1]))
  }

  const boolField = (fieldName) => {
    const pattern = new RegExp(`"${fieldName}"\\s*:\\s*(true|false)`, 'i')
    const match = source.match(pattern)
    if (!match?.[1]) return null
    return String(match[1]).toLowerCase() === 'true'
  }

  const stringArrayField = (fieldName) => {
    const pattern = new RegExp(`"${fieldName}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, 'i')
    const match = source.match(pattern)
    if (!match?.[1]) return []

    const rawItems = match[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    return rawItems
      .map((item) => item.replace(/^"/, '').replace(/"$/, ''))
      .map((item) => normalizeText(decodeEscapedJsonString(item), 100))
      .filter(Boolean)
  }

  const aiPrimaryCategory =
    stringField('ai_primary_category') || stringField('primary_category') || stringField('ai_category')
  const aiReply = stringField('ai_reply')
  const aiReplyEn = stringField('ai_reply_en')
  const userRequest = stringField('user_request')
  const aiSentiment = stringField('ai_sentiment')
  const secondaryCategories =
    stringArrayField('ai_secondary_categories').length > 0
      ? stringArrayField('ai_secondary_categories')
      : stringArrayField('secondary_categories')
  const isNewRequest = boolField('is_new_request')

  if (!aiPrimaryCategory && !aiReply && !userRequest) {
    return null
  }

  return {
    ai_primary_category: aiPrimaryCategory,
    ai_secondary_categories: secondaryCategories,
    ai_sentiment: aiSentiment,
    ai_reply: aiReply,
    ai_reply_en: aiReplyEn,
    user_request: userRequest,
    is_new_request: isNewRequest,
  }
}

async function recoverAnalysisFromNonJsonResponse({
  rawContent = '',
  feedback = null,
  categoryOptions = [],
}) {
  const modelOutput = normalizeText(rawContent, 6000)
  const feedbackText = buildFeedbackQuestionText(feedback, { labeled: true }) || ''
  if (!modelOutput || !feedbackText) return null

  const categoryHint = normalizeCategoryList(categoryOptions).join('、')
  try {
    const response = await callFeedbackAi({
      systemPrompt:
        '你是 JSON 结构化提取器。请根据用户反馈与候选分析内容，输出一个严格可解析的 JSON 对象，不要输出解释、不要输出 Markdown、不要输出分析过程。',
      userPrompt: `请输出 JSON（字段必须完整）：\n{\n  "ai_primary_category": "主分类",\n  "ai_secondary_categories": [],\n  "ai_sentiment": "Positive | Neutral | Negative",\n  "ai_reply": "中文回复",\n  "ai_reply_en": "英文回复",\n  "user_request": "用户需求摘要",\n  "is_new_request": true\n}\n\n要求：ai_primary_category 只能保留 1 个最能代表用户问题的主分类；ai_secondary_categories 固定返回 []。\n\n分类候选：${categoryHint || '咨询、功能需求、Bug、投诉'}\n\n用户反馈：\n${feedbackText}\n\n候选分析内容：\n${modelOutput}`,
      temperature: 0,
      maxTokens: 800,
      responseFormat: 'json_object',
    })

    return extractJsonObject(response?.content) || extractLooseJsonLikeObject(response?.content)
  } catch {
    return null
  }
}

function summarizeRequest(text) {
  const cleaned = normalizeText(text)
  if (!cleaned) return ''

  const lower = cleaned.toLowerCase()
  if (/(delete (my )?account|remove (my )?account|close (my )?account|account deletion|删除账户|删除账号|注销账户|注销账号)/.test(lower)) {
    return '删除账户'
  }
  if (/(delete (all )?(my )?(data|photos|videos)|permanent deletion|permanently delete|删除数据|永久删除)/.test(lower)) {
    return '删除数据'
  }
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

function normalizeCategoryCodeForMatch(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[—–－-]/g, '-')
    .toLowerCase()
}

function isRefundCategory(categoryName = '') {
  const normalized = normalizeCategoryCodeForMatch(categoryName)
  return normalized.includes('要求退款') || normalized.includes('退款')
}

function isCancelCategory(categoryName = '') {
  const normalized = normalizeCategoryCodeForMatch(categoryName)
  return normalized.includes('取消订阅')
}

function buildPolicyReplyByCategories({
  primaryCategory = '',
  secondaryCategories = [],
  categoryOptions = [],
}) {
  const refundCategory = getRefundCategory(categoryOptions)
  const cancelCategory = getCancelCategory(categoryOptions)
  const categories = [primaryCategory]
    .concat(Array.isArray(secondaryCategories) ? secondaryCategories : [])
    .filter(Boolean)

  const hasRefund = categories.some((item) => isRefundCategory(item))
  const hasCancel = categories.some((item) => isCancelCategory(item))

  if (!hasRefund && !hasCancel) return ''

  const replyParts = []
  if (hasRefund && refundCategory) {
    replyParts.push(
      '您好，非常抱歉，当前暂不支持退款。本应用会员服务是“基于订阅的”，只有在您积极同意订阅条款后，系统才会定期向您收费。但您可立即通过谷歌商店关闭订阅，避免后续扣款。感谢您的理解与支持！',
    )
  }
  if (hasCancel && cancelCategory) {
    replyParts.push(
      '您可以通过谷歌商店管理并停止订阅，如未找到停止订阅选项请提供您的注册邮箱，发送给我们协助解决。请注意：取消后，当前订阅周期仍有效，到期后不再自动扣款。已付费的会员权益可持续使用至订阅结束日。',
    )
  }

  return replyParts.join('\n')
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

function fallbackChineseQuestion(sourceText) {
  const source = normalizeText(sourceText)
  if (!source) return ''

  const lower = source.toLowerCase()
  if (hasIntentKeyword(lower, CANCEL_INTENT_KEYWORDS)) {
    return '取消我的订阅'
  }
  if (hasIntentKeyword(lower, ACCOUNT_DELETE_INTENT_KEYWORDS)) {
    return '请删除我的账户'
  }
  if (hasIntentKeyword(lower, DATA_DELETE_INTENT_KEYWORDS)) {
    return '请删除我的数据'
  }
  if (hasIntentKeyword(lower, REFUND_INTENT_KEYWORDS)) {
    return '我想申请退款'
  }

  const exactFallbackMap = new Map([
    ['cancel my subscription', '取消我的订阅'],
    ['unsubscribe', '取消订阅'],
    ['delete my account', '请删除我的账户'],
    ['delete account', '请删除账户'],
    ['delete my data', '请删除我的数据'],
    ['delete all data', '请删除所有数据'],
    ['refund', '我想申请退款'],
    ['i want a refund', '我想申请退款'],
  ])

  return exactFallbackMap.get(lower) || ''
}

async function ensureChineseQuestion(sourceText) {
  const source = normalizeText(sourceText)
  if (!source) return ''

  if (!needsChineseTranslation(source, '')) return source

  const translated = await translateToChinese(source)
  if (!needsChineseTranslation(source, translated)) return translated

  const fallbackTranslated = fallbackChineseQuestion(source)
  if (fallbackTranslated) return fallbackTranslated

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

async function translateFeedbackReplyToEnglish(text) {
  const source = normalizeText(text)
  if (!source) return ''

  const translated = await translateToEnglish(source)
  if (looksLikeEnglish(translated)) return translated
  if (looksLikeEnglish(source) && !isMostlyChinese(source)) return source

  return ''
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
  const deleteAccountCategory = findCategoryByKeywords(categories, ['删除账户', '删除账号'])
  const deleteDataCategory = findCategoryByKeywords(categories, ['删除数据', '删除上传图', '删除结果图', '删除视频', '删除帖子', '删除滤镜'])
  const refundCategory = getRefundCategory(categories)
  const cancelCategory = getCancelCategory(categories)
  const bugCategory = categories.find((item) => item.includes('Bug')) || 'Bug'
  const complaintCategory = findCategoryByKeywords(categories, ['投诉', '申诉', '封禁']) || '投诉'
  const featureCategory = findCategoryByKeywords(categories, ['功能', '需求']) || '功能需求'

  if (hasIntentKeyword(lower, ACCOUNT_DELETE_INTENT_KEYWORDS)) {
    matchedCategories.push(deleteAccountCategory || deleteDataCategory || getDefaultCategory(categories))
  } else if (hasIntentKeyword(lower, DATA_DELETE_INTENT_KEYWORDS)) {
    matchedCategories.push(deleteDataCategory || deleteAccountCategory || getDefaultCategory(categories))
  }
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
  const aiPrimaryCategory = aiAllCategories[0] || getDefaultCategory(categories)

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
    ai_secondary_categories: [],
    ai_all_categories: [aiPrimaryCategory].filter(Boolean),
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

  return `# 知识库\n${config.knowledgeBase || ''}\n\n# 限制条件\n${config.limitations || ''}\n\n# 分类候选\n${categoryHint || '咨询、功能需求、Bug、投诉'}\n\n# 用户反馈\n${userFeedbackText || ''}\n\n# 输出格式\n请只返回 JSON（不要额外说明），字段如下：\n{\n  "ai_primary_category": "主分类",\n  "ai_secondary_categories": [],\n  "ai_sentiment": "Positive | Neutral | Negative",\n  "ai_reply": "中文回复",\n  "ai_reply_en": "英文回复",\n  "user_request": "用户需求摘要",\n  "is_new_request": true\n}\n\n要求：\n1. ai_primary_category 必填，并且只能保留 1 个最能代表用户问题的主分类。\n2. 判断主分类时可以综合知识库、限制条件、分类候选和用户原文，但不要输出次分类。\n3. ai_secondary_categories 固定返回 []，用于兼容旧字段。\n4. user_request 只保留用户诉求摘要，不要返回用户原文翻译。`
}

function applyIntentCategoryOverrides({
  feedback,
  userRequest,
  aiPrimaryCategory,
  categoryOptions,
}) {
  const sourceText = [
    buildFeedbackQuestionText(feedback),
    normalizeText(userRequest),
  ].filter(Boolean).join('\n').toLowerCase()

  let primary = aiPrimaryCategory

  if (hasIntentKeyword(sourceText, ACCOUNT_DELETE_INTENT_KEYWORDS)) {
    const deleteCategory =
      findCategoryByKeywords(categoryOptions, ['删除账户', '删除账号']) ||
      findCategoryByKeywords(categoryOptions, ['删除'])
    if (deleteCategory) {
      primary = deleteCategory
    }
  } else if (hasIntentKeyword(sourceText, DATA_DELETE_INTENT_KEYWORDS)) {
    const deleteDataCategory =
      findCategoryByKeywords(categoryOptions, ['删除数据', '删除上传图', '删除结果图', '删除视频', '删除帖子', '删除滤镜']) ||
      findCategoryByKeywords(categoryOptions, ['删除'])
    if (deleteDataCategory) {
      primary = deleteDataCategory
    }
  }

  if (hasIntentKeyword(sourceText, REFUND_INTENT_KEYWORDS)) {
    const refundCategory = getRefundCategory(categoryOptions)
    if (refundCategory) {
      primary = refundCategory
    }
  }

  if (!hasIntentKeyword(sourceText, REFUND_INTENT_KEYWORDS) && hasIntentKeyword(sourceText, CANCEL_INTENT_KEYWORDS)) {
    const cancelCategory = getCancelCategory(categoryOptions)
    if (cancelCategory) {
      primary = cancelCategory
    }
  }

  return {
    aiPrimaryCategory: primary,
    aiSecondaryCategories: [],
    aiAllCategories: [primary].filter(Boolean),
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

function isFeedbackAiDebugEnabled() {
  const value = String(process.env.FEEDBACK_AI_DEBUG || '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
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
  const preferredWireApi = normalizeText(process.env.FEEDBACK_AI_WIRE_API, 64) || undefined

  const resolveFeedbackWireApi = (baseUrl, explicitWireApi) => {
    if (explicitWireApi) return explicitWireApi
    const resolvedBaseUrl = normalizeText(baseUrl, 255).toLowerCase()
    if (resolvedBaseUrl.includes('api.deepseek.com')) return 'chat_completions'
    return undefined
  }

  try {
    return await callChatCompletion({
      ...payload,
      apiKey: preferredApiKey,
      baseUrl: preferredBaseUrl,
      model: preferredModel,
      wireApi: resolveFeedbackWireApi(preferredBaseUrl, preferredWireApi),
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
    const fallbackWireApi =
      normalizeText(process.env.AGENT_AI_WIRE_API, 64) ||
      resolveFeedbackWireApi(fallbackBaseUrl, preferredWireApi) ||
      undefined
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
      wireApi: fallbackWireApi,
    })
  }
}

async function analyzeFeedback(feedback) {
  const config = await getPromptConfig()
  const categoryOptions = parseCategories(config?.categories)
  const heuristic = buildHeuristicAnalysis(feedback, config)
  const feedbackQuestionText = buildFeedbackQuestionText(feedback)
  const feedbackQuestionTranslationSourceText = buildFeedbackQuestionText(feedback, { labeled: true }) || feedbackQuestionText

  if (!hasAiCapability()) {
    heuristic.user_question_cn = await ensureChineseQuestion(feedbackQuestionTranslationSourceText)
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
      responseFormat: 'json_object',
    })

    let parsed = extractJsonObject(response?.content)
    if (!parsed) {
      parsed = extractLooseJsonLikeObject(response?.content)
      if (!parsed) {
        parsed = await recoverAnalysisFromNonJsonResponse({
          rawContent: response?.content,
          feedback,
          categoryOptions,
        })
      }
      if (!parsed) {
        console.warn('反馈 AI 返回内容无法解析为 JSON，回退到规则分析:', {
          feedbackId: feedback?.id || null,
          preview: normalizeText(response?.content, 400),
        })
        heuristic.user_question_cn = await ensureChineseQuestion(feedbackQuestionTranslationSourceText)
        heuristic.ai_reply_en = await ensureEnglishReply(heuristic.ai_reply, heuristic.ai_reply_en)
        return heuristic
      }
      if (isFeedbackAiDebugEnabled()) {
        console.warn('反馈 AI 返回内容非标准 JSON，已按宽松模式提取字段:', {
          feedbackId: feedback?.id || null,
          preview: normalizeText(response?.content, 280),
        })
      }
    }

    const userQuestionCn = await ensureChineseQuestion(feedbackQuestionTranslationSourceText)
    const aiPrimaryCategory = sanitizeCategory(
      parsed.ai_primary_category || parsed.primary_category || parsed.ai_category,
      categoryOptions,
    )
    const aiSecondaryCategories = []
    const aiReply = normalizeText(parsed.ai_reply) || heuristic.ai_reply
    const userRequest = summarizeRequest(parsed.user_request || feedbackQuestionText)
    const categoryOverride = applyIntentCategoryOverrides({
      feedback,
      userRequest,
      aiPrimaryCategory,
      aiSecondaryCategories,
      categoryOptions,
    })
    const policyReply = buildPolicyReplyByCategories({
      primaryCategory: categoryOverride.aiPrimaryCategory,
      secondaryCategories: categoryOverride.aiSecondaryCategories,
      categoryOptions,
    })
    const normalizedAiReply = policyReply || aiReply
    const normalizedAiReplyEn = await ensureEnglishReply(normalizedAiReply, parsed.ai_reply_en)

    return {
      ai_category: categoryOverride.aiPrimaryCategory,
      ai_primary_category: categoryOverride.aiPrimaryCategory,
      ai_secondary_categories: categoryOverride.aiSecondaryCategories,
      ai_all_categories: categoryOverride.aiAllCategories,
      ai_sentiment: normalizeSentiment(parsed.ai_sentiment),
      ai_reply: normalizedAiReply,
      ai_reply_en: normalizedAiReplyEn,
      user_request: userRequest,
      is_new_request: normalizeBool(parsed.is_new_request, false),
      user_question_cn: userQuestionCn,
    }
  } catch (error) {
    console.warn('反馈 AI 分析失败，回退到规则分析:', error?.message || error)
    heuristic.user_question_cn = await ensureChineseQuestion(feedbackQuestionTranslationSourceText)
    const fallbackPolicyReply = buildPolicyReplyByCategories({
      primaryCategory: heuristic.ai_primary_category,
      secondaryCategories: heuristic.ai_secondary_categories,
      categoryOptions,
    })
    if (fallbackPolicyReply) {
      heuristic.ai_reply = fallbackPolicyReply
    }
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
  translateFeedbackReplyToEnglish,
  clearConfigCache,
}
