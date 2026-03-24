const mysql = require('mysql2/promise')
const { loadEnv } = require('./loadEnv')

loadEnv()

const DB_TIME_ZONE = process.env.DB_TIME_ZONE || '+08:00'

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: DB_TIME_ZONE,
  // Return DATE/DATETIME/TIMESTAMP as strings to avoid implicit timezone conversion to UTC.
  dateStrings: true,
})

const rawPool = pool.pool
if (rawPool && typeof rawPool.on === 'function') {
  rawPool.on('connection', (connection) => {
    connection.query(`SET time_zone = '${DB_TIME_ZONE}'`, (err) => {
      if (err) {
        console.error('Failed to set MySQL session time_zone:', err.message)
      }
    })
  })
}

async function testConnection() {
  try {
    const conn = await pool.getConnection()
    await conn.query(`SET time_zone = '${DB_TIME_ZONE}'`)
    console.log(`MySQL connected. session time_zone forced to ${DB_TIME_ZONE}`)
    conn.release()
  } catch (err) {
    console.error('MySQL connection failed:', err.message)
  }
}

testConnection()

module.exports = pool
