#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')
const dotenv = require('dotenv')

const backendRoot = path.resolve(__dirname, '../../')
dotenv.config({ path: path.join(backendRoot, '.env') })

function required(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required env: ${name}`)
  }
  return value
}

function parseSqlStatements(sqlText) {
  const statements = []
  let delimiter = ';'
  let buffer = ''
  const lines = sqlText.split(/\r?\n/)

  const flushByDelimiter = () => {
    let index = buffer.indexOf(delimiter)
    while (index !== -1) {
      const chunk = buffer.slice(0, index).trim()
      if (chunk) {
        statements.push(chunk)
      }
      buffer = buffer.slice(index + delimiter.length)
      index = buffer.indexOf(delimiter)
    }
  }

  for (const rawLine of lines) {
    const line = rawLine
    const trimmed = line.trim()

    if (/^DELIMITER\s+/i.test(trimmed)) {
      flushByDelimiter()
      delimiter = trimmed.replace(/^DELIMITER\s+/i, '').trim()
      continue
    }

    buffer += `${line}\n`
    flushByDelimiter()
  }

  const remain = buffer.trim()
  if (remain) statements.push(remain)
  return statements
}

async function runFile(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath)
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`SQL file not found: ${absolutePath}`)
  }

  const sqlText = fs.readFileSync(absolutePath, 'utf8')
  const statements = parseSqlStatements(sqlText)
  if (statements.length === 0) {
    console.log(`[WARN] no executable statement in ${absolutePath}`)
    return
  }

  const connection = await mysql.createConnection({
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT || 3306),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    database: required('DB_NAME'),
    timezone: process.env.DB_TIME_ZONE || '+08:00',
    dateStrings: true,
    multipleStatements: false,
  })

  try {
    console.log(`[INFO] executing ${statements.length} statements from ${path.basename(absolutePath)}`)
    for (let i = 0; i < statements.length; i += 1) {
      const sql = statements[i]
      const [rows] = await connection.query(sql)
      const type = sql.trim().split(/\s+/)[0].toUpperCase()

      if (Array.isArray(rows) && (type === 'SELECT' || type === 'EXECUTE')) {
        console.log(`\n[RESULT ${i + 1}/${statements.length}] ${type} returned ${rows.length} row(s)`)
        if (rows.length > 0) {
          console.table(rows)
        }
      }
    }
    console.log(`[DONE] ${path.basename(absolutePath)} executed successfully`)
  } finally {
    await connection.end()
  }
}

async function main() {
  const input = process.argv[2]
  if (!input) {
    console.error('Usage: node run-sql-with-mysql2.js <sql-file-path>')
    process.exit(1)
  }
  await runFile(input)
}

main().catch((err) => {
  console.error('[ERROR]', err.message || err)
  process.exit(1)
})
