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
const { apiLimiter } = require('./middleware/security')

const app = express()
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '0.0.0.0'
const LOG_OPTIONS_REQUESTS = process.env.LOG_OPTIONS_REQUESTS === 'true'

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
app.use('/api/work', workRoutes)
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

app.use((err, req, res, next) => {
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
  console.log(`Loaded env file: ${envFile}`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...')
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
