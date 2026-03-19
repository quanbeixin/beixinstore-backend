const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// 创建数据库连接池
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+08:00'
});

// 测试数据库连接
const testConnection = async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ 数据库连接成功');
    conn.release();
  } catch (err) {
    console.error('❌ 数据库连接失败:', err.message);
  }
};

testConnection();

module.exports = pool;
