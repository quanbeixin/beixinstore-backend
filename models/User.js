const pool = require('../utils/db');

const User = {
  // 根据用户名查找用户（含密码，用于登录验证）
  findByUsername: async (username) => {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    return rows[0] || null;
  },

  // 根据 ID 查找用户，关联角色和部门信息
  findById: async (id) => {
    const [rows] = await pool.query(
      `SELECT
         u.id, u.username, u.email, u.department_id, u.created_at,
         d.name AS department_name,
         GROUP_CONCAT(r.id) AS role_ids,
         GROUP_CONCAT(r.name) AS role_names
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.id = ?
       GROUP BY u.id`,
      [id]
    );
    return rows[0] || null;
  },

  // 获取用户列表（分页），关联角色和部门
  findAll: async ({ page = 1, pageSize = 10, keyword = '' }) => {
    const offset = (page - 1) * pageSize;
    const like = `%${keyword}%`;

    const [rows] = await pool.query(
      `SELECT
         u.id, u.username, u.email, u.department_id, u.created_at,
         d.name AS department_name,
         GROUP_CONCAT(r.name) AS role_names
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.username LIKE ? OR u.email LIKE ?
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [like, like, pageSize, offset]
    );

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM users WHERE username LIKE ? OR email LIKE ?',
      [like, like]
    );

    return { rows, total };
  },

  // 创建新用户
  create: async ({ username, password, email = null, department_id = null }) => {
    const [result] = await pool.query(
      'INSERT INTO users (username, password, email, department_id) VALUES (?, ?, ?, ?)',
      [username, password, email, department_id]
    );
    return result.insertId;
  },

  // 更新用户基本信息
  update: async (id, { email, department_id }) => {
    const [result] = await pool.query(
      'UPDATE users SET email = ?, department_id = ? WHERE id = ?',
      [email, department_id, id]
    );
    return result.affectedRows;
  },

  // 删除用户（同时清理 user_roles 关联）
  delete: async (id) => {
    await pool.query('DELETE FROM user_roles WHERE user_id = ?', [id]);
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
    return result.affectedRows;
  },

  // 设置用户角色（先清空再写入）
  setRoles: async (userId, roleIds = []) => {
    await pool.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    if (roleIds.length === 0) return;
    const values = roleIds.map((rid) => [userId, rid]);
    await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ?', [values]);
  }
};

module.exports = User;
