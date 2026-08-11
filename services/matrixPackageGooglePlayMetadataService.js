const DEFAULT_BASE_URL = 'http://matrix-auto.a1aws.geesdev.com/fe-internal'
const DEFAULT_PATH = '/google-play/apps/metadata'
const DEFAULT_TIMEOUT_MS = 60000

function normalizeText(value, maxLen = 1000) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function buildRequestUrl(packageName) {
  const baseUrl = normalizeText(process.env.MATRIX_GOOGLE_PLAY_METADATA_BASE_URL, 1000) || DEFAULT_BASE_URL
  const path = normalizeText(process.env.MATRIX_GOOGLE_PLAY_METADATA_PATH, 1000) || DEFAULT_PATH
  const url = new URL(path.replace(/^\/+/, ''), `${baseUrl.replace(/\/+$/, '')}/`)
  url.searchParams.set('packageName', packageName)
  return url
}

function createUpstreamError(message, debugInfo = {}) {
  const error = new Error(message)
  error.statusCode = 502
  error.debugInfo = debugInfo
  return error
}

async function requestGooglePlayMetadata({ matrixPackage, attempt }) {
  const packageName = normalizeText(matrixPackage?.package_name, 255)
  if (!packageName) {
    const error = new Error('矩阵包名称为空，无法同步 Google Play 元数据')
    error.statusCode = 400
    error.debugInfo = {
      request_params: { packageName },
      attempt,
    }
    throw error
  }

  const timeoutMs = normalizePositiveInt(
    process.env.MATRIX_GOOGLE_PLAY_METADATA_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  )
  const url = buildRequestUrl(packageName)
  const requestDebugInfo = {
    request_url: url.toString(),
    request_params: { packageName },
    attempt,
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    console.info('Google Play 元数据同步请求参数:', {
      packageId: matrixPackage?.id,
      packageName,
      attempt,
      requestUrl: url.toString(),
    })
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    const responseText = await response.text().catch(() => '')
    let responseData = null
    if (responseText) {
      try {
        responseData = JSON.parse(responseText)
      } catch {
        responseData = null
      }
    }

    if (!response.ok) {
      throw createUpstreamError(
        responseData?.message || responseText || `上游接口返回 ${response.status}`,
        { ...requestDebugInfo, upstream_status: response.status },
      )
    }
    if (responseData?.success !== true) {
      throw createUpstreamError(
        responseData?.message || '上游接口未返回成功状态',
        { ...requestDebugInfo, upstream_status: response.status },
      )
    }

    return {
      packageName,
      requestUrl: url.toString(),
      requestParams: { packageName },
      attempt,
      upstreamStatus: response.status,
      upstreamData: responseData.data || null,
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createUpstreamError(`Google Play 元数据同步请求超时（${timeoutMs / 1000}秒）`, {
        ...requestDebugInfo,
        timeout_ms: timeoutMs,
      })
    }
    error.statusCode = error.statusCode || 502
    error.debugInfo = {
      ...requestDebugInfo,
      ...(error.debugInfo || {}),
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function syncGooglePlayMetadata({ matrixPackage, maxAttempts = 1 }) {
  const attempts = Math.min(normalizePositiveInt(maxAttempts, 1), 2)
  let lastError = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await requestGooglePlayMetadata({ matrixPackage, attempt })
      console.info('Google Play 元数据同步触发成功:', {
        packageId: matrixPackage?.id,
        packageName: result.packageName,
        attempt,
      })
      return result
    } catch (error) {
      lastError = error
      console.warn('Google Play 元数据同步触发失败:', {
        packageId: matrixPackage?.id,
        packageName: normalizeText(matrixPackage?.package_name, 255),
        attempt,
        maxAttempts: attempts,
        message: error?.message || error,
      })
    }
  }

  throw lastError || createUpstreamError('Google Play 元数据同步触发失败')
}

module.exports = {
  syncGooglePlayMetadata,
}
