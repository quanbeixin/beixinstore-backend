const DEFAULT_CHAT_COMPLETIONS_PATH = '/chat/completions'

function normalizeText(value) {
  return String(value || '').trim()
}

function resolveApiKey() {
  return (
    normalizeText(process.env.AGENT_AI_API_KEY) ||
    normalizeText(process.env.OPENAI_API_KEY) ||
    normalizeText(process.env.DEEPSEEK_API_KEY)
  )
}

function resolveBaseUrl() {
  return (
    normalizeText(process.env.AGENT_AI_BASE_URL) ||
    normalizeText(process.env.OPENAI_BASE_URL) ||
    normalizeText(process.env.DEEPSEEK_BASE_URL) ||
    'https://api.openai.com/v1'
  ).replace(/\/+$/, '')
}

function resolveDefaultModel() {
  return normalizeText(process.env.AGENT_AI_DEFAULT_MODEL) || 'gpt-4o-mini'
}

async function callChatCompletion({
  model,
  systemPrompt,
  userPrompt,
  temperature = 0.7,
  maxTokens = 2000,
}) {
  const apiKey = resolveApiKey()
  if (!apiKey) {
    throw new Error('未配置 AI API Key，请先设置 AGENT_AI_API_KEY 或 OPENAI_API_KEY')
  }

  const controller = new AbortController()
  const timeoutMs = Number.isFinite(Number(process.env.AGENT_AI_TIMEOUT_MS))
    ? Math.max(3000, Number(process.env.AGENT_AI_TIMEOUT_MS))
    : 90000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${resolveBaseUrl()}${DEFAULT_CHAT_COMPLETIONS_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: normalizeText(model) || resolveDefaultModel(),
        messages: [
          { role: 'system', content: String(systemPrompt || '') },
          { role: 'user', content: String(userPrompt || '') },
        ],
        temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.7,
        max_tokens: Number.isInteger(Number(maxTokens)) ? Number(maxTokens) : 2000,
      }),
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

    const content = payload?.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('AI 未返回有效内容')
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
