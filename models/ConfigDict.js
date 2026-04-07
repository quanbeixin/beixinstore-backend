const pool = require('../utils/db')

const ConfigDict = {
  async listTypes({ enabledOnly = false } = {}) {
    const whereSql = enabledOnly ? 'WHERE enabled = 1' : ''
    const [rows] = await pool.query(
      `SELECT id, type_key, type_name, description, enabled, is_builtin, created_at, updated_at
       FROM config_dict_types
       ${whereSql}
       ORDER BY is_builtin DESC, type_name ASC`,
    )
    return rows
  },

  async getTypeByKey(typeKey) {
    const [rows] = await pool.query(
      `SELECT id, type_key, type_name, description, enabled, is_builtin, created_at, updated_at
       FROM config_dict_types
       WHERE type_key = ?`,
      [typeKey],
    )
    return rows[0] || null
  },

  async createType({ typeKey, typeName, description = null, enabled = 1, isBuiltin = 0 }) {
    const [result] = await pool.query(
      `INSERT INTO config_dict_types (type_key, type_name, description, enabled, is_builtin)
       VALUES (?, ?, ?, ?, ?)`,
      [typeKey, typeName, description, enabled, isBuiltin],
    )
    return result.insertId
  },

  async updateType(typeKey, { typeName, description = null, enabled }) {
    const [result] = await pool.query(
      `UPDATE config_dict_types
       SET type_name = ?, description = ?, enabled = ?
       WHERE type_key = ?`,
      [typeName, description, enabled, typeKey],
    )
    return result.affectedRows
  },

  async deleteType(typeKey) {
    const [result] = await pool.query(
      'DELETE FROM config_dict_types WHERE type_key = ?',
      [typeKey],
    )
    return result.affectedRows
  },

  async countItemsByType(typeKey) {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS total FROM config_dict_items WHERE type_key = ?',
      [typeKey],
    )
    return rows[0].total
  },

  async listItems(typeKey, { enabledOnly = false } = {}) {
    const whereSql = enabledOnly ? 'AND enabled = 1' : ''
    const [rows] = await pool.query(
      `SELECT id, type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json, created_at, updated_at
       FROM config_dict_items
       WHERE type_key = ? ${whereSql}
       ORDER BY sort_order ASC, id ASC`,
      [typeKey],
    )
    return rows
  },

  async getItemById(id) {
    const [rows] = await pool.query(
      `SELECT id, type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json, created_at, updated_at
       FROM config_dict_items
       WHERE id = ?`,
      [id],
    )
    return rows[0] || null
  },

  async getItemByCode(typeKey, itemCode) {
    const [rows] = await pool.query(
      `SELECT id, type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json, created_at, updated_at
       FROM config_dict_items
       WHERE type_key = ? AND item_code = ?`,
      [typeKey, itemCode],
    )
    return rows[0] || null
  },

  async createItem({
    typeKey,
    itemCode,
    itemName,
    sortOrder = 0,
    enabled = 1,
    color = null,
    remark = null,
    extraJson = null,
  }) {
    const [result] = await pool.query(
      `INSERT INTO config_dict_items
       (type_key, item_code, item_name, sort_order, enabled, color, remark, extra_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [typeKey, itemCode, itemName, sortOrder, enabled, color, remark, extraJson],
    )
    return result.insertId
  },

  async updateItem(id, { itemName, sortOrder = 0, enabled = 1, color = null, remark = null, extraJson = null }) {
    const [result] = await pool.query(
      `UPDATE config_dict_items
       SET item_name = ?, sort_order = ?, enabled = ?, color = ?, remark = ?, extra_json = ?
       WHERE id = ?`,
      [itemName, sortOrder, enabled, color, remark, extraJson, id],
    )
    return result.affectedRows
  },

  async deleteItem(id) {
    const [result] = await pool.query('DELETE FROM config_dict_items WHERE id = ?', [id])
    return result.affectedRows
  },
}

module.exports = ConfigDict
