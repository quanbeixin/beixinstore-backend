const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

function resolveEnvFile() {
  if (process.env.ENV_FILE) {
    return process.env.ENV_FILE
  }

  const appEnv = String(process.env.APP_ENV || process.env.NODE_ENV || 'development')
    .trim()
    .toLowerCase()

  if (appEnv === 'production') {
    return '.env.production'
  }

  if (appEnv === 'staging' || appEnv === 'test') {
    return '.env.staging'
  }

  return '.env'
}

function loadEnv() {
  const envFile = resolveEnvFile()
  const envPath = path.resolve(__dirname, '..', envFile)

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath })
  } else {
    dotenv.config()
  }

  return {
    envFile,
    envPath,
  }
}

module.exports = {
  loadEnv,
  resolveEnvFile,
}
