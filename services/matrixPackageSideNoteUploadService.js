const {
  buildOssObjectKey,
  buildPublicObjectUrl,
  buildSignedGetObjectUrl,
  createPostPolicy,
  getOssConfigFromEnv,
} = require('../utils/oss')

function normalizeText(value, maxLength = 255) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function normalizeFileSizeBytes(value) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0
}

function buildFileSizeExceededMessage(maxFileSize) {
  const mb = Math.max(1, Math.ceil(Number(maxFileSize || 0) / 1024 / 1024))
  return `文件大小不能超过 ${mb}MB，请压缩后再上传`
}

function getMatrixPackageSideNoteSignExpireSeconds() {
  return Math.max(60, Number(process.env.MATRIX_PACKAGE_SIDE_NOTE_SIGN_EXPIRE_SECONDS || 300))
}

function buildMatrixPackageSideNoteAccessUrl(
  attachment,
  { ossConfig = null, expireSeconds = 300, contentDisposition = 'inline' } = {},
) {
  if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return ''
  const storageProvider = String(attachment.storage_provider || attachment.provider || '').trim().toUpperCase()
  const objectKey = String(attachment.object_key || '').trim().replace(/^\/+/, '')
  const objectUrl = normalizeText(attachment.object_url, 1000)

  if (storageProvider === 'ALIYUN_OSS' && ossConfig && objectKey) {
    const signedUrl = buildSignedGetObjectUrl({
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      bucketName: normalizeText(attachment.bucket_name, 100) || ossConfig.bucketName,
      endpoint: ossConfig.endpoint,
      objectKey,
      expireSeconds,
      securityToken: ossConfig.securityToken,
      responseContentDisposition: contentDisposition,
      responseCacheControl: 'public,max-age=300',
    })
    if (signedUrl) return signedUrl
  }

  return objectUrl || ''
}

function decorateMatrixPackageSideNote(note, options = {}) {
  if (!note) return note
  let parsed = null
  try {
    parsed = JSON.parse(String(note.content || '{}'))
  } catch {
    return note
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return note

  let changed = false
  const nextContent = { ...parsed }
  Object.entries(nextContent).forEach(([fieldName, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const previewUrl = buildMatrixPackageSideNoteAccessUrl(value, options)
    const downloadUrl = buildMatrixPackageSideNoteAccessUrl(value, { ...options, contentDisposition: 'attachment' })
    if (!previewUrl && !downloadUrl) return
    nextContent[fieldName] = {
      ...value,
      preview_url: previewUrl,
      download_url: downloadUrl || previewUrl,
    }
    changed = true
  })

  return changed ? { ...note, content: JSON.stringify(nextContent) } : note
}

function decorateMatrixPackageSideNotes(notes = []) {
  if (!Array.isArray(notes) || notes.length === 0) return notes
  const ossConfig = getOssConfigFromEnv()
  const expireSeconds = getMatrixPackageSideNoteSignExpireSeconds()
  return notes.map((note) => decorateMatrixPackageSideNote(note, { ossConfig, expireSeconds }))
}

function buildMatrixPackageSideNotePolicyPayload({ packageId, noteType, fieldName, fileName, fileSize } = {}) {
  const oss = getOssConfigFromEnv()
  if (!oss) {
    return {
      ok: false,
      status: 400,
      message: '阿里云OSS未配置，暂不可上传文件',
    }
  }

  const normalizedNoteType = normalizeText(noteType, 50).toUpperCase()
  const configuredMaxFileSize = Number(oss.maxFileSize || 50 * 1024 * 1024)
  const maxFileSize = normalizedNoteType === 'DESIGN'
    ? Math.max(configuredMaxFileSize, 100 * 1024 * 1024)
    : configuredMaxFileSize
  const normalizedFileSize = normalizeFileSizeBytes(fileSize)
  if (normalizedFileSize > 0 && normalizedFileSize > maxFileSize) {
    return {
      ok: false,
      status: 400,
      message: buildFileSizeExceededMessage(maxFileSize),
    }
  }

  const normalizedNoteTypePath = normalizedNoteType.toLowerCase() || 'side-note'
  const normalizedFieldName = normalizeText(fieldName, 80).replace(/[^a-zA-Z0-9._-]+/g, '_') || 'file'
  const objectKey = buildOssObjectKey({
    rootDir: oss.uploadDir,
    businessDir: `matrix-packages/${packageId}/${normalizedNoteTypePath}/${normalizedFieldName}`,
    businessNo: `PKG_${packageId}`,
    fileName,
  })
  const policyPayload = createPostPolicy({
    accessKeyId: oss.accessKeyId,
    accessKeySecret: oss.accessKeySecret,
    bucketName: oss.bucketName,
    endpoint: oss.endpoint,
    objectKey,
    expireSeconds: oss.expireSeconds,
    maxFileSize,
    successActionStatus: '200',
    securityToken: oss.securityToken,
  })
  const objectUrl = buildPublicObjectUrl({
    publicBaseUrl: oss.publicBaseUrl,
    objectKey,
  })
  const previewUrl = buildMatrixPackageSideNoteAccessUrl({
    storage_provider: 'ALIYUN_OSS',
    bucket_name: oss.bucketName,
    object_key: objectKey,
    object_url: objectUrl,
  }, {
    ossConfig: oss,
    expireSeconds: getMatrixPackageSideNoteSignExpireSeconds(),
  })
  const downloadUrl = buildMatrixPackageSideNoteAccessUrl({
    storage_provider: 'ALIYUN_OSS',
    bucket_name: oss.bucketName,
    object_key: objectKey,
    object_url: objectUrl,
  }, {
    ossConfig: oss,
    expireSeconds: getMatrixPackageSideNoteSignExpireSeconds(),
    contentDisposition: 'attachment',
  })

  return {
    ok: true,
    data: {
      configured: true,
      provider: 'ALIYUN_OSS',
      bucket_name: oss.bucketName,
      endpoint: oss.endpoint,
      region: oss.region,
      object_key: objectKey,
      object_url: objectUrl || null,
      preview_url: previewUrl || objectUrl || null,
      download_url: downloadUrl || previewUrl || objectUrl || null,
      max_file_size: maxFileSize,
      host: policyPayload.host,
      expire_at: policyPayload.expire_at,
      fields: policyPayload.fields,
    },
  }
}

module.exports = {
  buildMatrixPackageSideNoteAccessUrl,
  buildMatrixPackageSideNotePolicyPayload,
  decorateMatrixPackageSideNote,
  decorateMatrixPackageSideNotes,
  getMatrixPackageSideNoteSignExpireSeconds,
}
