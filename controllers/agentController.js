const Agent = require('../models/Agent')
const { AGENT_SCENES, executeAgentForScene } = require('../services/agentExecutionService')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeText(value, maxLength = 0) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (maxLength > 0) return text.slice(0, maxLength)
  return text
}

function toBool(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function hasAdminRole(req) {
  if (req.userAccess?.is_super_admin) return true
  const roleKeys = Array.isArray(req.userAccess?.role_keys) ? req.userAccess.role_keys : []
  return roleKeys.includes('ADMIN')
}

function ensureAdmin(req, res) {
  if (hasAdminRole(req)) return true
  res.status(403).json({ success: false, message: '仅管理员可维护 Agent 配置' })
  return false
}

function normalizeSceneCode(value) {
  const sceneCode = normalizeText(value, 64).toUpperCase()
  return AGENT_SCENES[sceneCode] ? sceneCode : ''
}

function normalizeAgentPayload(body = {}, operatorUserId = null) {
  const sceneCode = normalizeSceneCode(body.scene_code)
  const model = normalizeText(body.model, 64)
  const systemPrompt = String(body.system_prompt || '').trim()

  return {
    agent_code: normalizeText(body.agent_code, 64).toUpperCase(),
    agent_name: normalizeText(body.agent_name, 128),
    business_purpose: normalizeText(body.business_purpose, 255),
    scene_code: sceneCode,
    description: normalizeText(body.description, 500),
    model,
    system_prompt: systemPrompt,
    output_format_instruction: normalizeText(body.output_format_instruction),
    temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.7,
    max_tokens: Number.isInteger(Number(body.max_tokens)) ? Number(body.max_tokens) : 2000,
    enabled: Number(body.enabled) === 0 ? 0 : 1,
    sort_order: Number.isInteger(Number(body.sort_order)) ? Number(body.sort_order) : 100,
    created_by: operatorUserId,
    updated_by: operatorUserId,
  }
}

function validateAgentPayload(payload = {}) {
  if (!payload.agent_code) return 'Agent 编码不能为空'
  if (!payload.agent_name) return 'Agent 名称不能为空'
  if (!payload.business_purpose) return '业务定位不能为空'
  if (!payload.scene_code) return '场景编码无效'
  if (!payload.model) return '模型不能为空'
  if (!payload.system_prompt) return 'System Prompt 不能为空'
  if (!Number.isFinite(Number(payload.temperature)) || Number(payload.temperature) < 0 || Number(payload.temperature) > 2) {
    return 'Temperature 必须在 0 到 2 之间'
  }
  if (!Number.isInteger(Number(payload.max_tokens)) || Number(payload.max_tokens) <= 0) {
    return 'Max Tokens 必须是正整数'
  }
  return ''
}

async function listAgents(req, res) {
  if (!ensureAdmin(req, res)) return
  try {
    const enabled = toBool(req.query.enabled, null)
    const rows = await Agent.listAgents({
      sceneCode: req.query.scene_code,
      enabled: enabled === null ? null : enabled ? 1 : 0,
      keyword: req.query.keyword,
    })
    return res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取 Agent 列表失败:', error)
    return res.status(500).json({ success: false, message: '获取 Agent 列表失败' })
  }
}

async function getAgentById(req, res) {
  if (!ensureAdmin(req, res)) return
  try {
    const id = toPositiveInt(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Agent ID 无效' })
    }
    const row = await Agent.getAgentById(id)
    if (!row) {
      return res.status(404).json({ success: false, message: 'Agent 不存在' })
    }
    return res.json({ success: true, data: row })
  } catch (error) {
    console.error('获取 Agent 详情失败:', error)
    return res.status(500).json({ success: false, message: '获取 Agent 详情失败' })
  }
}

async function createAgent(req, res) {
  if (!ensureAdmin(req, res)) return
  try {
    const payload = normalizeAgentPayload(req.body, req.user?.id)
    const validationMessage = validateAgentPayload(payload)
    if (validationMessage) {
      return res.status(400).json({ success: false, message: validationMessage })
    }
    const created = await Agent.createAgent(payload)
    return res.json({ success: true, message: 'Agent 创建成功', data: created })
  } catch (error) {
    console.error('创建 Agent 失败:', error)
    const message = error?.code === 'ER_DUP_ENTRY' ? 'Agent 编码已存在' : '创建 Agent 失败'
    return res.status(500).json({ success: false, message })
  }
}

async function updateAgent(req, res) {
  if (!ensureAdmin(req, res)) return
  try {
    const id = toPositiveInt(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Agent ID 无效' })
    }
    const existing = await Agent.getAgentById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Agent 不存在' })
    }
    const payload = normalizeAgentPayload(req.body, req.user?.id)
    const validationMessage = validateAgentPayload(payload)
    if (validationMessage) {
      return res.status(400).json({ success: false, message: validationMessage })
    }
    const updated = await Agent.updateAgent(id, payload)
    return res.json({ success: true, message: 'Agent 更新成功', data: updated })
  } catch (error) {
    console.error('更新 Agent 失败:', error)
    const message = error?.code === 'ER_DUP_ENTRY' ? 'Agent 编码已存在' : '更新 Agent 失败'
    return res.status(500).json({ success: false, message })
  }
}

