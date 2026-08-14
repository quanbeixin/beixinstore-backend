const pool = require('../utils/db')

const RELEASE_STATUS_META = {
  PENDING_PLAN: { name: '待规划', color: 'magenta' },
  QUEUED: { name: '排队中', color: 'geekblue' },
  IN_REVIEW: { name: '审核中', color: 'gold' },
  LISTED: { name: '已上架', color: 'lime' },
  REJECTED: { name: '被拒审', color: 'red' },
  CANCELLED: { name: '取消', color: 'default' },
}

const DEMAND_STATUS_META = {
  TODO: { name: '待处理', color: 'default' },
  IN_PROGRESS: { name: '进行中', color: 'processing' },
  PAUSED: { name: '已挂起', color: 'orange' },
  DONE: { name: '已完成', color: 'green' },
  CANCELLED: { name: '已取消', color: 'default' },
}

const COVERAGE_STATUS_META = {
  COVERED: { name: '已覆盖', color: 'green' },
  IN_REVIEW: { name: '审核中', color: 'gold' },
  APPLICATION_SUBMITTED: { name: '已申请', color: 'cyan' },
  INCLUDED_NOT_RELEASED: { name: '已包含未发版', color: 'blue' },
  NOT_INCLUDED: { name: '未包含', color: 'default' },
}

function toPositiveInt(value) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function normalizeText(value, maxLength = 255) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function normalizeMatchText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function stripJsonComments(value) {
  const source = String(value || '')
  let result = ''
  let inString = false
  let escaped = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]
    if (inString) {
      result += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      result += char
      continue
    }
    if (char === '/' && next === '/') {
      index += 2
      while (index < source.length && source[index] !== '\n') index += 1
      result += '\n'
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1
      index += 1
      continue
    }
    result += char
  }
  return result.replace(/,\s*([}\]])/g, '$1')
}

function parseFeatures(value) {
  const text = String(value || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(stripJsonComments(text))
    return Array.isArray(parsed?.features)
      ? parsed.features.map((item) => normalizeText(item, 500)).filter(Boolean)
      : []
  } catch {
    return []
  }
}

function buildReleaseSummary(releases = []) {
  const sorted = [...releases].sort((left, right) => {
    const leftListed = left.release_status === 'LISTED' ? 1 : 0
    const rightListed = right.release_status === 'LISTED' ? 1 : 0
    if (leftListed !== rightListed) return rightListed - leftListed
    return Number(right.id || 0) - Number(left.id || 0)
  })
  const current = sorted[0] || null
  const status = current ? String(current.release_status || '').toUpperCase() : ''
  return {
    release_id: current?.id ? Number(current.id) : null,
    release_request_no: current?.release_request_no || '',
    app_version: current?.app_version || '',
    release_status: status,
    release_status_name: RELEASE_STATUS_META[status]?.name || status || '',
    release_status_color: RELEASE_STATUS_META[status]?.color || 'default',
  }
}

function getCoverageStatus({ matchedVersions, releases }) {
  if (matchedVersions.length === 0) return COVERAGE_STATUS_META.NOT_INCLUDED
  if (releases.some((release) => release.release_status === 'LISTED')) return COVERAGE_STATUS_META.COVERED
  if (releases.some((release) => release.release_status === 'IN_REVIEW')) return COVERAGE_STATUS_META.IN_REVIEW
  if (releases.some((release) => ['PENDING_PLAN', 'QUEUED'].includes(release.release_status))) {
    return COVERAGE_STATUS_META.APPLICATION_SUBMITTED
  }
  return COVERAGE_STATUS_META.INCLUDED_NOT_RELEASED
}

function mapPackageCoverage(packageRow, versionRows, releaseRows, demandName) {
  const packageId = Number(packageRow.id)
  const matchedVersions = versionRows
    .filter((version) => parseFeatures(version.version_info).some((feature) => normalizeMatchText(feature) === normalizeMatchText(demandName)))
    .sort((left, right) => Number(right.id || 0) - Number(left.id || 0))
  const releases = releaseRows.filter((release) =>
    matchedVersions.some((version) => normalizeMatchText(version.version_number) === normalizeMatchText(release.app_version)),
  )
  const coverageStatus = getCoverageStatus({ matchedVersions, releases })
  const latestVersion = matchedVersions[0] || null
  const releaseSummary = buildReleaseSummary(releases)

  return {
    matrix_package_id: packageId,
    package_name: packageRow.package_name || '',
    app_id: packageRow.app_id || '',
    package_status_code: packageRow.status_code || '',
    package_status_name: packageRow.status_name || packageRow.status_code || '',
    package_status_color: packageRow.status_color || 'default',
    coverage_status: Object.keys(COVERAGE_STATUS_META).find((key) => COVERAGE_STATUS_META[key] === coverageStatus) || 'NOT_INCLUDED',
    coverage_status_name: coverageStatus.name,
    coverage_status_color: coverageStatus.color,
    matched_version_number: latestVersion?.version_number || '',
    matched_version_updated_at: latestVersion?.updated_at || null,
    matched_features: latestVersion ? parseFeatures(latestVersion.version_info) : [],
    ...releaseSummary,
  }
}

