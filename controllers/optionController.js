const Option = require('../models/Option')

function normalizeTypeLabel() {
  return '角色'
}

function normalizeName(value) {
  return (value || '').trim()
}

function normalizeRoleKeyInput(value) {
  const raw = String(value || '').trim()
  return raw || null
}

const getOptions = async (req, res) => {
  const { type } = req.query

  try {
    if (type) {
      if (!Option.isValidType(type)) {
        return res.status(400).json({ success: false, message: '不支持的选项类型' })
      }

      const list = await Option.listByType(type)
      return res.json({ success: true, data: list })
    }

    const roles = await Option.listByType('roles')
    return res.json({ success: true, data: { roles } })
  } catch (err) {
    console.error('获取选项失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createOption = async (req, res) => {
  const { type } = req.params
  const name = normalizeName(req.body.name)
  const payload = { name }
  if (Object.prototype.hasOwnProperty.call(req.body, 'role_key')) {
    payload.role_key = normalizeRoleKeyInput(req.body.role_key)
  }

  if (!Option.isValidType(type)) {
    return res.status(400).json({ success: false, message: '不支持的选项类型' })
  }

  if (!name) {
    return res.status(400).json({ success: false, message: '名称不能为空' })
  }

  try {
    const existing = await Option.findByName(type, name)
    if (existing) {
      return res.status(409).json({ success: false, message: `${normalizeTypeLabel(type)}名称已存在` })
    }

    const id = await Option.create(type, payload)
    const created = await Option.findById(type, id)

    return res.status(201).json({
      success: true,
      message: '创建成功',
      data: created,
    })
  } catch (err) {
    if (err.code === 'ROLE_KEY_EXISTS') {
      return res.status(409).json({ success: false, message: err.message })
    }

    console.error('创建选项失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateOption = async (req, res) => {
  const { type, id } = req.params
  const name = normalizeName(req.body.name)
  const payload = { name }
  if (Object.prototype.hasOwnProperty.call(req.body, 'role_key')) {
    payload.role_key = normalizeRoleKeyInput(req.body.role_key)
  }

  if (!Option.isValidType(type)) {
    return res.status(400).json({ success: false, message: '不支持的选项类型' })
  }

  if (!name) {
    return res.status(400).json({ success: false, message: '名称不能为空' })
  }

  try {
    const existing = await Option.findById(type, id)
    if (!existing) {
      return res.status(404).json({ success: false, message: '选项不存在' })
    }

    const duplicated = await Option.findByName(type, name)
    if (duplicated && duplicated.id !== Number(id)) {
      return res.status(409).json({ success: false, message: `${normalizeTypeLabel(type)}名称已存在` })
    }

    await Option.update(type, id, payload)
    const updated = await Option.findById(type, id)

    return res.json({
      success: true,
      message: '更新成功',
      data: updated,
    })
  } catch (err) {
    if (err.code === 'ROLE_KEY_EXISTS') {
      return res.status(409).json({ success: false, message: err.message })
    }

    console.error('更新选项失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteOption = async (req, res) => {
  const { type, id } = req.params

  if (!Option.isValidType(type)) {
    return res.status(400).json({ success: false, message: '不支持的选项类型' })
  }

  try {
    const affected = await Option.remove(type, id)
    if (!affected) {
      return res.status(404).json({ success: false, message: '选项不存在' })
    }

    return res.json({ success: true, message: '删除成功' })
  } catch (err) {
    if (err.code === 'OPTION_IN_USE') {
      return res.status(409).json({ success: false, message: err.message })
    }

    console.error('删除选项失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  getOptions,
  createOption,
  updateOption,
  deleteOption,
}
