const CulturePushConfig = require('../models/CulturePushConfig')
const { listFeishuChats } = require('../utils/notificationSender')
const { sendCulturePush } = require('../services/culturePushService')
const {
  buildOssObjectKey,
  buildPublicObjectUrl,
  createPostPolicy,
  getOssConfigFromEnv,
} = require('../utils/oss')

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const CULTURE_IMAGE_MAX_SIZE = 10 * 1024 * 1024

function sendSuccess(res, { status = 200, message = '成功', data = null } = {}) {
  return res.status(status).json({
    success: true,
    message,
    data,
  })
}

function sendError(res, { status = 400, message = '请求错误', code = 'BAD_REQUEST', details = null } = {}) {
  return res.status(status).json({
    success: false,
    message,
    code,
    details,
  })
}

function normalizeText(value, maxLength = 255) {
  if (value === undefined || value === null) return ''
  return String(value).trim().slice(0, maxLength)
}

function normalizeFileSizeBytes(value) {
  const num = Number(value || 0)
  if (!Number.isFinite(num) || num < 0) return 0
  return Math.floor(num)
}

function buildImageUploadPolicyPayload({ fileName, fileSize, mimeType }) {
  const oss = getOssConfigFromEnv()
  if (!oss) {
    return {
      ok: false,
      status: 400,
      message: '阿里云OSS未配置，暂不可上传图片',
    }
  }

  const normalizedMimeType = normalizeText(mimeType, 100).toLowerCase()
  if (normalizedMimeType && !IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    return {
      ok: false,
      status: 400,
      message: '仅支持 JPG、PNG、GIF、WebP 图片',
    }
  }

  const normalizedFileSize = normalizeFileSizeBytes(fileSize)
  if (normalizedFileSize > CULTURE_IMAGE_MAX_SIZE) {
    return {
      ok: false,
      status: 400,
      message: '图片大小不能超过 10MB',
    }
  }

  const objectKey = buildOssObjectKey({
    rootDir: oss.uploadDir,
    businessDir: 'culture-push-images',
    businessNo: 'CULTURE_PUSH',
    fileName,
  })
  const maxFileSize = Math.min(Number(oss.maxFileSize || CULTURE_IMAGE_MAX_SIZE), CULTURE_IMAGE_MAX_SIZE)
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

  return {
    ok: true,
    data: {
      configured: true,
      provider: 'ALIYUN_OSS',
      bucket_name: oss.bucketName,
      endpoint: oss.endpoint,
      region: oss.region,
      object_key: objectKey,
      object_url: objectUrl,
      max_file_size: maxFileSize,
      ...policyPayload,
    },
  }
}

async function listConfigs(req, res) {
  try {
    const data = await CulturePushConfig.list({
      page: req.query.page,
      pageSize: req.query.pageSize,
      keyword: req.query.keyword,
      enabled: req.query.enabled,
    })
    return sendSuccess(res, { data })
  } catch (error) {
    console.error('获取文化推送配置失败:', error)
    return sendError(res, { status: 500, message: '获取文化推送配置失败', code: 'INTERNAL_ERROR' })
  }
}

async function createConfig(req, res) {
  try {
    const data = await CulturePushConfig.create(req.body || {}, req.user?.id)
    return sendSuccess(res, { status: 201, message: '创建成功', data })
  } catch (error) {
    return sendError(res, {
      status: error?.statusCode || 500,
      message: error?.message || '创建文化推送配置失败',
      code: error?.message || 'INTERNAL_ERROR',
    })
  }
}

async function updateConfig(req, res) {
  try {
    const data = await CulturePushConfig.update(req.params.id, req.body || {}, req.user?.id)
    if (!data) return sendError(res, { status: 404, message: '配置不存在', code: 'NOT_FOUND' })
    return sendSuccess(res, { message: '更新成功', data })
  } catch (error) {
    return sendError(res, {
      status: error?.statusCode || 500,
      message: error?.message || '更新文化推送配置失败',
      code: error?.message || 'INTERNAL_ERROR',
    })
  }
}

