const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const mysql = require('mysql2/promise')

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: node apply_migration_sql.js <relative-sql-path>')
    process.exit(2)
  }
  const sqlPath = path.resolve(__dirname, '..', arg)
  if (!fs.existsSync(sqlPath)) {
    console.error('SQL file not found:', sqlPath)
    process.exit(2)
  }
  const sql = fs.readFileSync(sqlPath, 'utf8')

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  })

  try {
    console.log('Applying migration:', sqlPath)
    await conn.query(sql)
    console.log('Migration applied successfully')
  } catch (err) {
    console.error('Migration failed:', err)
    process.exitCode = 1
  } finally {
    await conn.end()
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
