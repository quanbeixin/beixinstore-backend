const pool = require('../utils/db')
const { sendNotification } = require('../utils/notificationSender')

const APP_RELEASE_MANAGER_ROLE_KEYS = [
  'APP_RELEASE_MANAGER',
  'RELEASE_MANAGER',
  'APP_VERSION_RELEASE_MANAGER',
]
const DEFAULT_NOTIFICATION_PUBLIC_BASE_URL = 'http://39.97.253.194'
const APP_VERSION_RELEASE_PATH = '/app-version-release'
const APPLICANT_NOTIFY_STATUS_CODES = new Set(['IN_REVIEW', 'LISTED', 'REJECTED', 'CANCELLED'])

function normalizeText(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength)
}

function normalizeHttpBaseUrl(value) {
  const text = normalizeText(value, 1000)
  if (!text) return ''
  try {
    const parsed = new URL(text)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    parsed.pathname = parsed.pathname.replace(/\/+$/g, '')
    return parsed.toString().replace(/\/+$/g, '')
  } catch {
    return ''
  }
}

function isLocalHost(hostname = '') {
  const normalized = String(hostname || '').trim().toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0'
}

function isProductionOrigin(value) {
  try {
    const parsed = new URL(value)
    if (isLocalHost(parsed.hostname)) return false
    return !parsed.port || parsed.port === '80' || parsed.port === '443'
  } catch {
    return false
  }
}

