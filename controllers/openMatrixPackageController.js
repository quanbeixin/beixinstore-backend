const pool = require('../utils/db')
const {
  buildSignedGetObjectUrl,
  getOssConfigFromEnv,
} = require('../utils/oss')

const SIDE_NOTE_SECTIONS = [
  { type: 'DELIVERY', key: 'delivery', description: 'PUSH信息补充' },
  { type: 'DESIGN', key: 'design', description: '设计侧补充' },
  { type: 'OPERATION', key: 'operation', description: '运营侧补充' },
  { type: 'FRONTEND', key: 'frontend', description: '前端补充' },
  { type: 'BACKEND', key: 'backend', description: 'GP初始化配置信息' },
  { type: 'DEVOPS', key: 'devops', description: '运维补充' },
  { type: 'REQUIREMENT', key: 'requirement', description: '需求侧补充' },
  { type: 'DEVELOPMENT', key: 'development', description: '研发侧补充' },
]

const FIELD_DEFINITIONS = {
  DELIVERY: [
    { name: 'prodAppId', description: '生产环境个推Push APP ID' },
    { name: 'prodAppKey', description: '生产环境个推PUSH APP KEY' },
    { name: 'prodAppSecret', description: '生产环境个推APPSecret' },
    { name: 'prodMasterSecret', description: '生产环境个推MasterSecret' },
    { name: 'testAppId', description: '测试环境个推Push APP ID' },
    { name: 'testAppKey', description: '测试环境个推PUSH APP KEY' },
    { name: 'testAppSecret', description: '测试环境个推APPSecret' },
    { name: 'testMasterSecret', description: '测试环境个推MasterSecret' },
  ],
  OPERATION: [
    { name: 'appOrigin', description: 'appOrigin' },
    { name: 'contactEmail', description: '联系邮箱' },
    { name: 'privacyPolicyUrl', description: '隐私政策网址' },
    { name: 'termsUrl', description: '服务条款网址' },
    { name: 'dataDeletionUrl', description: '数据删除说明网址' },
    { name: 'officialEmail', description: '官方邮箱' },
    { name: 'materialUrl', description: '运营提供物料地址链接' },
    { name: 'feedbackSurveyUrl', description: '用户反馈问卷地址' },
    { name: 'reportSurveyUrl', description: '举报问卷地址' },
    { name: 'reviewAccount', description: '送审账号' },
    { name: 'appName', description: '应用名称' },
    { name: 'shortDescription', description: '简短说明' },
    { name: 'fullDescription', description: '完整说明' },
  ],
  DESIGN: [
    { name: 'dynamicWatermarkImage', description: '动态水印图' },
    { name: 'emailLogoImage', description: '邮箱 logo 图' },
    { name: 'dynamicWatermarkBrandImage', description: '动态水印结尾品牌图' },
    { name: 'designPreviewUrl', description: '设计稿预览地址' },
    { name: 'designSliceDeliveryUrl', description: '设计资源切图交付' },
    { name: 'tokenDocUrl', description: 'TOKEN文档' },
    { name: 'productFiveImagesZipPackage', description: '商品5图的压缩包' },
  ],
  FRONTEND: [
    { name: 'appVersion', description: 'APP版本号' },
    { name: 'appConsoleUrl', description: 'APP后台地址' },
    { name: 'prodGooglePlatformAppId', description: '生产环境Google平台应用ID' },
    { name: 'prodSha1Fingerprint', description: '生产环境sha1指纹' },
    { name: 'prodSha256Fingerprint', description: '生产环境sha256指纹' },
    { name: 'testGooglePlatformAppId', description: '测试环境Google平台应用ID' },
    { name: 'testSha1Fingerprint', description: '测试环境sha1指纹' },
    { name: 'testSha256Fingerprint', description: '测试环境sha256指纹' },
  ],
  BACKEND: [],
  DEVOPS: [
    { name: 'prodGoogleAuthClientId', description: '生产环境谷歌鉴权认证ClientId' },
    { name: 'prodGoogleAuthClientSecret', description: '生产环境谷歌鉴权认证ClientSecret' },
    { name: 'prodGooglePayCertificateUrl', description: '生产环境谷歌支付证书地址' },
    { name: 'prodGooglePayPackageName', description: '生产环境谷歌支付包名' },
    { name: 'testGoogleAuthClientId', description: '测试环境谷歌鉴权认证ClientId' },
    { name: 'testGoogleAuthClientSecret', description: '测试环境谷歌鉴权认证ClientSecret' },
    { name: 'testGooglePayCertificateUrl', description: '测试环境谷歌支付证书地址' },
    { name: 'testGooglePayPackageName', description: '测试环境谷歌支付包名' },
    { name: 'pushFcmFile', description: 'push-fcm文件' },
    { name: 'googleServiceJsonFile', description: 'google-service.json文件' },
  ],
}

