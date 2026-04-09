const UserFeedback = require('../models/UserFeedback')
const {
  analyzeSingleFeedback,
  analyzeUnprocessedFeedback,
  clearConfigCache,
} = require('../services/userFeedbackAnalysisService')

function parseBoolean(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  return null
}

function parsePositiveInt(value, fallback) {
  const num = Number.parseInt(value, 10)
  if (Number.isInteger(num) && num > 0) return num
  return fallback
}

function hasPagedQuery(query = {}) {
  return [
    'page',
    'pageSize',
    'searchText',
    'product',
    'status',
    'isNewRequest',
    'aiCategory',
    'dateStart',
    'dateEnd',
  ].some((key) => query[key] !== undefined)
}

async function getAllFeedback(req, res) {
  try {
    if (hasPagedQuery(req.query)) {
      const result = await UserFeedback.listFeedback({
        page: parsePositiveInt(req.query.page, 1),
        pageSize: parsePositiveInt(req.query.pageSize, 20),
        filters: {
          searchText: req.query.searchText,
          product: req.query.product,
          status: req.query.status,
          isNewRequest: parseBoolean(req.query.isNewRequest),
          aiCategory: req.query.aiCategory,
          dateStart: req.query.dateStart,
          dateEnd: req.query.dateEnd,
        },
      })

      return res.json({
        success: true,
        data: result.rows,
        pagination: result.pagination,
      })
    }

    const rows = await UserFeedback.listAllFeedback()
    return res.json({ success: true, data: rows })
  } catch (error) {
    console.error('获取反馈列表失败:', error)
    return res.status(500).json({ success: false, message: '获取反馈列表失败' })
  }
}

async function getFeedbackById(req, res) {
  try {
    const row = await UserFeedback.getById(req.params.id)
    if (!row) {
      return res.status(404).json({ success: false, message: '反馈不存在' })
    }
    return res.json({ success: true, data: row })
  } catch (error) {
    console.error('获取反馈详情失败:', error)
    return res.status(500).json({ success: false, message: '获取反馈详情失败' })
  }
}

async function createFeedback(req, res) {
  try {
    const created = await UserFeedback.create(req.body || {}, {
      operatorUserId: req.user?.id,
    })
    return res.status(201).json({
      success: true,
      message: '反馈创建成功',
      data: created,
    })
  } catch (error) {
    if (error?.code === 'INVALID_PAYLOAD') {
      return res.status(400).json({ success: false, message: error.message })
    }
    console.error('创建反馈失败:', error)
    return res.status(500).json({ success: false, message: '创建反馈失败' })
  }
}

async function updateFeedback(req, res) {
  try {
    const exists = await UserFeedback.getById(req.params.id)
    if (!exists) {
      return res.status(404).json({ success: false, message: '反馈不存在' })
    }

    const updated = await UserFeedback.update(req.params.id, req.body || {}, {
      operatorUserId: req.user?.id,
    })

    return res.json({
      success: true,
      message: '反馈更新成功',
      data: updated,
    })
  } catch (error) {
    console.error('更新反馈失败:', error)
    return res.status(500).json({ success: false, message: '更新反馈失败' })
  }
}

async function deleteFeedback(req, res) {
  try {
    const affectedRows = await UserFeedback.remove(req.params.id)
    if (!affectedRows) {
      return res.status(404).json({ success: false, message: '反馈不存在' })
    }
    return res.json({ success: true, message: '反馈删除成功' })
  } catch (error) {
    console.error('删除反馈失败:', error)
    return res.status(500).json({ success: false, message: '删除反馈失败' })
  }
}

async function updateFeedbackStatus(req, res) {
  try {
    const status = req.body?.status
    if (!status) {
      return res.status(400).json({ success: false, message: 'status 不能为空' })
    }

    const updated = await UserFeedback.updateStatus(req.params.id, status, {
      operatorUserId: req.user?.id,
    })
    if (!updated) {
      return res.status(404).json({ success: false, message: '反馈不存在' })
    }

    return res.json({
      success: true,
      message: '状态更新成功',
      data: updated,
    })
  } catch (error) {
    console.error('更新反馈状态失败:', error)
    return res.status(500).json({ success: false, message: '更新反馈状态失败' })
  }
}

async function batchUpdateStatus(req, res) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    const status = req.body?.status

    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'ids 不能为空' })
    }
    if (!status) {
      return res.status(400).json({ success: false, message: 'status 不能为空' })
    }

    const data = await UserFeedback.batchUpdateStatus(ids, status, {
      operatorUserId: req.user?.id,
    })

    return res.json({
      success: true,
      message: '批量更新成功',
      data,
    })
  } catch (error) {
    console.error('批量更新反馈状态失败:', error)
    return res.status(500).json({ success: false, message: '批量更新反馈状态失败' })
  }
}

async function batchImport(req, res) {
  try {
    const list = Array.isArray(req.body)
      ? req.body
      : Array.isArray(req.body?.feedbacks)
        ? req.body.feedbacks
        : []

    const data = await UserFeedback.batchImport(list, {
      operatorUserId: req.user?.id,
    })

    return res.json({
      success: true,
      message: `成功导入 ${data.length} 条数据`,
      data,
    })
  } catch (error) {
    if (error?.code === 'INVALID_PAYLOAD') {
      return res.status(400).json({ success: false, message: error.message })
    }
    console.error('批量导入反馈失败:', error)
    return res.status(500).json({ success: false, message: '批量导入反馈失败' })
  }
}

async function analyzeUnprocessed(req, res) {
  try {
    const limit = parsePositiveInt(req.query.limit, 10)
    const result = await analyzeUnprocessedFeedback(limit, {
      operatorUserId: req.user?.id,
    })
    return res.json(result)
  } catch (error) {
    console.error('批量 AI 分析失败:', error)
    return res.status(500).json({
      success: false,
      message: 'AI 分析失败',
      error: error?.message,
    })
  }
}

async function analyzeSingle(req, res) {
  try {
    const result = await analyzeSingleFeedback(req.params.id, {
      operatorUserId: req.user?.id,
    })
    return res.json(result)
  } catch (error) {
    if (error?.code === 'NOT_FOUND') {
      return res.status(404).json({ success: false, message: error.message })
    }
    console.error('单条 AI 分析失败:', error)
    return res.status(500).json({
      success: false,
      message: 'AI 分析失败',
      error: error?.message,
    })
  }
}

async function getPromptConfig(req, res) {
  try {
    const config = await UserFeedback.getPromptConfig()
    return res.json({ success: true, data: config })
  } catch (error) {
    console.error('获取 AI Prompt 配置失败:', error)
    return res.status(500).json({ success: false, message: '获取配置失败' })
  }
}

async function updatePromptConfig(req, res) {
  try {
    const config = await UserFeedback.updatePromptConfig(req.body || {}, {
      operatorUserId: req.user?.id,
    })
    clearConfigCache()

    return res.json({
      success: true,
      message: '配置更新成功',
      data: config,
    })
  } catch (error) {
    console.error('更新 AI Prompt 配置失败:', error)
    return res.status(500).json({ success: false, message: '更新配置失败' })
  }
}

module.exports = {
  getAllFeedback,
  getFeedbackById,
  createFeedback,
  updateFeedback,
  deleteFeedback,
  updateFeedbackStatus,
  batchUpdateStatus,
  batchImport,
  analyzeUnprocessed,
  analyzeSingle,
  getPromptConfig,
  updatePromptConfig,
}