function resolvePortalBaseUrl() {
  const explicitPublic = normalizeHttpBaseUrl(process.env.NOTIFICATION_PORTAL_PUBLIC_BASE_URL)
  if (explicitPublic) return explicitPublic

  const configuredBase = normalizeHttpBaseUrl(process.env.NOTIFICATION_PORTAL_BASE_URL)
  if (configuredBase) return configuredBase

  const origins = String(process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map((item) => normalizeHttpBaseUrl(item))
    .filter(Boolean)
  const productionOrigin = origins.find(isProductionOrigin)
  if (productionOrigin) return productionOrigin

  return DEFAULT_NOTIFICATION_PUBLIC_BASE_URL
}

function buildAppVersionReleaseUrl() {
  const baseUrl = resolvePortalBaseUrl()
  try {
    return new URL(APP_VERSION_RELEASE_PATH, `${baseUrl}/`).toString()
  } catch {
    return `${DEFAULT_NOTIFICATION_PUBLIC_BASE_URL}${APP_VERSION_RELEASE_PATH}`
  }
}

function formatValue(value, fallback = '-') {
  const text = normalizeText(value, 1000)
  return text || fallback
}

function formatReleaseLine(release, index) {
  const requestNo = formatValue(release.release_request_no || release.id)
  const appName = formatValue(release.app_name)
  const appVersion = formatValue(release.app_version)
  const urgency = formatValue(release.urgency_name || release.urgency_code)
  const expectedSubmitAt = formatValue(release.expected_submit_at)
  const appId = formatValue(release.app_id)
  const domainInfo = formatValue(release.domain_info)

  return [
    `${index + 1}）${requestNo}`,
    `APP：${appName}`,
    `版本号：${appVersion}`,
    `紧急程度：${urgency}`,
    `送审预期：${expectedSubmitAt}`,
    `包ID：${appId}`,
    `域名：${domainInfo}`,
  ].join('\n')
}

function buildNotificationContent(releases = []) {
  const first = releases[0] || {}
  const applicantName = formatValue(first.applicant_name)
  const releaseType = formatValue(first.release_type_name || first.release_type)
  const relatedDemand = first.related_demand_id
    ? `${first.related_demand_name || '-'}（${first.related_demand_id}）`
    : '-'
  const remark = formatValue(first.remark)
  const releaseLines = releases
    .slice(0, 10)
    .map((release, index) => formatReleaseLine(release, index))
    .join('\n\n')
  const overflowText = releases.length > 10 ? `\n\n其余 ${releases.length - 10} 条请进入 APP版本发布页面查看。` : ''

  return [
    `发版申请人：${applicantName}`,
    `发版类型：${releaseType}`,
    `关联需求：${relatedDemand}`,
    `备注：${remark}`,
    '',
    `本次共创建 ${releases.length} 条 APP 发版申请：`,
    releaseLines || '-',
    overflowText,
  ].filter((line) => line !== '').join('\n')
}

function buildStatusChangeContent(release, previousStatusName = '') {
  return [
    `发版申请ID：${formatValue(release.release_request_no || release.id)}`,
    `APP：${formatValue(release.app_name)}`,
    `版本号：${formatValue(release.app_version)}`,
    `当前状态：${formatValue(release.release_status_name || release.release_status)}`,
    previousStatusName ? `原状态：${previousStatusName}` : '',
    `发版负责人：${formatValue(release.owner_name)}`,
    `包ID：${formatValue(release.app_id)}`,
    `域名：${formatValue(release.domain_info)}`,
    `备注：${formatValue(release.remark)}`,
    `更新时间：${formatValue(release.updated_at)}`,
  ].filter(Boolean).join('\n')
}

async function listAppReleaseManagers() {
  const [rows] = await pool.query(
    `SELECT DISTINCT
       u.id,
       COALESCE(NULLIF(u.real_name, ''), u.username) AS display_name,
       u.feishu_open_id
     FROM users u
     INNER JOIN user_roles ur
       ON ur.user_id = u.id
     INNER JOIN roles r
       ON r.id = ur.role_id
     WHERE UPPER(COALESCE(r.role_key, '')) IN (${APP_RELEASE_MANAGER_ROLE_KEYS.map(() => '?').join(', ')})
       AND COALESCE(r.enabled, 1) = 1
       AND COALESCE(u.status_code, 'ACTIVE') = 'ACTIVE'
       AND COALESCE(NULLIF(u.feishu_open_id, ''), '') <> ''
     ORDER BY u.id ASC`,
    APP_RELEASE_MANAGER_ROLE_KEYS,
  )

  return (rows || []).map((row) => ({
    user_id: Number(row.id),
    user_name: normalizeText(row.display_name, 80),
    feishu_open_id: normalizeText(row.feishu_open_id, 128),
  })).filter((row) => row.user_id > 0 && row.feishu_open_id)
}

async function getApplicantTarget(release) {
  const userId = Number(release?.applicant_user_id || 0)
  if (!Number.isInteger(userId) || userId <= 0) return null

  const [rows] = await pool.query(
    `SELECT
       id,
       COALESCE(NULLIF(real_name, ''), username) AS display_name,
       feishu_open_id
     FROM users
     WHERE id = ?
       AND COALESCE(status_code, 'ACTIVE') = 'ACTIVE'
       AND COALESCE(NULLIF(feishu_open_id, ''), '') <> ''
     LIMIT 1`,
    [userId],
  )
  const row = rows[0]
  if (!row?.feishu_open_id) return null

  return {
    target_type: 'user',
    target_id: normalizeText(row.feishu_open_id, 128),
    target_name: normalizeText(row.display_name, 80),
    extra: {
      user_id: Number(row.id),
    },
  }
}

const AppVersionReleaseNotificationService = {
  APPLICANT_NOTIFY_STATUS_CODES: Array.from(APPLICANT_NOTIFY_STATUS_CODES),

  async notifyApplicationCreated(releases = []) {
    const normalizedReleases = Array.isArray(releases) ? releases.filter(Boolean) : []
    if (normalizedReleases.length === 0) {
      return {
        success: true,
        skipped: true,
        reason: 'NO_RELEASES',
      }
    }

    const managers = await listAppReleaseManagers()
    if (managers.length === 0) {
      return {
        success: true,
        skipped: true,
        reason: 'NO_APP_RELEASE_MANAGERS',
      }
    }

    const targets = managers.map((manager) => ({
      target_type: 'user',
      target_id: manager.feishu_open_id,
      target_name: manager.user_name,
      extra: {
        user_id: manager.user_id,
      },
    }))

    return sendNotification({
      channelType: 'feishu',
      title: '新的APP版本发布申请',
      content: buildNotificationContent(normalizedReleases),
      targets,
      metadata: {
        source: 'app_version_release_application_created',
        detail_url: buildAppVersionReleaseUrl(),
        detail_action_text: '查看APP版本发布',
      },
    })
  },

  async notifyApplicantStatusChanged({ beforeRelease, afterRelease } = {}) {
    const beforeStatus = normalizeText(beforeRelease?.release_status, 64).toUpperCase()
    const afterStatus = normalizeText(afterRelease?.release_status, 64).toUpperCase()
    if (!afterStatus || beforeStatus === afterStatus || !APPLICANT_NOTIFY_STATUS_CODES.has(afterStatus)) {
      return {
        success: true,
        skipped: true,
        reason: 'STATUS_NOT_MATCHED',
      }
    }

    const target = await getApplicantTarget(afterRelease)
    if (!target) {
      return {
        success: true,
        skipped: true,
        reason: 'APPLICANT_FEISHU_NOT_FOUND',
      }
    }

    return sendNotification({
      channelType: 'feishu',
      title: 'APP版本发布状态更新',
      content: buildStatusChangeContent(afterRelease, beforeRelease?.release_status_name || beforeStatus),
      targets: [target],
      metadata: {
        source: 'app_version_release_status_changed',
        detail_url: buildAppVersionReleaseUrl(),
        detail_action_text: '查看APP版本发布',
      },
    })
  },
}

module.exports = AppVersionReleaseNotificationService
