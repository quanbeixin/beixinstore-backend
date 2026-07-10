const NotificationTemplateFile = require('../models/NotificationTemplateFile')
const {
  buildOssObjectKey,
  buildPublicObjectUrl,
  buildSignedGetObjectUrl,
  createPostPolicy,
  getOssConfigFromEnv,
} = require('../utils/oss')

function normalizeText(value, maxLen = 500) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeTemplateKey(value) {
  const text = String(value || '').trim().toLowerCase()
  return text ? text.replace(/[^a-z0-9_-]+/g, '_').slice(0, 64) : ''
}

function normalizeFileSizeBytes(value) {
  const numeric = Number(value || 0)
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0
}

function buildSignedAccessUrl(attachment, { ossConfig = null, expireSeconds = 300, contentDisposition = 'inline' } = {}) {
  if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) return ''
  const storageProvider = String(attachment.storage_provider || '').trim().toUpperCase()
  const objectKey = String(attachment.object_key || '').trim().replace(/^\/+/, '')
  const objectUrl = normalizeText(attachment.object_url, 1000)

  if (storageProvider === 'ALIYUN_OSS' && ossConfig && objectKey) {
    const signedUrl = buildSignedGetObjectUrl({
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      bucketName: String(attachment.bucket_name || ossConfig.bucketName).trim() || ossConfig.bucketName,
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

function decorateTemplateFile(row, options = {}) {
  if (!row) return row
  return {
    ...row,
    preview_url: buildSignedAccessUrl(row, options),
    download_url: buildSignedAccessUrl(row, { ...options, contentDisposition: 'attachment' }),
  }
}

function buildUploadPolicyPayload({ templateKey, fileName, fileSize } = {}) {
  const oss = getOssConfigFromEnv()
  if (!oss) {
    return {
      ok: false,
      status: 400,
      message: '阿里云OSS未配置，暂不可上传文件',
    }
  }

  const maxFileSize = Number(oss.maxFileSize || 50 * 1024 * 1024)
  const normalizedFileSize = normalizeFileSizeBytes(fileSize)
  if (normalizedFileSize > 0 && normalizedFileSize > maxFileSize) {
    return {
      ok: false,
      status: 400,
      message: `文件大小不能超过 ${Math.max(1, Math.ceil(maxFileSize / 1024 / 1024))}MB，请压缩后再上传`,
    }
  }

  const normalizedTemplateKey = normalizeTemplateKey(templateKey)
  if (!normalizedTemplateKey) {
    return {
      ok: false,
      status: 400,
      message: '模板编码不合法',
    }
  }

  const objectKey = buildOssObjectKey({
    rootDir: oss.uploadDir,
    businessDir: `notification-template-files/${normalizedTemplateKey}`,
    businessNo: `TPL_${normalizedTemplateKey}`,
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
  const previewUrl = buildSignedAccessUrl({
    storage_provider: 'ALIYUN_OSS',
    bucket_name: oss.bucketName,
    object_key: objectKey,
    object_url: objectUrl,
  }, {
    ossConfig: oss,
  })
  const downloadUrl = buildSignedAccessUrl({
    storage_provider: 'ALIYUN_OSS',
    bucket_name: oss.bucketName,
    object_key: objectKey,
    object_url: objectUrl,
  }, {
    ossConfig: oss,
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

async function listNotificationTemplateFiles(req, res) {
  try {
    const rows = await NotificationTemplateFile.list()
    const oss = getOssConfigFromEnv()
    const expireSeconds = Math.max(60, Number(process.env.MATRIX_PACKAGE_SIDE_NOTE_SIGN_EXPIRE_SECONDS || 300))
    return res.json({
      success: true,
      data: rows.map((row) => decorateTemplateFile(row, { ossConfig: oss, expireSeconds })),
    })
  } catch (error) {
    console.error('获取通用文件模板失败:', error)
    return res.status(500).json({ success: false, message: '获取通用文件模板失败' })
  }
}

async function upsertNotificationTemplateFile(req, res) {
  try {
    const templateKey = normalizeTemplateKey(req.params.templateKey)
    if (!templateKey) {
      return res.status(400).json({ success: false, message: '模板编码不合法' })
    }

    const data = await NotificationTemplateFile.upsert(templateKey, req.body || {}, req.user?.id || null)
    return res.json({ success: true, message: '模板已保存', data })
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500)
    if (statusCode >= 500) {
      console.error('保存通用文件模板失败:', error)
    }
    return res.status(statusCode).json({
      success: false,
      message: error?.message || '保存通用文件模板失败',
    })
  }
}

async function getNotificationTemplateFileUploadPolicy(req, res) {
  try {
    const templateKey = normalizeTemplateKey(req.body?.template_key || req.body?.templateKey)
    const fileName = normalizeText(req.body?.file_name || req.body?.fileName, 255)
    if (!fileName) {
      return res.status(400).json({ success: false, message: '文件名不能为空' })
    }

    const policyResult = buildUploadPolicyPayload({
      templateKey,
      fileName,
      fileSize: req.body?.file_size || req.body?.fileSize,
    })
    if (!policyResult.ok) {
      return res.status(policyResult.status || 400).json({
        success: false,
        message: policyResult.message || '获取上传策略失败',
      })
    }

    return res.json({
      success: true,
      message: '上传策略已生成',
      data: policyResult.data,
    })
  } catch (error) {
    console.error('获取通用文件模板上传策略失败:', error)
    return res.status(500).json({ success: false, message: '获取通用文件模板上传策略失败' })
  }
}

module.exports = {
  listNotificationTemplateFiles,
  upsertNotificationTemplateFile,
  getNotificationTemplateFileUploadPolicy,
}
