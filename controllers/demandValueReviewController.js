const DemandValueReview = require('../models/DemandValueReview')

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

function normalizeDemandId(value) {
  return normalizeText(value, 64).toUpperCase()
}

function isAdmin(req) {
  if (req.userAccess?.is_super_admin) return true
  const roleKeys = Array.isArray(req.userAccess?.role_keys) ? req.userAccess.role_keys : []
  return roleKeys.includes('ADMIN')
}

function ensureAdmin(req, res) {
  if (isAdmin(req)) return true
  res.status(403).json({ success: false, message: '仅管理员可操作需求价值复盘' })
  return false
}

const initDemandValueReview = async (req, res) => {
  if (!ensureAdmin(req, res)) return

  const demandId = normalizeDemandId(req.params.demandId)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  try {
    const data = await DemandValueReview.initForDemand(
      demandId,
      req.user?.id,
      req.body?.participant_user_ids,
    )
    return res.json({
      success: true,
      message: data?.created ? '价值复盘已发起' : '价值复盘已存在',
      data,
    })
  } catch (err) {
    if (err?.code === 'DEMAND_NOT_FOUND') {
      return res.status(404).json({ success: false, message: err.message })
    }
    if (err?.code === 'DEMAND_NOT_DONE') {
      return res.status(400).json({ success: false, message: err.message })
    }
    if (err?.code === 'PARTICIPANT_REQUIRED') {
      return res.status(400).json({ success: false, message: err.message })
    }
    console.error('发起需求价值复盘失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateDemandValueReviewParticipants = async (req, res) => {
  if (!ensureAdmin(req, res)) return

  const reviewId = toPositiveInt(req.params.id)
  if (!reviewId) {
    return res.status(400).json({ success: false, message: '复盘 ID 无效' })
  }

  try {
    const data = await DemandValueReview.updateParticipants(
      reviewId,
      req.body?.participant_user_ids,
      req.user?.id,
    )
    return res.json({ success: true, message: '复盘参与人已更新', data })
  } catch (err) {
    if (['NOT_FOUND'].includes(err?.code)) {
      return res.status(404).json({ success: false, message: err.message })
    }
    if (['PARTICIPANT_REQUIRED', 'COMPLETED_IMMUTABLE'].includes(err?.code)) {
      return res.status(400).json({ success: false, message: err.message })
    }
    console.error('更新复盘参与人失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listDemandValueReviews = async (req, res) => {
  if (!ensureAdmin(req, res)) return

  try {
    const data = await DemandValueReview.list({
      keyword: req.query.keyword,
      status: req.query.status,
      ownerUserId: req.query.owner_user_id,
      startDate: normalizeDate(req.query.start_date),
      endDate: normalizeDate(req.query.end_date),
      sortBy: req.query.sort_by,
      sortOrder: req.query.sort_order,
      page: req.query.page,
      pageSize: req.query.pageSize,
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取需求价值复盘列表失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getDemandValueReviewDetail = async (req, res) => {
  if (!ensureAdmin(req, res)) return

  const reviewId = toPositiveInt(req.params.id)
  if (!reviewId) {
    return res.status(400).json({ success: false, message: '复盘 ID 无效' })
  }

  try {
    const data = await DemandValueReview.getDetailById(reviewId)
    if (!data) {
      return res.status(404).json({ success: false, message: '复盘任务不存在' })
    }
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取需求价值复盘详情失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateDemandValueReviewDraft = async (req, res) => {
  if (!ensureAdmin(req, res)) return

  const reviewId = toPositiveInt(req.params.id)
  if (!reviewId) {
    return res.status(400).json({ success: false, message: '复盘 ID 无效' })
  }

  try {
    const data = await DemandValueReview.updateDraft(
      reviewId,
      {
        overall_score: req.body.overall_score,
        review_value_summary: req.body.review_value_summary,
        review_benefit_result: req.body.review_benefit_result,
        review_improvement_notes: req.body.review_improvement_notes,
      },
      req.user?.id,
    )
    return res.json({ success: true, message: '复盘草稿已保存', data })
  } catch (err) {
    if (['NOT_FOUND'].includes(err?.code)) {
      return res.status(404).json({ success: false, message: err.message })
    }
    if (['INVALID_SCORE', 'COMPLETED_IMMUTABLE'].includes(err?.code)) {
      return res.status(400).json({ success: false, message: err.message })
    }
    console.error('更新需求价值复盘失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const submitDemandValueReview = async (req, res) => {
  if (!ensureAdmin(req, res)) return

  const reviewId = toPositiveInt(req.params.id)
  if (!reviewId) {
    return res.status(400).json({ success: false, message: '复盘 ID 无效' })
  }

  try {
    const data = await DemandValueReview.submit(
      reviewId,
      {
        overall_score: req.body.overall_score,
        review_value_summary: req.body.review_value_summary,
        review_benefit_result: req.body.review_benefit_result,
        review_improvement_notes: req.body.review_improvement_notes,
      },
      req.user?.id,
    )
    return res.json({ success: true, message: '需求价值复盘已提交', data })
  } catch (err) {
    if (['NOT_FOUND'].includes(err?.code)) {
      return res.status(404).json({ success: false, message: err.message })
    }
    if (['INVALID_SUBMIT_PAYLOAD', 'SKIPPED_IMMUTABLE'].includes(err?.code)) {
      return res.status(400).json({ success: false, message: err.message })
    }
    console.error('提交需求价值复盘失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const skipDemandValueReview = async (req, res) => {
  if (!ensureAdmin(req, res)) return

  const reviewId = toPositiveInt(req.params.id)
  if (!reviewId) {
    return res.status(400).json({ success: false, message: '复盘 ID 无效' })
  }

  try {
    const data = await DemandValueReview.skip(reviewId, req.body?.skip_reason, req.user?.id)
    return res.json({ success: true, message: '已标记为无需复盘', data })
  } catch (err) {
    if (['NOT_FOUND'].includes(err?.code)) {
      return res.status(404).json({ success: false, message: err.message })
    }
    if (['SKIP_REASON_REQUIRED', 'INVALID_SKIP_STATUS'].includes(err?.code)) {
      return res.status(400).json({ success: false, message: err.message })
    }
    console.error('标记无需复盘失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const unskipDemandValueReview = async (req, res) => {
  if (!ensureAdmin(req, res)) return

  const reviewId = toPositiveInt(req.params.id)
  if (!reviewId) {
    return res.status(400).json({ success: false, message: '复盘 ID 无效' })
  }

  try {
    const data = await DemandValueReview.unskip(reviewId, req.user?.id)
    return res.json({ success: true, message: '已撤销无需复盘', data })
  } catch (err) {
    if (['NOT_FOUND'].includes(err?.code)) {
      return res.status(404).json({ success: false, message: err.message })
    }
    if (['INVALID_UNSKIP_STATUS'].includes(err?.code)) {
      return res.status(400).json({ success: false, message: err.message })
    }
    console.error('撤销无需复盘失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getDemandValueReviewByDemandId = async (req, res) => {
  if (!ensureAdmin(req, res)) return

  const demandId = normalizeDemandId(req.params.demandId)
  if (!demandId) {
    return res.status(400).json({ success: false, message: '需求 ID 无效' })
  }

  try {
    const record = await DemandValueReview.getReviewMapByDemandIds([demandId])
    return res.json({
      success: true,
      data: record[demandId] || null,
    })
  } catch (err) {
    console.error('获取需求复盘状态失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getDemandValueReviewMap = async (req, res) => {
  if (!ensureAdmin(req, res)) return
  const demandIds = String(req.query.demand_ids || '')
    .split(',')
    .map((item) => normalizeDemandId(item))
    .filter(Boolean)
  if (demandIds.length === 0) {
    return res.json({ success: true, data: {} })
  }
  try {
    const data = await DemandValueReview.getReviewMapByDemandIds(demandIds)
    return res.json({ success: true, data })
  } catch (err) {
    console.error('批量获取需求复盘状态失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const listMyDemandValueReviews = async (req, res) => {
  try {
    const data = await DemandValueReview.listMyPendingReviews(req.user?.id, {
      page: req.query.page,
      pageSize: req.query.pageSize,
    })
    return res.json({ success: true, data })
  } catch (err) {
    console.error('获取我的复盘任务列表失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getMyDemandValueReviewDetail = async (req, res) => {
  const reviewId = toPositiveInt(req.params.id)
  if (!reviewId) {
    return res.status(400).json({ success: false, message: '复盘 ID 无效' })
  }
  try {
    const data = await DemandValueReview.getMyReviewDetail(reviewId, req.user?.id)
    if (!data) {
      return res.status(404).json({ success: false, message: '复盘任务不存在' })
    }
    return res.json({ success: true, data })
  } catch (err) {
    if (err?.code === 'FORBIDDEN') {
      return res.status(403).json({ success: false, message: err.message })
    }
    console.error('获取我的复盘任务详情失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const submitMyDemandValueReviewScore = async (req, res) => {
  const reviewId = toPositiveInt(req.params.id)
  if (!reviewId) {
    return res.status(400).json({ success: false, message: '复盘 ID 无效' })
  }
  try {
    const data = await DemandValueReview.submitMyScore(reviewId, req.user?.id, {
      completion_score: req.body?.completion_score,
      value_score: req.body?.value_score,
      score_reason: req.body?.score_reason,
    })
    return res.json({ success: true, message: '复盘评价已提交', data })
  } catch (err) {
    if (['NOT_FOUND'].includes(err?.code)) {
      return res.status(404).json({ success: false, message: err.message })
    }
    if (['FORBIDDEN'].includes(err?.code)) {
      return res.status(403).json({ success: false, message: err.message })
    }
    if (['INVALID_SUBMIT_PAYLOAD', 'REVIEW_COMPLETED', 'REVIEW_SKIPPED'].includes(err?.code)) {
      return res.status(400).json({ success: false, message: err.message })
    }
    console.error('提交我的复盘评价失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  initDemandValueReview,
  updateDemandValueReviewParticipants,
  listDemandValueReviews,
  getDemandValueReviewDetail,
  updateDemandValueReviewDraft,
  submitDemandValueReview,
  skipDemandValueReview,
  unskipDemandValueReview,
  getDemandValueReviewByDemandId,
  getDemandValueReviewMap,
  listMyDemandValueReviews,
  getMyDemandValueReviewDetail,
  submitMyDemandValueReviewScore,
}
