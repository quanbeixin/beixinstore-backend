const pool = require('./db')
const { signNotificationLoginToken } = require('./notificationLoginToken')

function normalizeText(value, maxLength = 500) {
  if (value === undefined || value === null) return ''
  return String(value).trim().slice(0, maxLength)
}

function normalizeHttpUrl(value, maxLength = 2000) {
  const text = normalizeText(value, maxLength)
  if (!text) return ''

  try {
    const parsed = new URL(text)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

function buildTargetActionUrl(actionUrl, target) {
  const normalizedActionUrl = normalizeHttpUrl(actionUrl)
  if (!normalizedActionUrl) return ''
  if (!target || target.target_type !== 'user') return normalizedActionUrl

  const userId = Number(target?.extra?.user_id || 0)
  if (!Number.isInteger(userId) || userId <= 0) return normalizedActionUrl

  const ticket = signNotificationLoginToken({
    userId,
    targetPath: normalizedActionUrl,
  })
  if (!ticket) return normalizedActionUrl

  try {
    const url = new URL(normalizedActionUrl)
    url.searchParams.set('nt', ticket)
    return url.toString()
  } catch {
    return normalizedActionUrl
  }
}

function pickFeishuConfig() {
  const appId = normalizeText(process.env.FEISHU_APP_ID || process.env.LARK_APP_ID, 128)
  const appSecret = normalizeText(process.env.FEISHU_APP_SECRET || process.env.LARK_APP_SECRET, 256)
  const timeoutMs = Number(process.env.FEISHU_TIMEOUT_MS || 8000)

  return {
    appId,
    appSecret,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs >= 1000 ? timeoutMs : 8000,
  }
}

function parseCsvToSet(value) {
  if (!value) return new Set()
  return new Set(
    String(value)
      .split(',')
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  )
}

function normalizeSendMode(value) {
  const rawMode = normalizeText(value, 32).toLowerCase()
  if (rawMode === 'shadow' || rawMode === 'whitelist' || rawMode === 'live') return rawMode
  return 'live'
}

function toCsv(setValue) {
  return Array.from(setValue || []).filter(Boolean).join(',')
}

const SEND_CONTROL_CACHE_TTL_MS = Math.max(1000, Number(process.env.NOTIFICATION_SEND_CONTROL_CACHE_TTL_MS || 5000))
let sendControlConfigCache = null
let ensureSendControlTablePromise = null

function getEnvSendControlConfig() {
  const rawMode = normalizeText(process.env.NOTIFICATION_SEND_MODE, 32).toLowerCase()
  const mode = rawMode === 'shadow' || rawMode === 'whitelist' || rawMode === 'live' ? rawMode : 'live'
  return {
    mode,
    whitelistOpenIds: parseCsvToSet(process.env.NOTIFICATION_TEST_OPEN_IDS),
    whitelistChatIds: parseCsvToSet(process.env.NOTIFICATION_TEST_CHAT_IDS),
  }
}

function cloneSendControlConfig(config) {
  return {
    mode: normalizeSendMode(config?.mode),
    whitelistOpenIds: new Set(config?.whitelistOpenIds || []),
    whitelistChatIds: new Set(config?.whitelistChatIds || []),
  }
}

function setSendControlConfigCache(config) {
  sendControlConfigCache = {
    value: cloneSendControlConfig(config),
    expireAt: Date.now() + SEND_CONTROL_CACHE_TTL_MS,
  }
}

async function ensureSendControlTable() {
  if (ensureSendControlTablePromise) return ensureSendControlTablePromise

  ensureSendControlTablePromise = (async () => {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS notification_send_control (
         id TINYINT UNSIGNED NOT NULL PRIMARY KEY COMMENT '固定单行配置ID',
         send_mode VARCHAR(16) NOT NULL DEFAULT 'live' COMMENT '发送模式 live/shadow/whitelist',
         whitelist_open_ids TEXT NULL COMMENT '白名单用户 open_id（逗号分隔）',
         whitelist_chat_ids TEXT NULL COMMENT '白名单群 chat_id（逗号分隔）',
         updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知发送控制配置'`,
    )

    const envConfig = getEnvSendControlConfig()
    await pool.query(
      `INSERT INTO notification_send_control (
         id,
         send_mode,
         whitelist_open_ids,
         whitelist_chat_ids
       ) VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         send_mode = send_mode`,
      [envConfig.mode, toCsv(envConfig.whitelistOpenIds), toCsv(envConfig.whitelistChatIds)],
    )
  })().finally(() => {
    ensureSendControlTablePromise = null
  })

  return ensureSendControlTablePromise
}

async function getSendControlConfig() {
  if (sendControlConfigCache && sendControlConfigCache.expireAt > Date.now()) {
    return cloneSendControlConfig(sendControlConfigCache.value)
  }

  try {
    await ensureSendControlTable()
    const [rows] = await pool.query(
      `SELECT send_mode, whitelist_open_ids, whitelist_chat_ids
       FROM notification_send_control
       WHERE id = 1
       LIMIT 1`,
    )
    const row = rows?.[0] || null
    const dbConfig = {
      mode: normalizeSendMode(row?.send_mode),
      whitelistOpenIds: parseCsvToSet(row?.whitelist_open_ids || ''),
      whitelistChatIds: parseCsvToSet(row?.whitelist_chat_ids || ''),
    }
    setSendControlConfigCache(dbConfig)
    return cloneSendControlConfig(dbConfig)
  } catch (error) {
    console.warn('读取通知发送控制配置失败，回退环境变量:', error?.message || error)
    const fallbackConfig = getEnvSendControlConfig()
    setSendControlConfigCache(fallbackConfig)
    return cloneSendControlConfig(fallbackConfig)
  }
}

function isTargetAllowedByWhitelist(target, sendControl) {
  if (!target || !sendControl) return false
  if (target.target_type === 'user') return sendControl.whitelistOpenIds.has(String(target.target_id || ''))
  if (target.target_type === 'chat') return sendControl.whitelistChatIds.has(String(target.target_id || ''))
  return false
}

async function getNotificationSendControl() {
  const config = await getSendControlConfig()
  return {
    mode: config.mode,
    whitelist_open_ids: Array.from(config.whitelistOpenIds),
    whitelist_chat_ids: Array.from(config.whitelistChatIds),
  }
}

async function updateNotificationSendControl(payload = {}) {
  const mode = normalizeSendMode(payload.mode)
  const openIds = parseCsvToSet(
    Array.isArray(payload.whitelist_open_ids)
      ? payload.whitelist_open_ids.join(',')
      : payload.whitelist_open_ids || payload.whitelistOpenIds || '',
  )
  const chatIds = parseCsvToSet(
    Array.isArray(payload.whitelist_chat_ids)
      ? payload.whitelist_chat_ids.join(',')
      : payload.whitelist_chat_ids || payload.whitelistChatIds || '',
  )

  const nextConfig = {
    mode,
    whitelistOpenIds: openIds,
    whitelistChatIds: chatIds,
  }

  await ensureSendControlTable()
  await pool.query(
    `INSERT INTO notification_send_control (
       id,
       send_mode,
       whitelist_open_ids,
       whitelist_chat_ids
     ) VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       send_mode = VALUES(send_mode),
       whitelist_open_ids = VALUES(whitelist_open_ids),
       whitelist_chat_ids = VALUES(whitelist_chat_ids)`,
    [mode, toCsv(openIds), toCsv(chatIds)],
  )
  setSendControlConfigCache(nextConfig)

  process.env.NOTIFICATION_SEND_MODE = mode
  process.env.NOTIFICATION_TEST_OPEN_IDS = toCsv(openIds)
  process.env.NOTIFICATION_TEST_CHAT_IDS = toCsv(chatIds)

  return {
    mode,
    whitelist_open_ids: Array.from(openIds),
    whitelist_chat_ids: Array.from(chatIds),
  }
}

function buildSkippedResult(target, reasonCode, reasonMessage) {
  return {
    target_type: target.target_type,
    target_id: target.target_id,
    target_name: target.target_name,
    skipped: true,
    success: false,
    error_code: reasonCode,
    error_message: reasonMessage,
    response: {},
  }
}

let tokenCache = {
  token: '',
  expireAt: 0,
}

async function requestWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timer)
  }
}

