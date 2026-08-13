const pool = require('../utils/db')

function toPositiveInt(value) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function normalizeText(value, maxLength = 255) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function mapRow(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    matrix_package_id: Number(row.matrix_package_id),
    version_number: row.version_number || '',
    version_info: row.version_info || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

const MatrixPackageVersion = {
  async upsert({ matrixPackageId, versionNumber, versionInfo }) {
    const packageId = toPositiveInt(matrixPackageId)
    const normalizedVersionNumber = normalizeText(versionNumber, 80)
    if (!packageId) {
      const error = new Error('矩阵包ID不合法')
      error.statusCode = 400
      throw error
    }
    if (!normalizedVersionNumber) {
      const error = new Error('version_number 不能为空')
      error.statusCode = 400
      throw error
    }

    await pool.query(
      `INSERT INTO matrix_package_versions
       (matrix_package_id, version_number, version_info)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         version_info = VALUES(version_info),
         updated_at = CURRENT_TIMESTAMP`,
      [packageId, normalizedVersionNumber, normalizeText(versionInfo, 100000)],
    )
    return this.getByPackageAndNumber(packageId, normalizedVersionNumber)
  },

  async listByPackageId(matrixPackageId) {
    const packageId = toPositiveInt(matrixPackageId)
    if (!packageId) return []
    const [rows] = await pool.query(
      `SELECT
         id,
         matrix_package_id,
         version_number,
         version_info,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM matrix_package_versions
       WHERE matrix_package_id = ?
       ORDER BY updated_at DESC, id DESC`,
      [packageId],
    )
    return rows.map(mapRow)
  },

  async getByPackageAndNumber(matrixPackageId, versionNumber) {
    const packageId = toPositiveInt(matrixPackageId)
    const normalizedVersionNumber = normalizeText(versionNumber, 80)
    if (!packageId || !normalizedVersionNumber) return null
    const [rows] = await pool.query(
      `SELECT
         id,
         matrix_package_id,
         version_number,
         version_info,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM matrix_package_versions
       WHERE matrix_package_id = ? AND version_number = ?
       LIMIT 1`,
      [packageId, normalizedVersionNumber],
    )
    return mapRow(rows[0])
  },

  async getById(matrixPackageId, versionId) {
    const packageId = toPositiveInt(matrixPackageId)
    const id = toPositiveInt(versionId)
    if (!packageId || !id) return null
    const [rows] = await pool.query(
      `SELECT
         id,
         matrix_package_id,
         version_number,
         version_info,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM matrix_package_versions
       WHERE matrix_package_id = ? AND id = ?
       LIMIT 1`,
      [packageId, id],
    )
    return mapRow(rows[0])
  },
}

module.exports = MatrixPackageVersion
