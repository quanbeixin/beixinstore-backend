const DeveloperAccount = require('../models/DeveloperAccount')

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

async function listDeveloperAccounts(req, res) {
  try {
    const data = await DeveloperAccount.list(req.query || {})
    return res.json({ success: true, data })
  } catch (error) {
    return handleError(res, error, '获取开发者账号列表失败')
  }
}

async function listDeveloperAccountOptions(req, res) {
  try {
    const data = await DeveloperAccount.listOptions()
    return res.json({ success: true, data })
  } catch (error) {
    return handleError(res, error, '获取开发者账号选项失败')
  }
}

async function createDeveloperAccount(req, res) {
  try {
    const data = await DeveloperAccount.create(req.body || {}, req.user?.id)
    return res.status(201).json({ success: true, message: '开发者账号已新增', data })
  } catch (error) {
    return handleError(res, error, '新增开发者账号失败')
  }
}

async function updateDeveloperAccount(req, res) {
  try {
    const data = await DeveloperAccount.update(req.params.id, req.body || {}, req.user?.id)
    if (!data) {
      return res.status(404).json({ success: false, message: '开发者账号不存在' })
    }
    return res.json({ success: true, message: '开发者账号已更新', data })
  } catch (error) {
    return handleError(res, error, '更新开发者账号失败')
  }
}

async function deleteDeveloperAccount(req, res) {
  try {
    const affected = await DeveloperAccount.softDelete(req.params.id, req.user?.id)
    if (!affected) {
      return res.status(404).json({ success: false, message: '开发者账号不存在' })
    }
    return res.json({ success: true, message: '开发者账号已删除' })
  } catch (error) {
    return handleError(res, error, '删除开发者账号失败')
  }
}

module.exports = {
  createDeveloperAccount,
  deleteDeveloperAccount,
  listDeveloperAccountOptions,
  listDeveloperAccounts,
  updateDeveloperAccount,
}
