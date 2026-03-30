const rateLimit = require('express-rate-limit')

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
const apiMax = parsePositiveInt(process.env.API_RATE_LIMIT_MAX, 1000)
const apiSkipOptions = parseBoolean(process.env.API_RATE_LIMIT_SKIP_OPTIONS, true)
const apiSkipLogin = parseBoolean(process.env.API_RATE_LIMIT_SKIP_LOGIN, true)

const loginWindowMs = parsePositiveInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000)
const loginMax = parsePositiveInt(process.env.LOGIN_RATE_LIMIT_MAX, 20)

// API请求频率限制
const apiLimiter = rateLimit({
  windowMs: apiWindowMs,
  max: apiMax,
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
