const crypto = require('crypto')
const https = require('https')

function normalizeText(value, maxLen = 500) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeEndpoint(endpoint) {
  const raw = normalizeText(endpoint, 255)
  if (!raw) return ''
  return raw.replace(/^https?:\/\//i, '').replace(/\/+$/g, '')
}

function normalizePublicBaseUrl(value, { bucketName = '', endpoint = '' } = {}) {
  const custom = normalizeText(value, 1000)
  if (custom) return custom.replace(/\/+$/g, '')
  if (!bucketName || !endpoint) return ''
  return `https://${bucketName}.${endpoint}`
}

function sanitizeFileName(fileName = '') {
  const raw = normalizeText(fileName, 255) || 'file'
  const dotIndex = raw.lastIndexOf('.')
  const namePart = dotIndex > 0 ? raw.slice(0, dotIndex) : raw
  const extPart = dotIndex > 0 ? raw.slice(dotIndex + 1) : ''

  const safeName = namePart.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').slice(0, 80) || 'file'
  const safeExt = extPart.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 20)

  return safeExt ? `${safeName}.${safeExt}` : safeName
}

function buildOssObjectKey({
  rootDir = 'uploads',
  businessDir = 'bugs',
  businessNo = '',
  fileName = '',
} = {}) {
  const dir = normalizeText(rootDir, 100).replace(/^\/+|\/+$/g, '') || 'uploads'
  const bizDir = normalizeText(businessDir, 100).replace(/^\/+|\/+$/g, '') || 'bugs'
  const bizNo = normalizeText(businessNo, 100).replace(/[^a-zA-Z0-9._-]+/g, '_') || 'UNKNOWN'
  const safeFileName = sanitizeFileName(fileName)
  const stamp = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
  return `${dir}/${bizDir}/${bizNo}/${stamp}-${safeFileName}`
}

function createPostPolicy({
  accessKeyId,
  accessKeySecret,
  bucketName,
  endpoint,
  objectKey,
  expireSeconds = 300,
  maxFileSize = 10 * 1024 * 1024,
  successActionStatus = '200',
  securityToken = '',
}) {
  const normalizedEndpoint = normalizeEndpoint(endpoint)
  const host = `https://${bucketName}.${normalizedEndpoint}`
  const expireAt = new Date(Date.now() + Math.max(60, Number(expireSeconds) || 300) * 1000)
  const policyObj = {
    expiration: expireAt.toISOString(),
    conditions: [
      { bucket: bucketName },
      ['eq', '$key', objectKey],
      ['content-length-range', 0, Math.max(1024, Number(maxFileSize) || 10 * 1024 * 1024)],
      ['eq', '$success_action_status', String(successActionStatus || '200')],
    ],
  }

  if (securityToken) {
    policyObj.conditions.push(['eq', '$x-oss-security-token', securityToken])
  }

  const policy = Buffer.from(JSON.stringify(policyObj)).toString('base64')
  const signature = crypto.createHmac('sha1', accessKeySecret).update(policy).digest('base64')

  const fields = {
    key: objectKey,
    policy,
    OSSAccessKeyId: accessKeyId,
    Signature: signature,
    success_action_status: String(successActionStatus || '200'),
  }

  if (securityToken) {
    fields['x-oss-security-token'] = securityToken
  }

  return {
    host,
    expire_at: expireAt.toISOString(),
    fields,
  }
}

function getOssConfigFromEnv() {
  const accessKeyId = normalizeText(process.env.ALIYUN_OSS_ACCESS_KEY_ID, 128)
  const accessKeySecret = normalizeText(process.env.ALIYUN_OSS_ACCESS_KEY_SECRET, 256)
  const bucketName = normalizeText(process.env.ALIYUN_OSS_BUCKET, 100)
  const endpoint = normalizeEndpoint(process.env.ALIYUN_OSS_ENDPOINT)
  const region = normalizeText(process.env.ALIYUN_OSS_REGION, 64)
  const publicBaseUrl = normalizePublicBaseUrl(process.env.ALIYUN_OSS_PUBLIC_BASE_URL, {
    bucketName,
    endpoint,
  })
  const uploadDir = normalizeText(process.env.ALIYUN_OSS_UPLOAD_DIR, 100) || 'beixin-store'
  const expireSeconds = Math.max(60, Number(process.env.ALIYUN_OSS_EXPIRE_SECONDS || 300))
  const maxFileSize = Math.max(1024, Number(process.env.ALIYUN_OSS_MAX_FILE_SIZE || 10 * 1024 * 1024))
  const securityToken = normalizeText(process.env.ALIYUN_OSS_SECURITY_TOKEN, 2048)

  if (!accessKeyId || !accessKeySecret || !bucketName || !endpoint || !region) {
    return null
  }

  return {
    accessKeyId,
    accessKeySecret,
    bucketName,
    endpoint,
    region,
    publicBaseUrl,
    uploadDir,
    expireSeconds,
    maxFileSize,
    securityToken: securityToken || '',
  }
}

function buildPublicObjectUrl({ publicBaseUrl, objectKey }) {
  if (!publicBaseUrl || !objectKey) return ''
  const encoded = String(objectKey)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `${publicBaseUrl}/${encoded}`
}

