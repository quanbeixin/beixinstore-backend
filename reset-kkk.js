const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

const envFile = process.env.ENV_FILE || ".env";
dotenv.config({ path: envFile });

(async () => {
  const username = "kkk";
  const plain = "123456";

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const hash = await bcrypt.hash(plain, 10);

  const [ret] = await conn.query(
    "UPDATE users SET password = ?, status_code = ? WHERE username = ?",
    [hash, "ACTIVE", username]
  );

  const [rows] = await conn.query(
    "SELECT username, status_code, password FROM users WHERE username = ?",
    [username]
  );

  let ok = false;
  let pwdLen = 0;
  if (rows.length > 0) {
    ok = await bcrypt.compare(plain, rows[0].password);
    pwdLen = rows[0].password.length;
  }

  console.log({
    envFile,
    db: process.env.DB_NAME,
    affected: ret.affectedRows,
    user: rows[0] ? rows[0].username : null,
    status: rows[0] ? rows[0].status_code : null,
    pwd_len: pwdLen,
    compare_123456: ok,
  });

  await conn.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
