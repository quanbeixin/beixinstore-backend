const CulturePushConfig = require('../models/CulturePushConfig')
const { sendNotification, uploadFeishuImageByUrl } = require('../utils/notificationSender')

function normalizeText(value, maxLength = 0) {
  const text = String(value || '').trim()
  if (!text) return ''
  return maxLength > 0 ? text.slice(0, maxLength) : text
}

function buildFinalLink(config) {
  return normalizeText(config?.link_url, 1000)
}

function normalizeImageUrls(config) {
  const source = Array.isArray(config?.image_urls) && config.image_urls.length > 0
    ? config.image_urls
    : [config?.image_url]
  return Array.from(
    new Set(
      source
        .map((item) => normalizeText(item, 1000))
        .filter(Boolean),
    ),
  ).slice(0, 9)
}

function buildContent(config, { includeLink = false } = {}) {
  const lines = []
  const content = normalizeText(config?.message_content, 10000)
  if (content) lines.push(content)
  if (includeLink) {
    const linkUrl = buildFinalLink(config)
    const linkText = normalizeText(config?.link_text, 80) || '查看详情'
    if (linkUrl) {
      if (lines.length > 0) lines.push('')
      lines.push(`[${linkText}](${linkUrl})`)
    }
  }

  return lines.join('\n')
}

async function sendCulturePush(config, { sendType = 'SCHEDULED', operatorUserId = null } = {}) {
  const target = {
    target_type: 'chat',
    target_id: config.target_chat_id,
    target_name: config.target_chat_name || '',
  }
  const imageUrls = normalizeImageUrls(config)
  const imageKeys = []
  for (const imageUrl of imageUrls) {
    const imageResult = await uploadFeishuImageByUrl(imageUrl)
    if (!imageResult?.success) {
      const failedResult = {
        success: false,
        error_code: imageResult?.error_code || 'FEISHU_IMAGE_UPLOAD_FAILED',
        error_message: imageResult?.error_message || '上传飞书图片失败',
        response: imageResult?.response || {},
      }
      await CulturePushConfig.markSent(config, failedResult, {
        sendType,
        requestPayload: {
          config_id: Number(config.id),
          send_type: sendType,
          image_url: imageUrl,
          image_urls: imageUrls,
        },
        operatorUserId,
      })
      return failedResult
    }
    if (imageResult.image_key) imageKeys.push(imageResult.image_key)
  }

  const requestPayload = {
    config_id: Number(config.id),
    send_type: sendType,
    target,
    title: config.message_title,
    content: buildContent(config, { includeLink: imageKeys.length === 0 }),
    metadata: {
      source: 'culture_push',
      culture_push_config_id: Number(config.id),
      detail_url: imageKeys.length > 0 ? '' : buildFinalLink(config),
      detail_action_text: normalizeText(config.link_text, 20) || '查看详情',
      image_key: imageKeys[0] || '',
      image_keys: imageKeys,
      image_alt: '主内容配图',
      footer_markdown: imageKeys.length > 0
        ? buildContent({
            message_content: '',
            link_text: config.link_text,
            link_url: buildFinalLink(config),
          }, { includeLink: true })
        : '',
    },
  }

  const result = await sendNotification({
    channelType: 'feishu',
    title: requestPayload.title,
    content: requestPayload.content,
    targets: [target],
    metadata: requestPayload.metadata,
  })

  await CulturePushConfig.markSent(config, result, {
    sendType,
    requestPayload,
    operatorUserId,
  })

  return result
}

async function dispatchDueCulturePushes() {
  const dueConfigs = await CulturePushConfig.listDue(20)
  for (const config of dueConfigs) {
    try {
      await sendCulturePush(config, { sendType: 'SCHEDULED' })
    } catch (error) {
      await CulturePushConfig.markSent(
        config,
        {
          success: false,
          error_message: error?.message || '文化推送发送失败',
          response: {},
        },
        {
          sendType: 'SCHEDULED',
          requestPayload: {
            config_id: Number(config.id),
            send_type: 'SCHEDULED',
          },
        },
      )
    }
  }
}

module.exports = {
  buildContent,
  dispatchDueCulturePushes,
  sendCulturePush,
}