async function getTenantAccessToken() {
  const now = Date.now()
  if (tokenCache.token && tokenCache.expireAt > now + 60 * 1000) {
    return {
      success: true,
      token: tokenCache.token,
    }
  }

  const config = pickFeishuConfig()
  if (!config.appId || !config.appSecret) {
    return {
      success: false,
      error_code: 'FEISHU_APP_CONFIG_MISSING',
      error_message: '缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET 配置',
    }
  }

  if (typeof fetch !== 'function') {
    return {
      success: false,
      error_code: 'FETCH_NOT_AVAILABLE',
      error_message: '当前 Node 环境不支持 fetch',
    }
  }

  try {
    const response = await requestWithTimeout(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          app_id: config.appId,
          app_secret: config.appSecret,
        }),
      },
      config.timeoutMs,
    )

    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        success: false,
        error_code: 'FEISHU_TOKEN_HTTP_ERROR',
        error_message: `获取 tenant_access_token 失败: HTTP ${response.status}`,
        response: {
          http_status: response.status,
          body,
        },
      }
    }

    if (!body || Number(body.code) !== 0 || !body.tenant_access_token) {
      return {
        success: false,
        error_code: 'FEISHU_TOKEN_FAILED',
        error_message: body?.msg || '获取 tenant_access_token 失败',
        response: {
          http_status: response.status,
          body,
        },
      }
    }

    const expireSeconds = Number(body.expire || 7200)
    tokenCache = {
      token: body.tenant_access_token,
      expireAt: Date.now() + expireSeconds * 1000,
    }

    return {
      success: true,
      token: tokenCache.token,
    }
  } catch (error) {
    return {
      success: false,
      error_code: 'FEISHU_TOKEN_REQUEST_FAILED',
      error_message: error?.message || '获取 tenant_access_token 请求失败',
    }
  }
}

