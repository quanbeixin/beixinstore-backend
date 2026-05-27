const DEFAULT_CHAT_COMPLETIONS_PATH = '/chat/completions'
const DEFAULT_RESPONSES_PATH = '/responses'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeBoolean(value, fallback = false) {
  const normalized = normalizeText(value).toLowerCase()
  if (!normalized) return fallback
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false
  return fallback
}

function truncateText(value, maxLength = 300) {
  const text = normalizeText(value)
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`
}

function extractTextFromContentPart(part) {
  if (typeof part === 'string') return normalizeText(part)
  if (!part || typeof part !== 'object') return ''
  return normalizeText(
    part.text ||
    part.content ||
    part.output_text ||
    part.reasoning_content ||
    part.reasoning ||
    '',
  )
}

function extractMessageContent(message) {
  if (!message || typeof message !== 'object') return ''

  const directContent = message.content
  if (typeof directContent === 'string') {
    const normalized = normalizeText(directContent)
    if (normalized) return normalized
  }

  if (Array.isArray(directContent)) {
    const merged = directContent
      .map((item) => extractTextFromContentPart(item))
      .filter(Boolean)
      .join('\n')
      .trim()
    if (merged) return merged
  }

  const fallbackFields = [
    message.text,
    message.output_text,
    message.reasoning_content,
    message.reasoning,
  ]

  for (const field of fallbackFields) {
    const normalized = normalizeText(field)
    if (normalized) return normalized
  }

  return ''
}

function extractCompletionContent(payload) {
  if (!payload || typeof payload !== 'object') return ''

  const choiceMessage = payload?.choices?.[0]?.message
  const choiceContent = extractMessageContent(choiceMessage)
  if (choiceContent) return choiceContent

  const choiceText = normalizeText(payload?.choices?.[0]?.text)
  if (choiceText) return choiceText

  const outputText = normalizeText(payload?.output_text)
  if (outputText) return outputText

  if (Array.isArray(payload?.output)) {
    const merged = payload.output
      .flatMap((item) => {
        if (Array.isArray(item?.content)) return item.content
        return [item]
      })
      .map((item) => extractTextFromContentPart(item))
      .filter(Boolean)
      .join('\n')
      .trim()
    if (merged) return merged
  }

  return ''
}

function buildPayloadShapeSummary(payload) {
  if (!payload || typeof payload !== 'object') return 'empty_payload'

  const choices = Array.isArray(payload?.choices) ? payload.choices : []
  const firstChoice = choices[0] || null
  const message = firstChoice?.message || null

  return [
    `choices=${choices.length}`,
    `message=${message ? 'yes' : 'no'}`,
    `message.content=${Array.isArray(message?.content) ? 'array' : typeof message?.content}`,
    `message.reasoning_content=${typeof message?.reasoning_content}`,
    `choice.text=${typeof firstChoice?.text}`,
    `output_text=${typeof payload?.output_text}`,
    `output=${Array.isArray(payload?.output) ? `array(${payload.output.length})` : typeof payload?.output}`,
  ].join(', ')
}

function resolveApiKey(preferredApiKey = '') {
  return (
    normalizeText(preferredApiKey) ||
    normalizeText(process.env.AGENT_AI_API_KEY) ||
    normalizeText(process.env.OPENAI_API_KEY) ||
    normalizeText(process.env.DEEPSEEK_API_KEY)
  )
}

function resolveBaseUrl(preferredBaseUrl = '') {
  return (
    normalizeText(preferredBaseUrl) ||
    normalizeText(process.env.AGENT_AI_BASE_URL) ||
    normalizeText(process.env.OPENAI_BASE_URL) ||
    normalizeText(process.env.DEEPSEEK_BASE_URL) ||
    'https://api.openai.com/v1'
  ).replace(/\/+$/, '')
}

function resolveDefaultModel() {
  return normalizeText(process.env.AGENT_AI_DEFAULT_MODEL) || 'gpt-4o-mini'
}

function resolveWireApi(preferredWireApi = '') {
  const wireApi = (
    normalizeText(preferredWireApi) ||
    normalizeText(process.env.AGENT_AI_WIRE_API) ||
    'chat_completions'
  ).toLowerCase()

  if (wireApi === 'responses' || wireApi === 'response') return 'responses'
  return 'chat_completions'
}

function resolveReasoningEffort(preferredReasoningEffort = '') {
  return normalizeText(preferredReasoningEffort) || normalizeText(process.env.AGENT_AI_MODEL_REASONING_EFFORT)
}

function resolveDisableResponseStorage(preferredDisableStorage) {
  if (typeof preferredDisableStorage === 'boolean') return preferredDisableStorage
  return normalizeBoolean(process.env.AGENT_AI_DISABLE_RESPONSE_STORAGE, false)
}

function resolveResponseFormat(preferredResponseFormat = null) {
  if (!preferredResponseFormat) return null

  if (typeof preferredResponseFormat === 'string') {
    const normalized = normalizeText(preferredResponseFormat).toLowerCase()
    if (normalized === 'json_object') return { type: 'json_object' }
    return null
  }

  if (typeof preferredResponseFormat === 'object') {
    const type = normalizeText(preferredResponseFormat.type).toLowerCase()
    if (type === 'json_object') return { type: 'json_object' }
  }

  return null
}

function normalizeModelForProvider(model = '', baseUrl = '') {
  const requestedModel = normalizeText(model)
  const resolvedBaseUrl = normalizeText(baseUrl).toLowerCase()
  const defaultModel = normalizeText(resolveDefaultModel())
  const fallbackModel = requestedModel || defaultModel

  if (resolvedBaseUrl.includes('api.deepseek.com')) {
    const lowerModel = fallbackModel.toLowerCase()
    if (!lowerModel) return 'deepseek-v4-flash'
    if (lowerModel === 'deepseek-v4-pro' || lowerModel === 'deepseek-v4-flash') {
      return fallbackModel
    }
    if (lowerModel.startsWith('deepseek')) {
      return 'deepseek-v4-flash'
    }
    return 'deepseek-v4-flash'
  }

  return fallbackModel || 'gpt-4o-mini'
}

async function callChatCompletion({
  apiKey,
  baseUrl,
  model,
  wireApi,
  responseFormat,
  reasoningEffort,
  disableResponseStorage,
  systemPrompt,
  userPrompt,
  temperature = 0.7,
  maxTokens = 2000,
}) {
  const resolvedApiKey = resolveApiKey(apiKey)
  if (!resolvedApiKey) {
    throw new Error('未配置 AI API Key，请先设置 FEEDBACK_AI_API_KEY、AGENT_AI_API_KEY 或 OPENAI_API_KEY')
  }
  const resolvedBaseUrl = resolveBaseUrl(baseUrl)
  const resolvedModel = normalizeModelForProvider(model, resolvedBaseUrl)
  const resolvedWireApi = resolveWireApi(wireApi)
  const resolvedResponseFormat = resolveResponseFormat(responseFormat)
  const resolvedReasoningEffort = resolveReasoningEffort(reasoningEffort)
  const resolvedDisableResponseStorage = resolveDisableResponseStorage(disableResponseStorage)

  const controller = new AbortController()
  const timeoutMs = Number.isFinite(Number(process.env.AGENT_AI_TIMEOUT_MS))
    ? Math.max(3000, Number(process.env.AGENT_AI_TIMEOUT_MS))
    : 90000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const endpointPath = resolvedWireApi === 'responses' ? DEFAULT_RESPONSES_PATH : DEFAULT_CHAT_COMPLETIONS_PATH
    const requestBody =
      resolvedWireApi === 'responses'
        ? {
            model: resolvedModel,
            input: [
              ...(normalizeText(systemPrompt)
                ? [
                    {
                      role: 'system',
                      content: [
                        {
                          type: 'input_text',
                          text: String(systemPrompt || ''),
                        },
                      ],
                    },
                  ]
                : []),
              {
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: String(userPrompt || ''),
                  },
                ],
              },
            ],
            temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.7,
            max_output_tokens: Number.isInteger(Number(maxTokens)) ? Number(maxTokens) : 2000,
            store: !resolvedDisableResponseStorage,
            ...(resolvedReasoningEffort
              ? {
                  reasoning: {
                    effort: resolvedReasoningEffort,
                  },
                }
              : {}),
          }
        : {
            model: resolvedModel,
            messages: [
              { role: 'system', content: String(systemPrompt || '') },
              { role: 'user', content: String(userPrompt || '') },
            ],
            temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.7,
            max_tokens: Number.isInteger(Number(maxTokens)) ? Number(maxTokens) : 2000,
            ...(resolvedResponseFormat ? { response_format: resolvedResponseFormat } : {}),
          }

    const response = await fetch(`${resolvedBaseUrl}${endpointPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolvedApiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    const text = await response.text()
    let payload = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.message ||
        `AI 调用失败，HTTP ${response.status}`
      throw new Error(message)
    }

    const content = extractCompletionContent(payload)
    if (!content) {
      const shapeSummary = buildPayloadShapeSummary(payload)
      const payloadPreview = truncateText(text, 500)
      throw new Error(`AI 未返回有效内容（${shapeSummary}）${payloadPreview ? `，返回预览：${payloadPreview}` : ''}`)
    }

    return {
      content: String(content),
      raw: payload,
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('AI 调用超时，请稍后重试')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

module.exports = {
  callChatCompletion,
}