async function updateEnabled(req, res) {
  try {
    const data = await CulturePushConfig.updateEnabled(req.params.id, req.body?.enabled, req.user?.id)
    if (!data) return sendError(res, { status: 404, message: '配置不存在', code: 'NOT_FOUND' })
    return sendSuccess(res, { message: data.enabled ? '已启用' : '已停用', data })
  } catch (error) {
    return sendError(res, { status: 500, message: error?.message || '更新状态失败', code: 'INTERNAL_ERROR' })
  }
}

async function deleteConfig(req, res) {
  try {
    const affectedRows = await CulturePushConfig.remove(req.params.id, req.user?.id)
    if (!affectedRows) return sendError(res, { status: 404, message: '配置不存在', code: 'NOT_FOUND' })
    return sendSuccess(res, { message: '删除成功', data: { affected_rows: affectedRows } })
  } catch (error) {
    return sendError(res, { status: 500, message: error?.message || '删除失败', code: 'INTERNAL_ERROR' })
  }
}

async function sendTest(req, res) {
  try {
    const config = await CulturePushConfig.getById(req.params.id)
    if (!config) return sendError(res, { status: 404, message: '配置不存在', code: 'NOT_FOUND' })
    const result = await sendCulturePush(config, {
      sendType: 'TEST',
      operatorUserId: req.user?.id || null,
    })
    if (!result?.success) {
      return sendError(res, {
        status: 502,
        message: result?.error_message || '测试发送失败',
        code: result?.error_code || 'SEND_FAILED',
        details: result?.response || null,
      })
    }
    return sendSuccess(res, { message: result?.skipped ? '立即发送已跳过' : '立即发送成功', data: result })
  } catch (error) {
    return sendError(res, { status: 500, message: error?.message || '立即发送失败', code: 'INTERNAL_ERROR' })
  }
}

async function listLogs(req, res) {
  try {
    const data = await CulturePushConfig.listLogs(req.params.id, {
      page: req.query.page,
      pageSize: req.query.pageSize,
    })
    return sendSuccess(res, { data })
  } catch (error) {
    return sendError(res, { status: 500, message: error?.message || '获取发送记录失败', code: 'INTERNAL_ERROR' })
  }
}

async function getImageUploadPolicy(req, res) {
  try {
    const fileName = normalizeText(req.body?.file_name || req.body?.fileName, 255)
    if (!fileName) {
      return sendError(res, { status: 400, message: '文件名不能为空', code: 'FILE_NAME_REQUIRED' })
    }

    const policyResult = buildImageUploadPolicyPayload({
      fileName,
      fileSize: req.body?.file_size || req.body?.fileSize,
      mimeType: req.body?.mime_type || req.body?.mimeType,
    })
    if (!policyResult.ok) {
      return sendError(res, {
        status: policyResult.status || 400,
        message: policyResult.message || '获取上传策略失败',
        code: 'UPLOAD_POLICY_FAILED',
      })
    }

    return sendSuccess(res, { message: '上传策略已生成', data: policyResult.data })
  } catch (error) {
    console.error('获取文化推送图片上传策略失败:', error)
    return sendError(res, { status: 500, message: '获取上传策略失败', code: 'INTERNAL_ERROR' })
  }
}

async function getFeishuChatOptions(req, res) {
  const pageToken = normalizeText(req.query?.page_token, 256)
  const pageSizeRaw = Number(req.query?.page_size || 50)
  const pageSize = Number.isInteger(pageSizeRaw) ? Math.min(Math.max(pageSizeRaw, 1), 100) : 50
  const keyword = normalizeText(req.query?.keyword, 100).toLowerCase()

  try {
    const result = await listFeishuChats({
      pageToken,
      pageSize,
    })

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
        list: filteredRows,
        next_page_token: result.next_page_token || '',
        page_token: result.next_page_token || '',
        has_more: Boolean(result.has_more),
      },
    })
  } catch (err) {
    console.error('获取文化推送飞书群失败:', err)
    return sendError(res, { status: 500, message: '服务器错误', code: 'INTERNAL_ERROR' })
  }
}

module.exports = {
  createConfig,
  deleteConfig,
  getFeishuChatOptions,
  getImageUploadPolicy,
  listConfigs,
  listLogs,
  sendTest,
  updateConfig,
  updateEnabled,
}
