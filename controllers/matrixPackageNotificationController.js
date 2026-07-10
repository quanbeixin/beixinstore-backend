const { listFeishuChats } = require('../utils/notificationSender')
const MatrixPackageNotificationService = require('../services/matrixPackageNotificationService')
const NotificationTemplateFile = require('../models/NotificationTemplateFile')
const {
  buildOssObjectKey,
  buildPublicObjectUrl,
  buildSignedGetObjectUrl,
  deleteOssObject,
  createPostPolicy,
  getOssConfigFromEnv,
} = require('../utils/oss')

function sendSuccess(res, { status = 200, message = '成功', data = null } = {}) {
  return res.status(status).json({ success: true, message, data })
}

function sendError(res, { status = 400, message = '请求错误', code = 'BAD_REQUEST', details = null } = {}) {
  return res.status(status).json({ success: false, message, code, details })
}

function normalizeText(value, maxLength = 255) {
  if (value === undefined || value === null) return ''
  return String(value).trim().slice(0, maxLength)
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
    businessDir: `matrix-package-notification-template-files/${normalizedTemplateKey}`,
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

async function listRules(_req, res) {
  try {
    const rows = await MatrixPackageNotificationService.listRules()
    return sendSuccess(res, { data: rows, message: '查询成功' })
  } catch (error) {
    console.error('获取矩阵包通知规则失败:', error)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

async function getMeta(_req, res) {
  try {
    const data = await MatrixPackageNotificationService.getMeta()
    return sendSuccess(res, { data, message: '查询成功' })
  } catch (error) {
    console.error('获取矩阵包通知元数据失败:', error)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

async function createRule(req, res) {
  try {
    const created = await MatrixPackageNotificationService.createRule(req.body || {}, req.user?.id || null)
    return sendSuccess(res, { status: 201, message: '创建成功', data: created })
  } catch (error) {
    if (error?.statusCode) {
      return sendError(res, { status: error.statusCode, message: error.message, code: error.code || 'VALIDATION_ERROR' })
    }
    console.error('创建矩阵包通知规则失败:', error)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

async function updateRule(req, res) {
  const ruleId = Number(req.params.id)
  if (!Number.isInteger(ruleId) || ruleId <= 0) {
    return sendError(res, { status: 400, message: '无效的规则 ID', code: 'INVALID_ID' })
  }

  try {
    const updated = await MatrixPackageNotificationService.updateRule(ruleId, req.body || {}, req.user?.id || null)
    if (!updated) {
      return sendError(res, { status: 404, message: '通知规则不存在', code: 'RULE_NOT_FOUND' })
    }
    return sendSuccess(res, { message: '更新成功', data: updated })
  } catch (error) {
    if (error?.statusCode) {
      return sendError(res, { status: error.statusCode, message: error.message, code: error.code || 'VALIDATION_ERROR' })
    }
    console.error('更新矩阵包通知规则失败:', error)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

async function deleteRule(req, res) {
  const ruleId = Number(req.params.id)
  if (!Number.isInteger(ruleId) || ruleId <= 0) {
    return sendError(res, { status: 400, message: '无效的规则 ID', code: 'INVALID_ID' })
  }

  try {
    const affected = await MatrixPackageNotificationService.deleteRule(ruleId)
    if (!affected) {
      return sendError(res, { status: 404, message: '通知规则不存在', code: 'RULE_NOT_FOUND' })
    }
    return sendSuccess(res, { message: '删除成功' })
  } catch (error) {
    console.error('删除矩阵包通知规则失败:', error)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

async function getFeishuChatOptions(req, res) {
  const pageToken = normalizeText(req.query?.page_token, 256)
  const pageSizeRaw = Number(req.query?.page_size || 50)
  const pageSize = Number.isInteger(pageSizeRaw) ? Math.min(Math.max(pageSizeRaw, 1), 100) : 50
  const keyword = normalizeText(req.query?.keyword, 100).toLowerCase()

  try {
    const result = await listFeishuChats({ pageToken, pageSize })
    if (!result?.success) {
      return sendError(res, {
        status: 502,
        message: result?.error_message || '获取飞书群列表失败',
        code: result?.error_code || 'FEISHU_CHAT_LIST_FAILED',
        details: result?.response || null,
      })
    }

    const rows = Array.isArray(result.data) ? result.data : []
    const filteredRows = keyword
      ? rows.filter((item) => {
        const id = String(item?.chat_id || '').toLowerCase()
        const name = String(item?.name || '').toLowerCase()
        return id.includes(keyword) || name.includes(keyword)
      })
      : rows

    return sendSuccess(res, {
      data: {
        items: filteredRows,
        next_page_token: result.next_page_token || '',
        has_more: Boolean(result.has_more),
      },
      message: '查询成功',
    })
  } catch (error) {
    console.error('获取矩阵包飞书群列表失败:', error)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

async function listTemplateFiles(_req, res) {
  try {
    const rows = await NotificationTemplateFile.list()
    const oss = getOssConfigFromEnv()
    const expireSeconds = Math.max(60, Number(process.env.MATRIX_PACKAGE_SIDE_NOTE_SIGN_EXPIRE_SECONDS || 300))
    return sendSuccess(res, {
      data: rows.map((row) => decorateTemplateFile(row, { ossConfig: oss, expireSeconds })),
      message: '查询成功',
    })
  } catch (error) {
    console.error('获取矩阵包通用文件模板失败:', error)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

async function upsertTemplateFile(req, res) {
  try {
    const templateKey = normalizeTemplateKey(req.params.templateKey)
    if (!templateKey) {
      return sendError(res, { status: 400, message: '模板编码不合法', code: 'INVALID_TEMPLATE_KEY' })
    }

    const data = await NotificationTemplateFile.upsert(templateKey, req.body || {}, req.user?.id || null)
    return sendSuccess(res, { message: '保存成功', data })
  } catch (error) {
    if (error?.statusCode) {
      return sendError(res, { status: error.statusCode, message: error.message, code: error.code || 'VALIDATION_ERROR' })
    }
    console.error('保存矩阵包通用文件模板失败:', error)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

async function deleteTemplateFile(req, res) {
  try {
    const templateKey = normalizeTemplateKey(req.params.templateKey)
    if (!templateKey) {
      return sendError(res, { status: 400, message: '模板编码不合法', code: 'INVALID_TEMPLATE_KEY' })
    }

    const existing = await NotificationTemplateFile.getByKey(templateKey)
    if (!existing) {
      return sendError(res, { status: 404, message: '模板不存在', code: 'TEMPLATE_NOT_FOUND' })
    }

    const oss = getOssConfigFromEnv()
    if (existing.object_key && oss) {
      try {
        await deleteOssObject({
          accessKeyId: oss.accessKeyId,
          accessKeySecret: oss.accessKeySecret,
          bucketName: existing.bucket_name || oss.bucketName,
          endpoint: oss.endpoint,
          objectKey: existing.object_key,
          securityToken: oss.securityToken,
        })
      } catch (deleteError) {
        console.warn('删除矩阵包通用文件模板OSS文件失败:', deleteError?.message || deleteError)
      }
    }

    const affected = await NotificationTemplateFile.deleteByKey(templateKey)
    if (!affected) {
      return sendError(res, { status: 404, message: '模板不存在', code: 'TEMPLATE_NOT_FOUND' })
    }

    return sendSuccess(res, { message: '删除成功' })
  } catch (error) {
    console.error('删除矩阵包通用文件模板失败:', error)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

async function getTemplateUploadPolicy(req, res) {
  try {
    const policyResult = buildUploadPolicyPayload({
      templateKey: req.body?.template_key || req.body?.templateKey,
      fileName: req.body?.file_name || req.body?.fileName,
      fileSize: req.body?.file_size || req.body?.fileSize,
    })

    if (!policyResult.ok) {
      return sendError(res, {
        status: policyResult.status || 400,
        message: policyResult.message || '获取上传策略失败',
        code: 'UPLOAD_POLICY_FAILED',
      })
    }

    return sendSuccess(res, { message: '查询成功', data: policyResult.data })
  } catch (error) {
    console.error('获取矩阵包通用文件模板上传策略失败:', error)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

module.exports = {
  listRules,
  getMeta,
  createRule,
  updateRule,
  deleteRule,
  getFeishuChatOptions,
  listTemplateFiles,
  upsertTemplateFile,
  deleteTemplateFile,
  getTemplateUploadPolicy,
}
