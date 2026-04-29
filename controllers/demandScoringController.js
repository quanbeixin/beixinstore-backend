const DemandScoring = require('../models/DemandScoring')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeText(value, maxLen = 255) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeDate(value) {
  const text = normalizeText(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function isSuperAdmin(req) {
  return Boolean(req.userAccess?.is_super_admin)
}

const listMyDemandScoreSlots = async (req, res) => {
  try {
    const data = await DemandScoring.listMySlots(req.user?.id, {
      status: req.query.status,
      page: req.query.page,
      pageSize: req.query.pageSize,
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取我的需求评分任务失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getMyDemandScoreSlot = async (req, res) => {
  const slotId = toPositiveInt(req.params.slotId)
  if (!slotId) {
    return res.status(400).json({ success: false, message: '评分任务 ID 无效' })
  }

  try {
    const slot = await DemandScoring.getSlotForEvaluator(slotId, req.user?.id)
    if (!slot) {
      return res.status(404).json({ success: false, message: '评分任务不存在或无权限' })
    }
    return res.json({ success: true, data: slot })
  } catch (err) {
    console.error('获取需求评分任务详情失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const submitMyDemandScoreSlot = async (req, res) => {
  const slotId = toPositiveInt(req.params.slotId)
  if (!slotId) {
    return res.status(400).json({ success: false, message: '评分任务 ID 无效' })
  }

  try {
    const slot = await DemandScoring.submitSlot(slotId, req.user?.id, {
      score: req.body.score,
      comment: req.body.comment,
    })
    return res.json({ success: true, message: '评分已提交', data: slot })
  } catch (err) {
    if (['INVALID_SCORE', 'COMMENT_REQUIRED', 'SLOT_NOT_FOUND'].includes(err?.code)) {
      return res.status(err.code === 'SLOT_NOT_FOUND' ? 404 : 400).json({
        success: false,
        message: err.message,
      })
    }
    console.error('提交需求评分失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const generateDemandScoreTask = async (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ success: false, message: '仅超管可手动生成评分任务' })
  }

  const demandId = normalizeText(req.params.demandId, 64).toUpperCase()
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  try {
    if (
      (req.body?.force_rebuild === true || req.body?.force_rebuild === 1 || req.body?.force_rebuild === '1') &&
      await DemandScoring.hasSubmittedRecordsForDemand(demandId)
    ) {
      return res.status(400).json({
        success: false,
        message: '当前需求评分任务已存在已提交评分，禁止重建，请联系管理员人工处理',
      })
    }

    const result = await DemandScoring.ensureTaskForDemand(demandId, {
      operatorUserId: req.user?.id,
      forceRebuild: req.body?.force_rebuild === true || req.body?.force_rebuild === 1 || req.body?.force_rebuild === '1',
    })
    return res.json({ success: true, message: result.created ? '评分任务已生成' : '评分任务已存在', data: result })
  } catch (err) {
    if (err?.code === 'DEMAND_NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message })
    }
    if (
      err?.code === 'DEMAND_NOT_DONE' ||
      err?.code === 'DEMAND_NOT_IN_SCORING_WINDOW' ||
      err?.code === 'DEMAND_ACTUAL_HOURS_ZERO'
    ) {
      return res.status(400).json({ success: false, message: err.message })
    }
    console.error('生成需求评分任务失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listDemandScoreResults = async (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ success: false, message: '仅超管可查看评分结果' })
  }

  try {
    const data = await DemandScoring.listResultDemands({
      keyword: req.query.keyword,
      startDate: normalizeDate(req.query.start_date),
      endDate: normalizeDate(req.query.end_date),
      page: req.query.page,
      pageSize: req.query.pageSize,
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取需求评分结果失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getDemandScoreResultDetail = async (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ success: false, message: '仅超管可查看评分结果' })
  }

  const taskId = toPositiveInt(req.params.taskId)
  if (!taskId) {
    return res.status(400).json({ success: false, message: '评分结果 ID 无效' })
  }

  try {
    const data = await DemandScoring.getDemandResult(taskId)
    if (!data) {
      return res.status(404).json({ success: false, message: '评分结果不存在或尚未生成' })
    }
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取需求评分结果详情失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listDemandScoreTeamRanking = async (req, res) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ success: false, message: '仅超管可查看评分排行' })
  }

  try {
    const data = await DemandScoring.listTeamRanking({
      startDate: normalizeDate(req.query.start_date),
      endDate: normalizeDate(req.query.end_date),
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取需求评分团队排行失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  listMyDemandScoreSlots,
  getMyDemandScoreSlot,
  submitMyDemandScoreSlot,
  generateDemandScoreTask,
  listDemandScoreResults,
  getDemandScoreResultDetail,
  listDemandScoreTeamRanking,
}