function mapDemandRow(row, packages, versionsByPackageId, releasesByPackageVersion) {
  const demandName = row.name || ''
  const packageCoverage = packages.map((packageRow) => {
    const packageId = Number(packageRow.id)
    const releaseMap = releasesByPackageVersion.get(packageId) || []
    return mapPackageCoverage(packageRow, versionsByPackageId.get(packageId) || [], releaseMap, demandName)
  })
  const counts = packageCoverage.reduce((result, item) => {
    result.total += 1
    if (item.coverage_status === 'COVERED') result.covered += 1
    if (item.coverage_status === 'IN_REVIEW') result.in_review += 1
    if (item.coverage_status === 'APPLICATION_SUBMITTED') result.application_submitted += 1
    if (item.coverage_status === 'INCLUDED_NOT_RELEASED') result.included_not_released += 1
    if (item.coverage_status === 'NOT_INCLUDED') result.not_included += 1
    return result
  }, { total: 0, covered: 0, in_review: 0, application_submitted: 0, included_not_released: 0, not_included: 0 })

  return {
    id: row.id,
    name: row.name || '',
    owner_user_id: row.owner_user_id ? Number(row.owner_user_id) : null,
    owner_name: row.owner_name || '',
    status: row.status || '',
    status_name: DEMAND_STATUS_META[row.status]?.name || row.status || '',
    status_color: DEMAND_STATUS_META[row.status]?.color || 'default',
    expected_release_date: row.expected_release_date || null,
    coverage_summary: counts,
    package_coverage: packageCoverage,
  }
}

const AppReleaseDemandCoverage = {
  async list(filters = {}) {
    const page = Math.max(toPositiveInt(filters.page) || 1, 1)
    const pageSize = Math.min(Math.max(toPositiveInt(filters.pageSize) || 20, 1), 100)
    const keyword = normalizeText(filters.keyword, 120)
    const status = normalizeText(filters.status, 32).toUpperCase()
    const conditions = ['COALESCE(d.requires_app_release, 0) = 1']
    const params = []
    if (keyword) {
      conditions.push('(d.id LIKE ? OR d.name LIKE ?)')
      params.push(`%${keyword}%`, `%${keyword}%`)
    }
    if (status && DEMAND_STATUS_META[status]) {
      conditions.push('d.status = ?')
      params.push(status)
    }
    const whereSql = conditions.join(' AND ')
    const [[countRows], [demandRows], [packageRows], [versionRows], [releaseRows]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total FROM work_demands d WHERE ${whereSql}`, params),
      pool.query(
        `SELECT
           d.id,
           d.name,
           d.owner_user_id,
           COALESCE(NULLIF(u.real_name, ''), u.username) AS owner_name,
           d.status,
           DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS expected_release_date
         FROM work_demands d
         LEFT JOIN users u ON u.id = d.owner_user_id
         WHERE ${whereSql}
         ORDER BY
           CASE WHEN d.expected_release_date IS NULL THEN 1 ELSE 0 END ASC,
           d.expected_release_date DESC,
           d.updated_at DESC,
           d.id DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize],
      ),
      pool.query(
        `SELECT mp.id, mp.package_name, mp.app_id, mp.status_code,
           COALESCE(statusDict.item_name, mp.status_code, '') AS status_name,
           COALESCE(statusDict.color, 'default') AS status_color
         FROM matrix_packages mp
         LEFT JOIN config_dict_items statusDict
           ON statusDict.type_key = 'matrix_package_status'
          AND statusDict.item_code = mp.status_code
         WHERE mp.deleted_at IS NULL
         ORDER BY mp.package_name ASC, mp.id ASC`,
      ),
      pool.query(
        `SELECT id, matrix_package_id, version_number, version_info,
           DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
         FROM matrix_package_versions
         ORDER BY updated_at DESC, id DESC`,
      ),
      pool.query(
        `SELECT id, matrix_package_id, release_request_no, app_version, release_status
         FROM app_version_releases
         WHERE deleted_at IS NULL`,
      ),
    ])

    const versionsByPackageId = new Map()
    versionRows.forEach((version) => {
      const packageId = Number(version.matrix_package_id)
      if (!versionsByPackageId.has(packageId)) versionsByPackageId.set(packageId, [])
      versionsByPackageId.get(packageId).push(version)
    })
    const releasesByPackageVersion = new Map()
    releaseRows.forEach((release) => {
      const packageId = Number(release.matrix_package_id)
      if (!releasesByPackageVersion.has(packageId)) releasesByPackageVersion.set(packageId, [])
      releasesByPackageVersion.get(packageId).push(release)
    })

    return {
      list: demandRows.map((row) => mapDemandRow(row, packageRows, versionsByPackageId, releasesByPackageVersion)),
      page,
      pageSize,
      total: Number(countRows[0]?.total || 0),
    }
  },
}

module.exports = AppReleaseDemandCoverage
