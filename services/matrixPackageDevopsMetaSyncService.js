const MatrixPackage = require('../models/MatrixPackage')
const MatrixPackageSideNote = require('../models/MatrixPackageSideNote')

function normalizeText(value, maxLen = 1000) {
  return String(value || '').trim().slice(0, maxLen)
}

function parseStructuredContent(content) {
  const text = normalizeText(content, 300000)
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function getNoteReadableContent(note) {
  return String(note?.content || '').trim() ? note.content : note?.confirmed_content || ''
}

function normalizeEnv(value) {
  const env = normalizeText(value, 20).toLowerCase()
  return env === 'test' ? 'test' : 'prod'
}

function joinUrl(baseUrl, path) {
  const base = normalizeText(baseUrl, 1000).replace(/\/+$/g, '')
  const suffix = normalizeText(path, 1000).replace(/^\/+/g, '')
  return base && suffix ? `${base}/${suffix}` : ''
}

function getConfig(env = 'prod') {
  const envKey = env === 'test' ? 'TEST' : 'PROD'
  const baseUrl =
    normalizeText(process.env[`MATRIX_META_SYNC_${envKey}_BASE_URL`], 1000) ||
    normalizeText(process.env.MATRIX_META_SYNC_BASE_URL, 1000)
  const path = normalizeText(process.env.MATRIX_META_SYNC_PATH, 1000) || '/api/management/v1/matrix/meta/attrs/batch'
  const session = normalizeText(process.env.MATRIX_META_SYNC_SESSION, 2000)
  return {
    url: joinUrl(baseUrl, path),
    session,
  }
}

function buildSyncPayload({ matrixPackage, operationContent, devopsContent, env }) {
  const prefix = env === 'test' ? 'test' : 'prod'
  const upperPrefix = prefix === 'test' ? 'Test' : 'Prod'
  const channelCode = normalizeText(operationContent.appOrigin, 2000)
  const clientId = normalizeText(devopsContent[`${prefix}GoogleAuthClientId`], 2000)
  const clientSecret = normalizeText(devopsContent[`${prefix}GoogleAuthClientSecret`], 2000)
  const packageName = normalizeText(matrixPackage?.app_id, 2000)
  const certificateContent = normalizeText(devopsContent[`${prefix}GooglePayCertificateContent`], 300000)
  const missingFields = []

  if (!channelCode) missingFields.push('appOrigin')
  if (!clientId) missingFields.push(`${upperPrefix}GoogleAuthClientId`)
  if (!clientSecret) missingFields.push(`${upperPrefix}GoogleAuthClientSecret`)
  if (!packageName) missingFields.push('app_id')
  if (!certificateContent) missingFields.push(`${upperPrefix}GooglePayCertificateContent`)

  return {
    missingFields,
    payload: {
      channelCode,
      attrs: [
        { attrKey: 'authGoogleClientId', attrValue: clientId },
        { attrKey: 'authGoogleClientSecret', attrValue: clientSecret },
        { attrKey: 'payGooglePackageName', attrValue: packageName },
        { attrKey: 'payGoogleKeyContent', attrValue: certificateContent },
      ],
    },
  }
}

function shouldExposeDebugValues() {
  return String(process.env.MATRIX_META_SYNC_DEBUG_VALUES || '').trim() === 'true'
}

function buildAttrsDebugInfo(attrs = []) {
  const exposeValues = shouldExposeDebugValues()
  return attrs.map((item) => {
    const value = String(item?.attrValue || '')
    const debugInfo = {
      attrKey: item?.attrKey || '',
      hasValue: value.length > 0,
      valueLength: value.length,
    }
    if (exposeValues) {
      debugInfo.attrValue = value
    }
    return debugInfo
  })
}

async function syncDevopsMeta({ packageId, env }) {
  const normalizedEnv = normalizeEnv(env)
  const config = getConfig(normalizedEnv)
  if (!config.url) {
    const error = new Error('MATRIX_META_SYNC_BASE_URL 未配置')
    error.statusCode = 400
    throw error
  }
  if (!config.session) {
    const error = new Error('MATRIX_META_SYNC_SESSION 未配置')
    error.statusCode = 400
    throw error
  }

  const matrixPackage = await MatrixPackage.getById(packageId)
  if (!matrixPackage) {
    const error = new Error('矩阵包不存在')
    error.statusCode = 404
    throw error
  }

  const notes = await MatrixPackageSideNote.listByPackageId(packageId)
  const devopsNote = Array.isArray(notes) ? notes.find((item) => item.note_type === 'DEVOPS') : null
  const operationNote = Array.isArray(notes) ? notes.find((item) => item.note_type === 'OPERATION') : null
  const devopsContent = parseStructuredContent(getNoteReadableContent(devopsNote))
  const operationContent = parseStructuredContent(getNoteReadableContent(operationNote))
  const { missingFields, payload } = buildSyncPayload({
    matrixPackage,
    operationContent,
    devopsContent,
    env: normalizedEnv,
  })
  if (missingFields.length > 0) {
    const error = new Error(`请先补充同步所需字段：${missingFields.join('、')}`)
    error.statusCode = 400
    throw error
  }

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `a1-session=${config.session}`,
    },
    body: JSON.stringify(payload),
  })
  const responseText = await response.text().catch(() => '')
  if (response.status !== 200) {
    const error = new Error(responseText || `上游接口返回 ${response.status}`)
    error.statusCode = 502
    error.debugInfo = {
      upstream_status: response.status,
    }
    throw error
  }

  return {
    env: normalizedEnv,
    status: response.status,
    channelCode: payload.channelCode,
    attrs: buildAttrsDebugInfo(payload.attrs),
  }
}

module.exports = {
  syncDevopsMeta,
}
