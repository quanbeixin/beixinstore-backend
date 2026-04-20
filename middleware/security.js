const rateLimit = require('express-rate-limit')
const { verifyToken } = require('../utils/jwt')

function parsePositiveInt(rawValue, fallbackValue) {
  const parsed = Number.parseInt(String(rawValue || '').trim(), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackValue
  return parsed
}

function parseBoolean(rawValue, fallbackValue = false) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return fallbackValue
  const normalized = String(rawValue).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallbackValue
}

const apiWindowMs = parsePositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
const apiMax = parsePositiveInt(process.env.API_RATE_LIMIT_MAX, 5000)
const apiSkipOptions = parseBoolean(process.env.API_RATE_LIMIT_SKIP_OPTIONS, true)
const apiSkipLogin = parseBoolean(process.env.API_RATE_LIMIT_SKIP_LOGIN, true)

const loginWindowMs = parsePositiveInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
const loginMax = parsePositiveInt(process.env.LOGIN_RATE_LIMIT_MAX, 20)

function resolveBearerToken(req) {
  const authHeader = String(req?.headers?.authorization || '').trim()
  if (!authHeader.startsWith('Bearer ')) return ''
  return authHeader.slice(7).trim()
}

function resolveRateLimitUserKey(req) {
  const explicitUserId = Number(req?.user?.id)
  if (Number.isInteger(explicitUserId) && explicitUserId > 0) {
    return `user:${explicitUserId}`
  }

  const token = resolveBearerToken(req)
  if (!token) return ''

  try {
    const decoded = verifyToken(token)
    const tokenUserId = Number(decoded?.id || decoded?.user_id)
    if (Number.isInteger(tokenUserId) && tokenUserId > 0) {
      return `user:${tokenUserId}`
    }
  } catch {
    return ''
  }

  return ''
}

// API请求频率限制
const apiLimiter = rateLimit({
  windowMs: apiWindowMs,
  max: apiMax,
  keyGenerator: (req) => {
    const userKey = resolveRateLimitUserKey(req)
    if (userKey) return userKey
    return req.ip || req.headers['x-forwarded-for'] || 'unknown'
  },
  skip: (req) => {
    if (apiSkipOptions && req.method === 'OPTIONS') return true
    if (apiSkipLogin && req.path === '/auth/login') return true
    return false
  },
  message: {
    success: false,
    message: '请求过于频繁，请稍后再试',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// 登录接口特殊限制
const loginLimiter = rateLimit({
  windowMs: loginWindowMs,
  max: loginMax,
  skip: (req) => apiSkipOptions && req.method === 'OPTIONS',
  message: {
    success: false,
    message: '登录尝试次数过多，请15分钟后再试',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

module.exports = {
  apiLimiter,
  loginLimiter,
}
