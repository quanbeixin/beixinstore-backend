const fs = require('fs')
const path = require('path')
const pool = require('../utils/db')
const { resolveEnvFile } = require('../utils/loadEnv')

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'sql', 'migrations')

function splitSqlStatements(sql) {
  const statements = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false
  let prevChar = ''

  for (const char of sql) {
    if (char === "'" && !inDoubleQuote && !inBacktick && prevChar !== '\\') {
      inSingleQuote = !inSingleQuote
    } else if (char === '"' && !inSingleQuote && !inBacktick && prevChar !== '\\') {
      inDoubleQuote = !inDoubleQuote
    } else if (char === '`' && !inSingleQuote && !inDoubleQuote && prevChar !== '\\') {
      inBacktick = !inBacktick
    }

    if (char === ';' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      const trimmed = current.trim()
      if (trimmed) {
        statements.push(trimmed)
      }
      current = ''
      prevChar = char
      continue
    }

    current += char
    prevChar = char
  }

  const trimmed = current.trim()
  if (trimmed) {
    statements.push(trimmed)
  }

  return statements
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return []
  }

  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort()
}

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_schema_migrations_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

async function getExecutedMigrations() {
  const [rows] = await pool.query(`
    SELECT filename
    FROM schema_migrations
    ORDER BY filename ASC
  `)

  return new Set(rows.map((row) => String(row.filename)))
}

async function run() {
  const dryRun = process.argv.includes('--dry-run')
  const envFile = resolveEnvFile()
  const files = getMigrationFiles()

  console.log(`[migration] env file: ${envFile}`)
  console.log(`[migration] migrations dir: ${MIGRATIONS_DIR}`)

  if (files.length === 0) {
    console.log('[migration] no migration files found')
    return
  }

  await ensureMigrationsTable()
  const executed = await getExecutedMigrations()
  const pending = files.filter((filename) => !executed.has(filename))

  if (pending.length === 0) {
    console.log('[migration] no pending migrations')
    return
  }

  console.log(`[migration] pending count: ${pending.length}`)
  pending.forEach((filename) => {
    console.log(`- ${filename}`)
  })

  if (dryRun) {
    console.log('[migration] dry run only, nothing executed')
    return
  }

  for (const filename of pending) {
    const filePath = path.join(MIGRATIONS_DIR, filename)
    const sql = fs.readFileSync(filePath, 'utf8').trim()
    const statements = splitSqlStatements(sql)

    if (!sql) {
      console.log(`[migration] skip empty file: ${filename}`)
      continue
    }

    if (statements.length === 0) {
      console.log(`[migration] skip file without executable statements: ${filename}`)
      continue
    }

    console.log(`[migration] executing: ${filename}`)

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      for (const statement of statements) {
        await conn.query(statement)
      }
      await conn.query(
        `INSERT INTO schema_migrations (filename) VALUES (?)`,
        [filename],
      )
      await conn.commit()
      console.log(`[migration] executed: ${filename}`)
    } catch (err) {
      await conn.rollback()
      console.error(`[migration] failed: ${filename}`)
      throw err
    } finally {
      conn.release()
    }
  }
}

run()
  .then(async () => {
    await pool.end()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error(err)
    try {
      await pool.end()
    } catch (closeErr) {
      console.error('[migration] failed to close pool:', closeErr.message)
    }
    process.exit(1)
  })
