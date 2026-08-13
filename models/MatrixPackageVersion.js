const pool = require('../utils/db')

function toPositiveInt(value) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function normalizeText(value, maxLength = 255) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

const VERSION_STATUS = {
  OPERATING: { code: 'OPERATING', name: '运营中', color: 'green' },
  IN_REVIEW: { code: 'IN_REVIEW', name: '审核中', color: 'gold' },
  APPLICATION_SUBMITTED: { code: 'APPLICATION_SUBMITTED', name: '已申请', color: 'cyan' },
  PENDING_SUBMISSION: { code: 'PENDING_SUBMISSION', name: '待送审', color: 'blue' },
  HISTORICAL: { code: 'HISTORICAL', name: '历史版本', color: 'default' },
}

function normalizeVersionKey(value) {
  return String(value || '').trim().toLowerCase()
}

function resolveVersionStatus({ versionNumber, releaseStatuses, latestListedVersionNumber, isLatestVersion }) {
  if (releaseStatuses.has('IN_REVIEW')) return VERSION_STATUS.IN_REVIEW
  if (['PENDING_PLAN', 'QUEUED'].some((status) => releaseStatuses.has(status))) {
    return VERSION_STATUS.APPLICATION_SUBMITTED
  }
  if (releaseStatuses.has('REJECTED')) {
    return VERSION_STATUS.PENDING_SUBMISSION
  }
  if (versionNumber && versionNumber === latestListedVersionNumber) return VERSION_STATUS.OPERATING
  if (releaseStatuses.size === 0 && isLatestVersion) return VERSION_STATUS.PENDING_SUBMISSION
  return VERSION_STATUS.HISTORICAL
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
    const [[versionRows], [releaseRows]] = await Promise.all([
      pool.query(
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
      ),
      pool.query(
        `SELECT app_version, release_status
         FROM app_version_releases
         WHERE matrix_package_id = ? AND deleted_at IS NULL
         ORDER BY
           CASE WHEN release_status = 'LISTED' THEN 0 ELSE 1 END,
           COALESCE(listed_at, updated_at, created_at) DESC,
           id DESC`,
        [packageId],
      ),
    ])

    const releaseStatusesByVersion = new Map()
    releaseRows.forEach((release) => {
      const versionKey = normalizeVersionKey(release.app_version)
      if (!versionKey) return
      if (!releaseStatusesByVersion.has(versionKey)) releaseStatusesByVersion.set(versionKey, new Set())
      releaseStatusesByVersion.get(versionKey).add(String(release.release_status || '').trim().toUpperCase())
    })
    const latestListedVersionNumber = normalizeVersionKey(
      releaseRows.find((release) => release.release_status === 'LISTED' && normalizeVersionKey(release.app_version))
        ?.app_version,
    )

    return versionRows.map((row, index) => {
      const version = mapRow(row)
      const versionKey = normalizeVersionKey(version.version_number)
      const status = resolveVersionStatus({
        versionNumber: versionKey,
        releaseStatuses: releaseStatusesByVersion.get(versionKey) || new Set(),
        latestListedVersionNumber,
        isLatestVersion: index === 0,
      })
      return {
        ...version,
        version_status: status.code,
        version_status_name: status.name,
        version_status_color: status.color,
      }
    })
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