function buildTextMessage({ title, content, metadata }) {
  const lines = []
  if (title) lines.push(`【${title}】`)
  if (content) lines.push(String(content))
  const detailUrl = normalizeHttpUrl(metadata?.detail_url)
  if (detailUrl) {
    lines.push('')
    lines.push(`详情链接：${detailUrl}`)
  }

  return lines.join('\n')
}

function normalizeMarkdownForFeishu(content) {
  const rows = String(content || '').split('\n')
  if (rows.length === 0) return ''

  const normalizedRows = rows.map((row) => {
    const text = String(row || '')
    const orderedMatch = text.match(/^\s*(\d+)\.\s*(.+)$/)
    if (orderedMatch) {
      // Feishu markdown in card may collapse standard markdown lists in some clients.
      // Convert to explicit ordered line prefix to keep display stable.
      return `${orderedMatch[1]}）${orderedMatch[2]}`
    }

    const unorderedMatch = text.match(/^\s*-\s*(.+)$/)
    if (unorderedMatch) {
      return `• ${unorderedMatch[1]}`
    }

    return text
  })

  return normalizedRows.join('\n')
}

function buildMarkdownMessage({ content }) {
  return normalizeMarkdownForFeishu(content)
}

function buildInteractiveCardPayload({ title, markdown, actionUrl, actionText }) {
  const elements = [
    {
      tag: 'markdown',
      content: String(markdown || ''),
    },
  ]

  const normalizedActionUrl = normalizeHttpUrl(actionUrl)
  if (normalizedActionUrl) {
    elements.push({
      tag: 'action',
      actions: [
        {
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: normalizeText(actionText, 20) || '查看详情',
          },
          type: 'primary',
          url: normalizedActionUrl,
        },
      ],
    })
  }

  return {
    msg_type: 'interactive',
    content: JSON.stringify({
      config: {
        wide_screen_mode: true,
      },
      header: {
        template: 'blue',
        title: {
          tag: 'plain_text',
          content: normalizeText(title, 100) || '系统通知',
        },
      },
      elements,
    }),
  }
}

async function sendFeishuMessage({ token, receiveIdType, receiveId, messageBody, timeoutMs }) {
  const url = `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(receiveIdType)}`

  const body = {
    receive_id: receiveId,
    ...messageBody,
  }

  const response = await requestWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    timeoutMs,
  )

  const parsed = await response.json().catch(() => null)
  if (!response.ok) {
    return {
      success: false,
      error_code: 'FEISHU_SEND_HTTP_ERROR',
      error_message: `发送失败: HTTP ${response.status}`,
      response: {
        http_status: response.status,
        body: parsed,
      },
    }
  }

  if (!parsed || Number(parsed.code) !== 0) {
    return {
      success: false,
      error_code: 'FEISHU_SEND_FAILED',
      error_message: parsed?.msg || '飞书返回发送失败',
      response: {
        http_status: response.status,
        body: parsed,
      },
    }
  }

  return {
    success: true,
    response: {
      http_status: response.status,
      body: parsed,
    },
  }
}