function buildSignedGetObjectUrl({
  accessKeyId,
  accessKeySecret,
  bucketName,
  endpoint,
  objectKey,
  expireSeconds = 300,
  securityToken = '',
  responseContentDisposition = '',
}) {
  const normalizedAccessKeyId = normalizeText(accessKeyId, 128)
  const normalizedAccessKeySecret = normalizeText(accessKeySecret, 256)
  const normalizedBucketName = normalizeText(bucketName, 100)
  const normalizedEndpoint = normalizeEndpoint(endpoint)
  const normalizedObjectKey = String(objectKey || '').replace(/^\/+/, '')
  const normalizedSecurityToken = normalizeText(securityToken, 2048)
  const normalizedResponseContentDisposition = normalizeText(responseContentDisposition, 200)
  const expires = Math.floor(Date.now() / 1000) + Math.max(60, Number(expireSeconds) || 300)

  if (
    !normalizedAccessKeyId ||
    !normalizedAccessKeySecret ||
    !normalizedBucketName ||
    !normalizedEndpoint ||
    !normalizedObjectKey
  ) {
    return ''
  }

  const responseOverrides = []
  if (normalizedResponseContentDisposition) {
    responseOverrides.push(['response-content-disposition', normalizedResponseContentDisposition])
  }
  const canonicalizedOverride = responseOverrides
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
  const canonicalizedResource = canonicalizedOverride
    ? `/${normalizedBucketName}/${normalizedObjectKey}?${canonicalizedOverride}`
    : `/${normalizedBucketName}/${normalizedObjectKey}`
  const stringToSign = ['GET', '', '', String(expires), canonicalizedResource].join('\n')
  const signature = crypto.createHmac('sha1', normalizedAccessKeySecret).update(stringToSign).digest('base64')

  const query = new URLSearchParams({
    OSSAccessKeyId: normalizedAccessKeyId,
    Expires: String(expires),
    Signature: signature,
  })
  if (normalizedSecurityToken) {
    query.set('security-token', normalizedSecurityToken)
  }
  if (normalizedResponseContentDisposition) {
    query.set('response-content-disposition', normalizedResponseContentDisposition)
  }

  return `https://${normalizedBucketName}.${normalizedEndpoint}/${encodeObjectKeyForPath(normalizedObjectKey)}?${query.toString()}`
}

function encodeObjectKeyForPath(objectKey = '') {
  return String(objectKey || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

function buildCanonicalizedOssHeaders(headers = {}) {
  return Object.entries(headers)
    .filter(([key, value]) => String(key || '').toLowerCase().startsWith('x-oss-') && value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [String(key).toLowerCase(), String(value).trim()])
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}:${value}\n`)
    .join('')
}

function buildOssAuthorization({
  method = 'GET',
  bucketName = '',
  objectKey = '',
  accessKeyId = '',
  accessKeySecret = '',
  contentMd5 = '',
  contentType = '',
  date = '',
  ossHeaders = {},
}) {
  const canonicalizedHeaders = buildCanonicalizedOssHeaders(ossHeaders)
  const canonicalizedResource = `/${bucketName}/${String(objectKey || '').replace(/^\/+/, '')}`
  const stringToSign = [
    String(method || 'GET').toUpperCase(),
    contentMd5,
    contentType,
    date,
    `${canonicalizedHeaders}${canonicalizedResource}`,
  ].join('\n')
  const signature = crypto.createHmac('sha1', accessKeySecret).update(stringToSign).digest('base64')
  return `OSS ${accessKeyId}:${signature}`
}

function deleteOssObject({
  accessKeyId,
  accessKeySecret,
  bucketName,
  endpoint,
  objectKey,
  securityToken = '',
}) {
  return new Promise((resolve, reject) => {
    const normalizedEndpoint = normalizeEndpoint(endpoint)
    const normalizedBucketName = normalizeText(bucketName, 100)
    const normalizedObjectKey = String(objectKey || '').replace(/^\/+/, '')

    if (!accessKeyId || !accessKeySecret || !normalizedBucketName || !normalizedEndpoint || !normalizedObjectKey) {
      resolve({ ok: false, skipped: true, message: 'OSS删除参数不完整' })
      return
    }

    const date = new Date().toUTCString()
    const ossHeaders = {}
    if (securityToken) {
      ossHeaders['x-oss-security-token'] = securityToken
    }

    const headers = {
      Date: date,
      Authorization: buildOssAuthorization({
        method: 'DELETE',
        bucketName: normalizedBucketName,
        objectKey: normalizedObjectKey,
        accessKeyId,
        accessKeySecret,
        date,
        ossHeaders,
      }),
      ...ossHeaders,
    }

    const req = https.request(
      {
        protocol: 'https:',
        hostname: `${normalizedBucketName}.${normalizedEndpoint}`,
        method: 'DELETE',
        path: `/${encodeObjectKeyForPath(normalizedObjectKey)}`,
        headers,
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          const statusCode = Number(res.statusCode || 0)
          if (statusCode === 200 || statusCode === 204 || statusCode === 404) {
            resolve({ ok: true, statusCode, body })
            return
          }
          resolve({
            ok: false,
            statusCode,
            body,
            message: `OSS删除失败，状态码 ${statusCode || 'UNKNOWN'}`,
          })
        })
      },
    )

    req.on('error', reject)
    req.end()
  })
}

module.exports = {
  buildOssObjectKey,
  buildPublicObjectUrl,
  buildSignedGetObjectUrl,
  createPostPolicy,
  deleteOssObject,
  getOssConfigFromEnv,
  sanitizeFileName,
}
