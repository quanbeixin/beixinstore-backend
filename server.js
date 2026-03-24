const express = require('express')
const cors = require('cors')
const { loadEnv } = require('./utils/loadEnv')

const { envFile } = loadEnv()

const authRoutes = require('./routes/authRoutes')
const testRoutes = require('./routes/testRoutes')
const userRoutes = require('./routes/userRoutes')
const optionRoutes = require('./routes/optionRoutes')
const configRoutes = require('./routes/configRoutes')
const orgRoutes = require('./routes/orgRoutes')
const rbacRoutes = require('./routes/rbacRoutes')
const workRoutes = require('./routes/workRoutes')
const projectRoutes = require('./routes/projectRoutes')
const requirementRoutes = require('./routes/requirementRoutes')
const bugRoutes = require('./routes/bugRoutes')
const projectStatsRoutes = require('./routes/projectStatsRoutes')
const { initializeProjectManagementModule, isLegacyBootstrapEnabled } = require('./models/ProjectManagementInit')

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

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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
app.use('/api/projects', projectRoutes)
app.use('/api/requirements', requirementRoutes)
app.use('/api/bugs', bugRoutes)
app.use('/api/project-stats', projectStatsRoutes)
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

let server = null

async function startServer() {
  await initializeProjectManagementModule()

  server = app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`)
    console.log(`Environment: ${process.env.APP_ENV || process.env.NODE_ENV || 'development'}`)
    console.log(`CORS origins: ${allowedOrigins.join(', ') || 'none'}`)
    console.log(`Loaded env file: ${envFile}`)
    console.log(`Legacy bootstrap: ${isLegacyBootstrapEnabled() ? 'enabled' : 'disabled'}`)
    console.log('Server startup checks completed')
  })
}

startServer().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
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
