const dns = require('dns/promises')
const net = require('net')

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'])
const DEFAULT_TIMEOUT_MS = 15000
const MAX_TIMEOUT_MS = 30000
const MAX_RESPONSE_CHARS = 200000

function normalizeMethod(value) {
  const method = String(value || 'GET').trim().toUpperCase()
  return ALLOWED_METHODS.has(method) ? method : ''
}

function normalizeTimeout(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(Math.round(numeric), 1000), MAX_TIMEOUT_MS)
}

function normalizeObject(value, fieldName) {
  if (value === undefined || value === null || value === '') return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return normalizeObject(parsed, fieldName)
    } catch {
      const err = new Error(`${fieldName}_invalid`)
      err.statusCode = 400
      err.message = `${fieldName} 必须是合法 JSON 对象`
      throw err
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    const err = new Error(`${fieldName}_invalid`)
    err.statusCode = 400
    err.message = `${fieldName} 必须是对象`
    throw err
  }
  return value
}

function sanitizeHeaders(input) {
  const blocked = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade'])
  const output = {}
  Object.entries(input || {}).forEach(([key, value]) => {
    const name = String(key || '').trim()
    if (!name || blocked.has(name.toLowerCase())) return
    if (value === undefined || value === null) return
    output[name] = String(value)
  })
  return output
}

function appendQueryParams(url, query) {
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null) url.searchParams.append(key, String(item))
      })
      return
    }
    url.searchParams.set(key, String(value))
  })
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

function isPrivateIpv6(address) {
  const normalized = String(address || '').toLowerCase()
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('ff')
  )
}

function isBlockedAddress(address) {
  const family = net.isIP(address)
  if (family === 4) return isPrivateIpv4(address)
  if (family === 6) return isPrivateIpv6(address)
  return true
}

async function assertSafeTarget(url) {
  const hostname = String(url.hostname || '').trim().toLowerCase()
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    const err = new Error('target_not_allowed')
    err.statusCode = 400
    err.message = '不允许请求本机或内网地址'
    throw err
  }

  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      const err = new Error('target_not_allowed')
      err.statusCode = 400
      err.message = '不允许请求本机或内网地址'
      throw err
    }
    return
  }

  let addresses = []
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  } catch {
    const err = new Error('dns_lookup_failed')
    err.statusCode = 400
    err.message = '目标域名解析失败'
    throw err
  }

  if (addresses.length === 0 || addresses.some((item) => isBlockedAddress(item.address))) {
    const err = new Error('target_not_allowed')
    err.statusCode = 400
    err.message = '不允许请求本机或内网地址'
    throw err
  }
}

function normalizeBody(payload, headers) {
  const method = normalizeMethod(payload.method)
  if (method === 'GET' || method === 'HEAD') return undefined

  const bodyType = String(payload.body_type || 'json').trim().toLowerCase()
  if (payload.body === undefined || payload.body === null || payload.body === '') return undefined

  if (bodyType === 'json') {
    headers['Content-Type'] = headers['Content-Type'] || headers['content-type'] || 'application/json'
    return typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body)
  }

  return typeof payload.body === 'string' ? payload.body : JSON.stringify(payload.body)
}

function responseHeadersToObject(headers) {
  const output = {}
  headers.forEach((value, key) => {
    output[key] = value
  })
  return output
}

async function proxyDebugRequest(req, res) {
  const startedAt = Date.now()
  try {
    const method = normalizeMethod(req.body?.method)
    if (!method) {
      return res.status(400).json({ success: false, message: '请求方法不支持' })
    }

    let targetUrl
    try {
      targetUrl = new URL(String(req.body?.url || '').trim())
    } catch {
      return res.status(400).json({ success: false, message: 'URL 格式错误' })
    }

    if (!ALLOWED_PROTOCOLS.has(targetUrl.protocol)) {
      return res.status(400).json({ success: false, message: '仅支持 HTTP/HTTPS URL' })
    }

    const query = normalizeObject(req.body?.query, 'Query')
    const rawHeaders = normalizeObject(req.body?.headers, 'Headers')
    appendQueryParams(targetUrl, query)
    await assertSafeTarget(targetUrl)

    const headers = sanitizeHeaders(rawHeaders)
    const body = normalizeBody({ ...req.body, method }, headers)
    const timeoutMs = normalizeTimeout(req.body?.timeout_ms)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let upstream
    try {
      upstream = await fetch(targetUrl.toString(), {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const rawBody = await upstream.text()
    const truncated = rawBody.length > MAX_RESPONSE_CHARS
    const responseBody = truncated ? rawBody.slice(0, MAX_RESPONSE_CHARS) : rawBody

    return res.json({
      success: true,
      data: {
        url: targetUrl.toString(),
        final_url: upstream.url,
        method,
        status: upstream.status,
        status_text: upstream.statusText,
        ok: upstream.ok,
        duration_ms: Date.now() - startedAt,
        headers: responseHeadersToObject(upstream.headers),
        body: responseBody,
        body_truncated: truncated,
      },
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ success: false, message: '请求超时' })
    }
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message || '请求参数错误' })
    }
    console.error('矩阵包接口调试请求失败:', error)
    return res.status(500).json({ success: false, message: error?.message || '接口调试请求失败' })
  }
}

module.exports = {
  proxyDebugRequest,
}
