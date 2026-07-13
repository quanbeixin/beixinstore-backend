const AppVersionRelease = require('../models/AppVersionRelease')

function handleError(res, error, fallbackMessage) {
  const statusCode = Number(error?.statusCode || 500)
  if (statusCode >= 500) {
    console.error(fallbackMessage, error)
  }
  const response = {
    success: false,
    message: error?.message || fallbackMessage,
  }
  if (Array.isArray(error?.conflicts)) {
    response.conflicts = error.conflicts
  }
  return res.status(statusCode).json(response)
}

async function listAppVersionReleases(req, res) {
  try {
    const data = await AppVersionRelease.list(req.query || {})
    return res.json({ success: true, data })
  } catch (error) {
    return handleError(res, error, '获取APP版本发布列表失败')
  }
}

async function updateAppVersionRelease(req, res) {
  try {
    const data = await AppVersionRelease.update(req.params.id, req.body || {}, req.user?.id)
    if (!data) {
      return res.status(404).json({ success: false, message: 'APP发版记录不存在' })
    }
    return res.json({ success: true, message: 'APP发版记录已更新', data })
  } catch (error) {
    return handleError(res, error, '更新APP发版记录失败')
  }
}

async function createAppVersionReleaseApplications(req, res) {
  try {
    const data = await AppVersionRelease.createApplications(req.body || {}, req.user?.id)
    return res.status(201).json({
      success: true,
      message: `已创建 ${data.length} 条版本发布申请`,
      data,
    })
  } catch (error) {
    return handleError(res, error, '创建版本发布申请失败')
  }
}

async function deleteAppVersionRelease(req, res) {
  try {
    const affected = await AppVersionRelease.softDelete(req.params.id, req.user?.id)
    if (!affected) {
      return res.status(404).json({ success: false, message: 'APP发版记录不存在' })
    }
    return res.json({ success: true, message: 'APP发版记录已删除' })
  } catch (error) {
    return handleError(res, error, '删除APP发版记录失败')
  }
}

module.exports = {
  createAppVersionReleaseApplications,
  listAppVersionReleases,
  updateAppVersionRelease,
  deleteAppVersionRelease,
}
