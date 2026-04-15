const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const path = require('path')
const helmet = require('helmet')
const cookieParser = require('cookie-parser')

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env'
dotenv.config({ path: path.resolve(__dirname, envFile) })

const authRoutes = require('./routes/authRoutes')
const testRoutes = require('./routes/testRoutes')
const userRoutes = require('./routes/userRoutes')
const optionRoutes = require('./routes/optionRoutes')
const configRoutes = require('./routes/configRoutes')
const orgRoutes = require('./routes/orgRoutes')
const rbacRoutes = require('./routes/rbacRoutes')
const workRoutes = require('./routes/workRoutes')
const notificationRuleRoutes = require('./routes/notificationRuleRoutes')
const notificationEventRoutes = require('./routes/notificationEventRoutes')
const agentRoutes = require('./routes/agentRoutes')
const integrationRoutes = require('./routes/integrationRoutes')
const userFeedbackRoutes = require('./routes/userFeedbackRoutes')
const userFeedbackConfigRoutes = require('./routes/userFeedbackConfigRoutes')
const publicFeedbackRoutes = require('./routes/publicFeedbackRoutes')
const publicFeishuRoutes = require('./routes/publicFeishuRoutes')
const { apiLimiter, loginLimiter } = require('./middleware/security')
const notificationSchedulerService = require('./services/notificationSchedulerService')

const app = express()
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '0.0.0.0'
const LOG_OPTIONS_REQUESTS = process.env.LOG_OPTIONS_REQUESTS === 'true'

function resolveTrustProxy(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return false
  const normalized = String(rawValue).trim().toLowerCase()

  if (['0', 'false', 'off', 'no'].includes(normalized)) return false
  if (['1', 'true', 'on', 'yes'].includes(normalized)) return 1

  const numericValue = Number.parseInt(normalized, 10)
  if (Number.isFinite(numericValue) && numericValue >= 0) return numericValue

  return rawValue
}

const trustProxy = resolveTrustProxy(process.env.TRUST_PROXY)
app.set('trust proxy', trustProxy)

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser clients (curl/postman/server-to-server)
    if (!origin) {
      callback(null, true)
      return
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    console.warn(`[CORS] Blocked origin: ${origin}`)
    callback(null, false)
  },
  credentials: true,
}

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: false, // 如果需要可以自定义CSP策略
  crossOriginEmbedderPolicy: false,
}))
app.use(cookieParser())
app.use(cors(corsOptions))
app.options('*', cors(corsOptions))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// API请求频率限制
app.use('/api/auth/login', loginLimiter)
app.use('/api/', apiLimiter)

app.use((req, res, next) => {
  if (req.method === 'OPTIONS' && !LOG_OPTIONS_REQUESTS) {
    next()
    return
  }

  const startTime = Date.now()

  res.on('finish', () => {
    const costMs = Date.now() - startTime
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${costMs}ms)`,
    )
  })

  next()
})

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/options', optionRoutes)
app.use('/api/config', configRoutes)
app.use('/api/org', orgRoutes)
app.use('/api/rbac', rbacRoutes)
app.use('/api/agents', agentRoutes)
app.use('/api/work', workRoutes)
app.use('/api/integrations', integrationRoutes)
app.use('/api/notification/rules', notificationRuleRoutes)
app.use('/api/notification', notificationEventRoutes)
app.use('/api/feedback', userFeedbackRoutes)
app.use('/api/ai-config', userFeedbackConfigRoutes)
app.use('/api/public/feedback', publicFeedbackRoutes)
app.use('/api/public/feishu', publicFeishuRoutes)
app.use('/api', testRoutes)

app.get('/', (req, res) => {
  res.json({
    message: 'Admin API service',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  })
})

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
})

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
  })
})

app.use((err, req, res, _next) => {
  console.error('Server error:', err)
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  })
})

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`CORS origins: ${allowedOrigins.join(', ') || 'none'}`)
  console.log(`Trust proxy: ${String(trustProxy)}`)
  console.log(`Loaded env file: ${envFile}`)
  notificationSchedulerService.start()
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  notificationSchedulerService.stop()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...')
  notificationSchedulerService.stop()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
  process.exit(1)
})
