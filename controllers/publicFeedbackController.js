const UserFeedback = require('../models/UserFeedback')
const ConfigDict = require('../models/ConfigDict')

const DEFAULT_PRODUCT_OPTIONS = ['A1', 'Minimix', 'Vimi', 'Couplelens', 'Veeo', 'Heyo', 'POPDoll', 'Beyo', 'Viyo']
const DEFAULT_CHANNEL_OPTIONS = ['邮件', '表单', '商店评论', '其他']

function normalizeText(value, maxLength = 0) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (maxLength > 0) return text.slice(0, maxLength)
  return text
}

function normalizeBoolean(value) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true
  if (value === false || value === 0 || value === '0' || value === 'false') return false
  return false
}

function pickFirst(source, keys = []) {
  if (!source || typeof source !== 'object') return ''
  for (const key of keys) {
    const value = source[key]
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function verifyPublicToken(req) {
  const configuredToken = normalizeText(process.env.FEEDBACK_PUBLIC_FORM_TOKEN, 256)
  if (!configuredToken) return true

  const headerToken = normalizeText(req.headers['x-feedback-form-token'], 256)
  const queryToken = normalizeText(req.query?.token, 256)
  const bodyToken = normalizeText(req.body?.token, 256)
  const providedToken = headerToken || queryToken || bodyToken

  return providedToken && providedToken === configuredToken
}

function normalizeFormMetaItems(rows = [], fallback = []) {
  const list = Array.isArray(rows) && rows.length > 0
    ? rows.map((row, index) => ({
      code: normalizeText(row?.item_code, 64) || `ITEM_${index + 1}`,
      name: normalizeText(row?.item_name, 100),
      sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : (index + 1) * 10,
    }))
    : fallback.map((name, index) => ({
      code: `ITEM_${index + 1}`,
      name,
      sort_order: (index + 1) * 10,
    }))

  return list
    .filter((item) => item.name)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
}

function buildCreatePayload(body = {}) {
  const userQuestion = pickFirst(body, [
    'user_question',
    'question',
    'feedback',
    'message',
    'content',
    'description',
  ])

  return {
    date: normalizeText(body.date) || undefined,
    user_email: pickFirst(body, ['user_email', 'email', 'email_address']) || 'anonymous@form.com',
    product: pickFirst(body, ['product', 'product_name']) || '未指定',
    channel: pickFirst(body, ['channel', 'source_channel']) || '表单',
    user_question: userQuestion,
    user_question_cn: pickFirst(body, ['user_question_cn', 'question_cn']) || null,
    issue_type: pickFirst(body, ['issue_type']) || '待分类',
    user_request: pickFirst(body, ['user_request', 'intent', 'request_summary']) || null,
    is_new_request: normalizeBoolean(body.is_new_request),
    status: 'pending',
    ai_processed: false,
  }
}

async function getPublicFeedbackFormMeta(req, res) {
  try {
    if (!verifyPublicToken(req)) {
      return res.status(401).json({ success: false, message: '表单令牌无效' })
    }

    const [productRows, channelRows] = await Promise.all([
      ConfigDict.listItems('feedback_product', { enabledOnly: true }).catch(() => []),
      ConfigDict.listItems('feedback_channel', { enabledOnly: true }).catch(() => []),
    ])

    return res.json({
      success: true,
      data: {
        products: normalizeFormMetaItems(productRows, DEFAULT_PRODUCT_OPTIONS),
        channels: normalizeFormMetaItems(channelRows, DEFAULT_CHANNEL_OPTIONS),
      },
    })
  } catch (error) {
    console.error('获取公开反馈表单配置失败:', error)
    return res.status(500).json({ success: false, message: '获取表单配置失败' })
  }
}

async function submitPublicFeedback(req, res) {
  try {
    if (!verifyPublicToken(req)) {
      return res.status(401).json({ success: false, message: '表单令牌无效' })
    }

    const payload = buildCreatePayload(req.body || {})

    if (!normalizeText(payload.user_question)) {
      return res.status(400).json({ success: false, message: '缺少必填字段：user_question' })
    }

    const created = await UserFeedback.create(payload, { operatorUserId: null })
    return res.status(201).json({
      success: true,
      message: '反馈提交成功',
      data: {
        id: created?.id,
        status: created?.status,
        created_at: created?.created_at,
      },
    })
  } catch (error) {
    if (error?.code === 'INVALID_PAYLOAD') {
      return res.status(400).json({ success: false, message: error.message })
    }
    console.error('公开反馈提交失败:', error)
    return res.status(500).json({ success: false, message: '反馈提交失败' })
  }
}

module.exports = {
  getPublicFeedbackFormMeta,
  submitPublicFeedback,
}
