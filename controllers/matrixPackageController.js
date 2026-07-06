const MatrixPackage = require('../models/MatrixPackage')

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

async function listMatrixPackages(req, res) {
  try {
    const data = await MatrixPackage.list(req.query || {})
    return res.json({ success: true, data })
  } catch (error) {
    return handleError(res, error, '获取矩阵包列表失败')
  }
}

async function createMatrixPackage(req, res) {
  try {
    const data = await MatrixPackage.create(req.body || {}, req.user?.id)
    return res.status(201).json({ success: true, message: '矩阵包已新增', data })
  } catch (error) {
    return handleError(res, error, '新增矩阵包失败')
  }
}

async function updateMatrixPackage(req, res) {
  try {
    const data = await MatrixPackage.update(req.params.id, req.body || {}, req.user?.id)
    if (!data) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    return res.json({ success: true, message: '矩阵包已更新', data })
  } catch (error) {
    return handleError(res, error, '更新矩阵包失败')
  }
}

async function deleteMatrixPackage(req, res) {
  try {
    const affected = await MatrixPackage.softDelete(req.params.id, req.user?.id)
    if (!affected) {
      return res.status(404).json({ success: false, message: '矩阵包不存在' })
    }
    return res.json({ success: true, message: '矩阵包已删除' })
  } catch (error) {
    return handleError(res, error, '删除矩阵包失败')
  }
}

module.exports = {
  listMatrixPackages,
  createMatrixPackage,
  updateMatrixPackage,
  deleteMatrixPackage,
}