const PRODUCTION_NODE_DEFINITIONS = [
  {
    node_code: 'OPERATION_MATERIAL',
    node_name: '运营物料信息提供',
    description: '运营物料信息提供',
    owner_side: '运营',
    sort_order: 10,
  },
  {
    node_code: 'DESIGN_PRODUCTION',
    node_name: '前端空包构建上传',
    description: '前端空包构建上传',
    owner_side: '前端',
    sort_order: 20,
  },
]

const PRODUCTION_NODE_STATUS_NAMES = {
  NOT_STARTED: '未开始',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  BLOCKED: '阻塞',
}

function normalizeText(value, maxLength = 255) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function field(description, value) {
  return { description, value: value ?? '' }
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value || ''))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseCompanyEnglishName(rawExtraJson) {
  if (!rawExtraJson) return ''
  const parsed = parseJsonObject(rawExtraJson)
  if (Object.keys(parsed).length > 0) {
    return normalizeText(
      parsed.englishName || parsed.english_name || parsed.enName || parsed.extra_json || '',
      255,
    )
  }
  try {
    const value = JSON.parse(String(rawExtraJson))
    return typeof value === 'string' ? normalizeText(value, 255) : ''
  } catch {
    return normalizeText(rawExtraJson, 255)
  }
}

function isAttachmentValue(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value.object_key || value.object_url || value.file_name),
  )
}

