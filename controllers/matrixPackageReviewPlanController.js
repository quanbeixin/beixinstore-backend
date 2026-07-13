const MatrixPackage = require('../models/MatrixPackage')
const MatrixPackageReviewPlan = require('../models/MatrixPackageReviewPlan')
const MatrixPackageNotificationService = require('../services/matrixPackageNotificationService')

function handleError(res, error, fallbackMessage) {
  const statusCode = Number(error?.statusCode || 500)
  if (statusCode >= 500) {
    console.error(fallbackMessage, error)
  }
  return res.status(statusCode).json({
    success: false,
    message: error?.message || fallbackMessage,
  })
}

async function triggerPackageStatusNotifications(beforePackage, packageId, operatorUserId) {
  if (!beforePackage) return
  const afterPackage = await MatrixPackage.getById(packageId)
  if (!afterPackage) return
  await MatrixPackageNotificationService.triggerStatusChangeNotifications({
    beforePackage,
    afterPackage,
    operatorUserId,
  })
}

async function listMatrixPackageReviewPlans(req, res) {
  try {
    const data = await MatrixPackageReviewPlan.list(req.query || {})
    return res.json({ success: true, data })
  } catch (error) {
    return handleError(res, error, '获取矩阵包送审排期失败')
  }
}

async function saveMatrixPackageReviewPlan(req, res) {
  try {
    const beforePackage = await MatrixPackage.getById(req.params.packageId)
    if (!beforePackage) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    const data = await MatrixPackageReviewPlan.save(req.params.packageId, req.body || {}, req.user?.id)
    await triggerPackageStatusNotifications(beforePackage, req.params.packageId, req.user?.id || null)
    return res.json({ success: true, message: '送审排期已保存', data })
  } catch (error) {
    return handleError(res, error, '保存矩阵包送审排期失败')
  }
}

async function transitionMatrixPackageReviewPlan(req, res) {
  try {
    const beforePackage = await MatrixPackage.getById(req.params.packageId)
    if (!beforePackage) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    const data = await MatrixPackageReviewPlan.transition(
      req.params.packageId,
      req.body?.review_stage_code,
      req.body || {},
      req.user?.id,
    )
    await triggerPackageStatusNotifications(beforePackage, req.params.packageId, req.user?.id || null)
    return res.json({ success: true, message: '送审阶段已更新', data })
  } catch (error) {
    return handleError(res, error, '更新矩阵包送审阶段失败')
  }
}

module.exports = {
  listMatrixPackageReviewPlans,
  saveMatrixPackageReviewPlan,
  transitionMatrixPackageReviewPlan,
}