async function updateAgentEnabled(req, res) {
  if (!ensureAdmin(req, res)) return
  try {
    const id = toPositiveInt(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: 'Agent ID 无效' })
    }
    const existing = await Agent.getAgentById(id)
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Agent 不存在' })
    }
    const enabled = toBool(req.body.enabled, null)
    if (enabled === null) {
      return res.status(400).json({ success: false, message: 'enabled 参数无效' })
    }
    const updated = await Agent.setAgentEnabled(id, enabled ? 1 : 0, req.user?.id)
    return res.json({ success: true, message: 'Agent 状态更新成功', data: updated })
  } catch (error) {
    console.error('更新 Agent 状态失败:', error)
    return res.status(500).json({ success: false, message: '更新 Agent 状态失败' })
  }
}

async function getAgentOptions(req, res) {
  try {
    const sceneCode = normalizeSceneCode(req.query.scene_code)
    if (!sceneCode) {
      return res.status(400).json({ success: false, message: 'scene_code 无效' })
    }
    const rows = await Agent.listAgentOptions(sceneCode)
    return res.json({
      success: true,
      data: {
        scene_code: sceneCode,
        scene_name: AGENT_SCENES[sceneCode]?.label || sceneCode,
        options: rows,
      },
    })
  } catch (error) {
    console.error('获取 Agent 选项失败:', error)
    return res.status(500).json({ success: false, message: '获取 Agent 选项失败' })
  }
}

async function executeAgent(req, res) {
  try {
    const userId = toPositiveInt(req.user?.id)
    if (!userId) {
      return res.status(401).json({ success: false, message: '未登录' })
    }

    const sceneCode = normalizeSceneCode(req.body.scene_code)
    const agentId = toPositiveInt(req.body.agent_id)
    if (!sceneCode) {
      return res.status(400).json({ success: false, message: 'scene_code 无效' })
    }
    if (!agentId) {
      return res.status(400).json({ success: false, message: 'agent_id 无效' })
    }

    const roleKeys = Array.isArray(req.userAccess?.role_keys) ? req.userAccess.role_keys : []
    const canViewAll = Boolean(req.userAccess?.is_super_admin) || roleKeys.includes('ADMIN')

    const data = await executeAgentForScene({
      sceneCode,
      agentId,
      operatorUserId: userId,
      canViewAll,
      contextParams: req.body.context_params && typeof req.body.context_params === 'object'
        ? req.body.context_params
        : {},
    })

    return res.json({ success: true, message: '分析完成', data })
  } catch (error) {
    console.error('执行 Agent 失败:', error)
    return res.status(500).json({
      success: false,
      message: error?.message || '执行 Agent 失败',
    })
  }
}

module.exports = {
  listAgents,
  getAgentById,
  createAgent,
  updateAgent,
  updateAgentEnabled,
  getAgentOptions,
  executeAgent,
}