function buildAttachmentUrl(attachment, { ossConfig, expireSeconds, contentDisposition = 'attachment' } = {}) {
  if (!isAttachmentValue(attachment)) return ''
  const storageProvider = normalizeText(attachment.storage_provider || attachment.provider, 64).toUpperCase()
  const objectKey = normalizeText(attachment.object_key, 1000).replace(/^\/+/, '')
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

function normalizeFieldValue(value, options = {}) {
  if (isAttachmentValue(value)) {
    return {
      file_name: normalizeText(value.file_name || value.object_key || '', 255),
      mime_type: normalizeText(value.mime_type, 100),
      file_size: Number(value.file_size || 0) || null,
      url: buildAttachmentUrl(value, options),
      object_key: normalizeText(value.object_key, 1000),
      storage_provider: normalizeText(value.storage_provider || value.provider, 64),
      uploaded_at: value.uploaded_at || null,
    }
  }

  return value ?? ''
}

function buildSideNoteValue(noteType, content, options = {}) {
  const parsed = parseJsonObject(content)
  const definitions = FIELD_DEFINITIONS[noteType] || []
  const result = {}
  const describedKeys = new Set()

  definitions.forEach((definition) => {
    describedKeys.add(definition.name)
    result[definition.name] = field(
      definition.description,
      normalizeFieldValue(parsed[definition.name], options),
    )
  })

  Object.entries(parsed).forEach(([key, value]) => {
    if (describedKeys.has(key)) return
    result[key] = field(key, normalizeFieldValue(value, options))
  })

  return result
}

function buildProductionNodeValue(node) {
  const statusCode = normalizeText(node?.status_code || 'NOT_STARTED', 50)
  return {
    node_code: field('节点编码', node?.node_code || ''),
    node_name: field('节点名称', node?.node_name || ''),
    owner_side: field('负责侧', node?.owner_side || ''),
    status: field('节点状态', {
      code: statusCode,
      name: PRODUCTION_NODE_STATUS_NAMES[statusCode] || statusCode,
    }),
    block_reason: field('阻塞原因', node?.block_reason || ''),
    owner_name: field('责任人', node?.owner_display_name || node?.owner_name || ''),
    expected_delivery_date: field('预期交付时间', node?.expected_delivery_date || null),
    started_by_name: field('开始操作人', node?.started_by_name || ''),
    started_at: field('开始时间', node?.started_at || null),
    completed_by_name: field('完成操作人', node?.completed_by_name || ''),
    completed_at: field('完成时间', node?.completed_at || null),
    updated_by_name: field('最近更新人', node?.updated_by_name || ''),
    updated_at: field('最近更新时间', node?.updated_at || null),
  }
}

function buildProductionNodes(row, productionNodesByPackageId) {
  const rows = productionNodesByPackageId.get(Number(row.id)) || new Map()
  return PRODUCTION_NODE_DEFINITIONS.map((definition) => {
    const node = rows.get(definition.node_code) || {}
    return field(definition.description, buildProductionNodeValue({
      ...definition,
      ...node,
      node_code: definition.node_code,
      node_name: definition.node_name,
      owner_side: definition.owner_side,
    }))
  })
}

function buildPackageResponse(row, sideNotesByPackageId, productionNodesByPackageId, options = {}) {
  const sideNotes = sideNotesByPackageId.get(Number(row.id)) || new Map()
  const sections = {}

  SIDE_NOTE_SECTIONS.forEach((section) => {
    const note = sideNotes.get(section.type) || null
    sections[section.key] = field(section.description, buildSideNoteValue(section.type, note?.content || '', options))
    sections[section.key].updated_at = note?.updated_at || null
    sections[section.key].updated_by_name = note?.updated_by_name || ''
    sections[section.key].is_confirmed = Boolean(note?.is_confirmed)
  })

  return {
    package_id: field('矩阵包记录ID', Number(row.id)),
    package_name: field('矩阵包名', row.package_name || ''),
    app_id: field('包ID（应用ID）', row.app_id || ''),
    domain_info: field('域名信息', row.domain_info || ''),
    new_package_version: field('新包版本', row.new_package_version || ''),
    status: field('包状态', {
      code: row.status_code || '',
      name: row.status_name || row.status_code || '',
    }),
    health: field('健康度', {
      code: row.health_code || '',
      name: row.health_name || row.health_code || '',
    }),
    expected_cold_ready_date: field('统一截止时间', row.expected_cold_ready_date || null),
    owner_name: field('矩阵包负责人', row.owner_display_name || row.owner_name || ''),
    linked_demand: field('关联项目管理需求', {
      demand_id: field('需求ID', row.linked_demand_id || ''),
      demand_name: field('需求名称', row.linked_demand_name || ''),
    }),
    developer_account: field('开发者账号', {
      company_name: field('公司主体', row.developer_company_name || ''),
      company_english_name: field('主体英文名称', parseCompanyEnglishName(row.developer_company_extra_json)),
      account_name: field('开发者账号名称', row.developer_account_name || ''),
      account_id: field('开发者账号ID', row.developer_account_platform_id || ''),
      status: field('开发者账号状态', {
        code: row.developer_account_status_code || '',
        name: row.developer_account_status_name || row.developer_account_status_code || '',
      }),
    }),
    side_notes: field('各侧补充信息', sections),
    production_nodes: field('前置准备', buildProductionNodes(row, productionNodesByPackageId)),
    created_at: field('创建时间', row.created_at || null),
    updated_at: field('更新时间', row.updated_at || null),
  }
}

async function listOpenMatrixPackages(req, res) {
  const expectedToken = normalizeText(process.env.MATRIX_PACKAGE_OPEN_API_TOKEN, 500)
  const token = normalizeText(req.query?.token || req.headers['x-open-api-token'], 500)
  if (!expectedToken) {
    return res.status(503).json({ success: false, message: '开放接口 token 未配置' })
  }
  if (!token || token !== expectedToken) {
    return res.status(401).json({ success: false, message: 'token 无效' })
  }

  const packageName = normalizeText(req.query?.package_name, 120)
  const appId = normalizeText(req.query?.app_id, 120)
  const where = ['mp.deleted_at IS NULL']
  const params = []
  if (packageName) {
    where.push('mp.package_name = ?')
    params.push(packageName)
  }
  if (appId) {
    where.push('mp.app_id = ?')
    params.push(appId)
  }

  try {
    const [packageRows] = await pool.query(
      `SELECT
         mp.id,
         mp.package_name,
         mp.app_id,
         mp.domain_info,
         mp.new_package_version,
         mp.status_code,
         statusDict.item_name AS status_name,
         mp.health_code,
         healthDict.item_name AS health_name,
         DATE_FORMAT(mp.expected_cold_ready_date, '%Y-%m-%d %H:%i:%s') AS expected_cold_ready_date,
         mp.owner_name,
         mp.linked_demand_id,
         linkedDemand.name AS linked_demand_name,
         COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username) AS owner_display_name,
         da.company_name AS developer_company_name,
         companyDict.extra_json AS developer_company_extra_json,
         da.account_name AS developer_account_name,
         da.account_id AS developer_account_platform_id,
         da.status_code AS developer_account_status_code,
         accountStatusDict.item_name AS developer_account_status_name,
         DATE_FORMAT(mp.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(mp.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM matrix_packages mp
       LEFT JOIN users ownerUser
         ON ownerUser.id = mp.owner_user_id
       LEFT JOIN work_demands linkedDemand
         ON linkedDemand.id = mp.linked_demand_id
       LEFT JOIN developer_accounts da
         ON da.id = mp.developer_account_id
        AND da.deleted_at IS NULL
       LEFT JOIN config_dict_items companyDict
         ON companyDict.type_key = 'developer_company_subject'
        AND companyDict.item_name = da.company_name
       LEFT JOIN config_dict_items statusDict
         ON statusDict.type_key = 'matrix_package_status'
        AND statusDict.item_code = mp.status_code
       LEFT JOIN config_dict_items healthDict
         ON healthDict.type_key = 'matrix_package_health'
        AND healthDict.item_code = mp.health_code
       LEFT JOIN config_dict_items accountStatusDict
         ON accountStatusDict.type_key = 'developer_account_status'
        AND accountStatusDict.item_code = da.status_code
       WHERE ${where.join(' AND ')}
       ORDER BY mp.updated_at DESC, mp.id DESC`,
      params,
    )

    const packageIds = packageRows.map((row) => Number(row.id)).filter(Boolean)
    const sideNotesByPackageId = new Map()
    const productionNodesByPackageId = new Map()
    if (packageIds.length > 0) {
      const [noteRows] = await pool.query(
        `SELECT
           package_id,
           note_type,
           content,
           CASE
             WHEN COALESCE(TRIM(content), '') <> ''
              AND COALESCE(content, '') = COALESCE(confirmed_content, '')
             THEN 1
             ELSE 0
           END AS is_confirmed,
           COALESCE(NULLIF(updatedUser.real_name, ''), updatedUser.username) AS updated_by_name,
           DATE_FORMAT(matrix_package_side_notes.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
         FROM matrix_package_side_notes
         LEFT JOIN users updatedUser
           ON updatedUser.id = matrix_package_side_notes.updated_by
         WHERE package_id IN (${packageIds.map(() => '?').join(', ')})`,
        packageIds,
      )

      noteRows.forEach((row) => {
        const packageId = Number(row.package_id)
        if (!sideNotesByPackageId.has(packageId)) sideNotesByPackageId.set(packageId, new Map())
        sideNotesByPackageId.get(packageId).set(String(row.note_type || '').toUpperCase(), row)
      })

      const [nodeRows] = await pool.query(
        `SELECT
           mpn.package_id,
           mpn.node_code,
           mpn.status_code,
           mpn.block_reason,
           COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username, mpn.owner_name) AS owner_display_name,
           mpn.owner_name,
           DATE_FORMAT(mpn.expected_delivery_date, '%Y-%m-%d %H:%i:%s') AS expected_delivery_date,
           COALESCE(NULLIF(startedUser.real_name, ''), startedUser.username) AS started_by_name,
           DATE_FORMAT(mpn.started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
           COALESCE(NULLIF(completedUser.real_name, ''), completedUser.username) AS completed_by_name,
           DATE_FORMAT(mpn.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
           COALESCE(NULLIF(updatedUser.real_name, ''), updatedUser.username) AS updated_by_name,
           DATE_FORMAT(mpn.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
         FROM matrix_package_production_nodes mpn
         LEFT JOIN users ownerUser
           ON ownerUser.id = mpn.owner_user_id
         LEFT JOIN users startedUser
           ON startedUser.id = mpn.started_by
         LEFT JOIN users completedUser
           ON completedUser.id = mpn.completed_by
         LEFT JOIN users updatedUser
           ON updatedUser.id = mpn.updated_by
         WHERE mpn.package_id IN (${packageIds.map(() => '?').join(', ')})`,
        packageIds,
      )

      nodeRows.forEach((row) => {
        const packageId = Number(row.package_id)
        if (!productionNodesByPackageId.has(packageId)) productionNodesByPackageId.set(packageId, new Map())
        productionNodesByPackageId.get(packageId).set(String(row.node_code || '').toUpperCase(), row)
      })
    }

    const ossConfig = getOssConfigFromEnv()
    const expireSeconds = Math.max(60, Number(process.env.MATRIX_PACKAGE_OPEN_API_SIGN_EXPIRE_SECONDS || process.env.MATRIX_PACKAGE_SIDE_NOTE_SIGN_EXPIRE_SECONDS || 300))
    const data = packageRows.map((row) => buildPackageResponse(row, sideNotesByPackageId, productionNodesByPackageId, { ossConfig, expireSeconds }))

    return res.json({
      success: true,
      data,
      total: data.length,
    })
  } catch (error) {
    console.error('开放接口获取矩阵包配置失败:', error)
    return res.status(500).json({ success: false, message: '获取矩阵包配置失败' })
  }
}

module.exports = {
  listOpenMatrixPackages,
}