async function listFeishuChats({ pageSize = 50, pageToken = '' } = {}) {
  const tokenResult = await getTenantAccessToken()
  if (!tokenResult.success) {
    return {
      success: false,
      error_code: tokenResult.error_code || 'TOKEN_ERROR',
      error_message: tokenResult.error_message || '获取飞书 token 失败',
      response: tokenResult.response || {},
      data: [],
      next_page_token: '',
      has_more: false,
    }
  }

  const { timeoutMs } = pickFeishuConfig()
  const normalizedPageSize = Number.isInteger(Number(pageSize)) ? Math.min(Math.max(Number(pageSize), 1), 100) : 50
  const normalizedPageToken = normalizeText(pageToken, 256)
  const query = new URLSearchParams({
    page_size: String(normalizedPageSize),
  })
  if (normalizedPageToken) query.set('page_token', normalizedPageToken)

  const url = `https://open.feishu.cn/open-apis/im/v1/chats?${query.toString()}`

  try {
    const response = await requestWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokenResult.token}`,
          'Content-Type': 'application/json',
        },
      },
      timeoutMs,
    )

    const body = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        success: false,
        error_code: 'FEISHU_CHAT_LIST_HTTP_ERROR',
        error_message: `获取飞书群列表失败: HTTP ${response.status}`,
        response: {
          http_status: response.status,
          body,
        },
        data: [],
        next_page_token: '',
        has_more: false,
      }
    }

    if (!body || Number(body.code) !== 0) {
      return {
        success: false,
        error_code: 'FEISHU_CHAT_LIST_FAILED',
        error_message: body?.msg || '获取飞书群列表失败',
        response: {
          http_status: response.status,
          body,
        },
        data: [],
        next_page_token: '',
        has_more: false,
      }
    }

    const items = Array.isArray(body?.data?.items) ? body.data.items : []
    const normalizedItems = items
      .map((item) => {
        const chatId = normalizeText(item?.chat_id, 128)
        if (!chatId) return null
        return {
          chat_id: chatId,
          name: normalizeText(item?.name, 200) || chatId,
          description: normalizeText(item?.description, 500) || '',
          avatar: normalizeText(item?.avatar, 1000) || '',
        }
      })
      .filter(Boolean)

    return {
      success: true,
      data: normalizedItems,
      next_page_token: normalizeText(body?.data?.page_token, 256),
      has_more: Boolean(body?.data?.has_more),
      response: {
        http_status: response.status,
      },
    }
  } catch (error) {
    return {
      success: false,
      error_code: 'FEISHU_CHAT_LIST_REQUEST_FAILED',
      error_message: error?.message || '获取飞书群列表请求失败',
      response: {},
      data: [],
      next_page_token: '',
      has_more: false,
    }
  }
}

function buildDemandChatName({ demandId, demandName }) {
  const normalizedDemandId = normalizeText(demandId, 64)
  const normalizedDemandName = normalizeText(demandName, 200)
  const parts = []
  if (normalizedDemandId) parts.push(normalizedDemandId)
  if (normalizedDemandName) parts.push(normalizedDemandName)
  const rawName = parts.length > 0 ? `需求协作-${parts.join('-')}` : `需求协作-${Date.now()}`
  return normalizeText(rawName, 50) || `需求协作-${Date.now()}`
}

async function createFeishuDemandChat({ demandId = '', demandName = '', ownerOpenId = '', memberOpenIds = [] } = {}) {
  const normalizedOwnerOpenId = normalizeText(ownerOpenId, 128)
  if (!normalizedOwnerOpenId) {
    return {
      success: false,
      error_code: 'FEISHU_CHAT_OWNER_OPENID_MISSING',
      error_message: '缺少群主 open_id，无法自动建群',
      response: {},
    }
  }

  const tokenResult = await getTenantAccessToken()
  if (!tokenResult.success) {
    return {
      success: false,
      error_code: tokenResult.error_code || 'TOKEN_ERROR',
      error_message: tokenResult.error_message || '获取飞书 token 失败',
      response: tokenResult.response || {},
    }
  }

  const { timeoutMs } = pickFeishuConfig()
  const normalizedMemberOpenIds = Array.from(
    new Set(
      (Array.isArray(memberOpenIds) ? memberOpenIds : [])
        .map((item) => normalizeText(item, 128))
        .filter(Boolean),
    ),
  )
  const bodyPayload = {
    name: buildDemandChatName({ demandId, demandName }),
    description: normalizeText(`需求协作群 ${normalizeText(demandId, 64)} ${normalizeText(demandName, 200)}`, 200),
    chat_mode: 'group',
    chat_type: 'private',
    owner_id: normalizedOwnerOpenId,
    user_id_list: normalizedMemberOpenIds,
  }

  const requestCandidates = [
    {
      url: 'https://open.feishu.cn/open-apis/im/v1/chats?user_id_type=open_id',
      body: bodyPayload,
    },
    {
      url: 'https://open.feishu.cn/open-apis/im/v1/chats',
      body: {
        ...bodyPayload,
        owner_id_type: 'open_id',
      },
    },
  ]

  let lastError = null
  for (const candidate of requestCandidates) {
    try {
      const response = await requestWithTimeout(
        candidate.url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenResult.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(candidate.body),
        },
        timeoutMs,
      )

      const parsed = await response.json().catch(() => null)
      if (!response.ok) {
        lastError = {
          success: false,
          error_code: 'FEISHU_CHAT_CREATE_HTTP_ERROR',
          error_message: `创建飞书群失败: HTTP ${response.status}`,
          response: {
            http_status: response.status,
            body: parsed,
          },
        }
        continue
      }

      if (!parsed || Number(parsed.code) !== 0) {
        lastError = {
          success: false,
          error_code: 'FEISHU_CHAT_CREATE_FAILED',
          error_message: parsed?.msg || '飞书返回建群失败',
          response: {
            http_status: response.status,
            body: parsed,
          },
        }
        continue
      }

      const chatId = normalizeText(parsed?.data?.chat_id, 128)
      if (!chatId) {
        lastError = {
          success: false,
          error_code: 'FEISHU_CHAT_ID_EMPTY',
          error_message: '飞书建群成功但未返回 chat_id',
          response: {
            http_status: response.status,
            body: parsed,
          },
        }
        continue
      }

      return {
        success: true,
        data: {
          chat_id: chatId,
          name: normalizeText(parsed?.data?.name, 200) || bodyPayload.name,
        },
        response: {
          http_status: response.status,
          body: parsed,
        },
      }
    } catch (error) {
      lastError = {
        success: false,
        error_code: 'FEISHU_CHAT_CREATE_REQUEST_FAILED',
        error_message: error?.message || '创建飞书群请求失败',
        response: {},
      }
    }
  }

  return lastError || {
    success: false,
    error_code: 'FEISHU_CHAT_CREATE_FAILED',
    error_message: '创建飞书群失败',
    response: {},
  }
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets)) return []

  const result = []
  for (const target of targets) {
    if (!target || typeof target !== 'object') continue

    const targetType = normalizeText(target.target_type || target.type, 16).toLowerCase()
    const targetId = normalizeText(target.target_id || target.id, 128)
    if (!targetType || !targetId) continue

    if (targetType !== 'user' && targetType !== 'chat') continue

    result.push({
      target_type: targetType,
      target_id: targetId,
      target_name: normalizeText(target.target_name || target.name, 128) || null,
      extra: target.extra && typeof target.extra === 'object' ? target.extra : null,
    })
  }

  return result
}

async function sendByFeishuApp({ title, content, targets, metadata }) {
  const normalizedTargets = normalizeTargets(targets)
  if (normalizedTargets.length === 0) {
    return {
      success: false,
      error_code: 'EMPTY_TARGETS',
      error_message: '没有可发送的目标',
      response: {
        target_count: 0,
        results: [],
      },
    }
  }

  const sendControl = await getSendControlConfig()
  if (sendControl.mode === 'shadow') {
    const skippedResults = normalizedTargets.map((target) =>
      buildSkippedResult(target, 'SEND_SKIPPED_BY_MODE', '当前为 shadow 模式，仅记录日志不发送'),
    )
    return {
      success: true,
      skipped: true,
      partial_success: false,
      partial_failed: false,
      partial_skipped: true,
      error_code: 'SEND_SKIPPED_BY_MODE',
      error_message: '当前为 shadow 模式，仅记录日志不发送',
      response: {
        target_count: skippedResults.length,
        success_count: 0,
        failure_count: 0,
        skipped_count: skippedResults.length,
        results: skippedResults,
      },
    }
  }

  let allowedTargets = normalizedTargets
  const preSkippedResults = []
  if (sendControl.mode === 'whitelist') {
    allowedTargets = []
    for (const target of normalizedTargets) {
      if (isTargetAllowedByWhitelist(target, sendControl)) {
        allowedTargets.push(target)
      } else {
        preSkippedResults.push(
          buildSkippedResult(target, 'SEND_SKIPPED_BY_WHITELIST', '不在通知白名单中，已跳过发送'),
        )
      }
    }
    if (allowedTargets.length === 0) {
      return {
        success: true,
        skipped: true,
        partial_success: false,
        partial_failed: false,
        partial_skipped: true,
        error_code: 'SEND_SKIPPED_BY_WHITELIST',
        error_message: '当前为 whitelist 模式，且接收目标不在白名单中',
        response: {
          target_count: preSkippedResults.length,
          success_count: 0,
          failure_count: 0,
          skipped_count: preSkippedResults.length,
          results: preSkippedResults,
        },
      }
    }
  }

  const tokenResult = await getTenantAccessToken()
  if (!tokenResult.success) {
    return {
      success: false,
      error_code: tokenResult.error_code || 'TOKEN_ERROR',
      error_message: tokenResult.error_message || '获取飞书 token 失败',
      response: tokenResult.response || {},
    }
  }

  const { timeoutMs } = pickFeishuConfig()
  const text = buildTextMessage({ title, content, metadata })
  const markdown = buildMarkdownMessage({ content })
  const detailUrl = normalizeHttpUrl(metadata?.detail_url)

  const results = [...preSkippedResults]
  let successCount = 0

  for (const target of allowedTargets) {
    const receiveIdType = target.target_type === 'chat' ? 'chat_id' : 'open_id'

    try {
      const targetActionUrl = buildTargetActionUrl(detailUrl, target)
      let sent = await sendFeishuMessage({
        token: tokenResult.token,
        receiveIdType,
        receiveId: target.target_id,
        messageBody: buildInteractiveCardPayload({
          title,
          markdown,
          actionUrl: targetActionUrl,
          actionText: metadata?.detail_action_text || '查看详情',
        }),
        timeoutMs,
      })

      if (!sent.success) {
        sent = await sendFeishuMessage({
          token: tokenResult.token,
          receiveIdType,
          receiveId: target.target_id,
          messageBody: {
            msg_type: 'text',
            content: JSON.stringify({ text }),
          },
          timeoutMs,
        })
      }

      if (sent.success) successCount += 1

      results.push({
        target_type: target.target_type,
        target_id: target.target_id,
        target_name: target.target_name,
        skipped: false,
        success: sent.success,
        error_code: sent.error_code || null,
        error_message: sent.error_message || null,
        response: sent.response || {},
      })
    } catch (error) {
      results.push({
        target_type: target.target_type,
        target_id: target.target_id,
        target_name: target.target_name,
        skipped: false,
        success: false,
        error_code: 'FEISHU_SEND_REQUEST_FAILED',
        error_message: error?.message || '调用飞书发送接口失败',
        response: {},
      })
    }
  }

  const failureCount = results.filter((item) => !item.success && !item.skipped).length
  const skippedCount = results.filter((item) => item.skipped).length
  const hasOnlySkipped = successCount === 0 && failureCount === 0 && skippedCount > 0

  return {
    success: successCount > 0 || hasOnlySkipped,
    skipped: hasOnlySkipped,
    partial_success: successCount > 0 && (failureCount > 0 || skippedCount > 0),
    partial_failed: successCount > 0 && failureCount > 0,
    partial_skipped: successCount > 0 && skippedCount > 0,
    error_code: successCount > 0 ? null : hasOnlySkipped ? 'SEND_SKIPPED_BY_MODE' : 'ALL_TARGETS_FAILED',
    error_message: successCount > 0 ? null : hasOnlySkipped ? '发送被策略跳过' : '所有目标发送失败',
    response: {
      target_count: results.length,
      success_count: successCount,
      failure_count: failureCount,
      skipped_count: skippedCount,
      results,
    },
  }
}

async function sendNotification({
  channelType,
  title,
  content,
  targets,
  metadata,
}) {
  const channel = normalizeText(channelType, 32).toLowerCase()
  if (!channel) {
    return {
      success: false,
      error_code: 'INVALID_CHANNEL',
      error_message: 'channelType 不能为空',
      response: {},
    }
  }

  if (channel !== 'feishu') {
    return {
      success: false,
      error_code: 'UNSUPPORTED_CHANNEL',
      error_message: `不支持的通知渠道: ${channel}`,
      response: {},
    }
  }

  return sendByFeishuApp({ title, content, targets, metadata })
}

module.exports = {
  sendNotification,
  getNotificationSendControl,
  updateNotificationSendControl,
  listFeishuChats,
  createFeishuDemandChat,
}
