const ConfigDict = require('../models/ConfigDict')

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullable(value) {
  const text = normalizeText(value)
  return text || null
}

function normalizeBool(value, defaultValue = 1) {
  if (value === undefined || value === null || value === '') {
    return defaultValue
  }

  return value === true || value === 'true' || value === 1 || value === '1' ? 1 : 0
}

function normalizeNumber(value, defaultValue = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : defaultValue
}

function isValidTypeKey(typeKey) {
  return /^[a-z][a-z0-9_]{1,63}$/.test(typeKey)
}

function isValidItemCode(itemCode) {
  return /^[A-Za-z][A-Za-z0-9_]{1,63}$/.test(itemCode)
}

const getDictTypes = async (req, res) => {
  try {
    const enabledOnly = req.query.enabledOnly === 'true'
    const rows = await ConfigDict.listTypes({ enabledOnly })
    res.json({ success: true, data: rows })
  } catch (err) {
    console.error('获取字典类型失败:', err)
    res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createDictType = async (req, res) => {
  const typeKey = normalizeText(req.body.typeKey)
  const typeName = normalizeText(req.body.typeName)

  if (!isValidTypeKey(typeKey)) {
    return res.status(400).json({ success: false, message: 'typeKey 格式不正确（示例: user_status）' })
  }

  if (!typeName) {
    return res.status(400).json({ success: false, message: 'typeName 不能为空' })
  }

  try {
    const existing = await ConfigDict.getTypeByKey(typeKey)
    if (existing) {
      return res.status(409).json({ success: false, message: 'typeKey 已存在' })
    }

    await ConfigDict.createType({
      typeKey,
      typeName,
      description: normalizeNullable(req.body.description),
      enabled: normalizeBool(req.body.enabled, 1),
      isBuiltin: 0,
    })

    const created = await ConfigDict.getTypeByKey(typeKey)
    return res.status(201).json({ success: true, message: '创建成功', data: created })
  } catch (err) {
    console.error('创建字典类型失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateDictType = async (req, res) => {
  const { typeKey } = req.params
  const typeName = normalizeText(req.body.typeName)

  if (!typeName) {
    return res.status(400).json({ success: false, message: 'typeName 不能为空' })
  }

  try {
    const existing = await ConfigDict.getTypeByKey(typeKey)
    if (!existing) {
      return res.status(404).json({ success: false, message: '字典类型不存在' })
    }

    await ConfigDict.updateType(typeKey, {
      typeName,
      description: normalizeNullable(req.body.description),
      enabled: normalizeBool(req.body.enabled, existing.enabled),
    })

    const updated = await ConfigDict.getTypeByKey(typeKey)
    return res.json({ success: true, message: '更新成功', data: updated })
  } catch (err) {
    console.error('更新字典类型失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteDictType = async (req, res) => {
  const { typeKey } = req.params

  try {
    const existing = await ConfigDict.getTypeByKey(typeKey)
    if (!existing) {
      return res.status(404).json({ success: false, message: '字典类型不存在' })
    }

    if (existing.is_builtin) {
      return res.status(400).json({ success: false, message: '内置类型不允许删除' })
    }

    const itemCount = await ConfigDict.countItemsByType(typeKey)
    if (itemCount > 0) {
      return res.status(409).json({ success: false, message: '请先删除该类型下的字典项' })
    }

    await ConfigDict.deleteType(typeKey)
    return res.json({ success: true, message: '删除成功' })
  } catch (err) {
    console.error('删除字典类型失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const getDictItems = async (req, res) => {
  const typeKey = normalizeText(req.query.typeKey)
  if (!typeKey) {
    return res.status(400).json({ success: false, message: 'typeKey 不能为空' })
  }

  try {
    const type = await ConfigDict.getTypeByKey(typeKey)
    if (!type) {
      return res.status(404).json({ success: false, message: '字典类型不存在' })
    }

    const enabledOnly = req.query.enabledOnly === 'true'
    const rows = await ConfigDict.listItems(typeKey, { enabledOnly })
    return res.json({ success: true, data: rows })
  } catch (err) {
    console.error('获取字典项失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const createDictItem = async (req, res) => {
  const typeKey = normalizeText(req.body.typeKey)
  const itemCode = normalizeText(req.body.itemCode).toUpperCase()
  const itemName = normalizeText(req.body.itemName)

  if (!typeKey) {
    return res.status(400).json({ success: false, message: 'typeKey 不能为空' })
  }

  if (!isValidItemCode(itemCode)) {
    return res.status(400).json({ success: false, message: 'itemCode 格式不正确（仅支持字母、数字、下划线，需字母开头）' })
  }

  if (!itemName) {
    return res.status(400).json({ success: false, message: 'itemName 不能为空' })
  }

  try {
    const type = await ConfigDict.getTypeByKey(typeKey)
    if (!type) {
      return res.status(404).json({ success: false, message: '字典类型不存在' })
    }

    const duplicated = await ConfigDict.getItemByCode(typeKey, itemCode)
    if (duplicated) {
      return res.status(409).json({ success: false, message: 'itemCode 已存在' })
    }

    const extraJsonRaw = normalizeNullable(req.body.extraJson)

    // Validate JSON if provided
    if (extraJsonRaw) {
      try {
        JSON.parse(extraJsonRaw)
      } catch {
        return res.status(400).json({ success: false, message: 'extraJson 必须是合法 JSON' })
      }
    }

    const itemId = await ConfigDict.createItem({
      typeKey,
      itemCode,
      itemName,
      sortOrder: normalizeNumber(req.body.sortOrder, 0),
      enabled: normalizeBool(req.body.enabled, 1),
      color: normalizeNullable(req.body.color),
      remark: normalizeNullable(req.body.remark),
      extraJson: extraJsonRaw,
    })

    const created = await ConfigDict.getItemById(itemId)
    return res.status(201).json({ success: true, message: '创建成功', data: created })
  } catch (err) {
    console.error('创建字典项失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const updateDictItem = async (req, res) => {
  const itemId = Number(req.params.id)
  const itemName = normalizeText(req.body.itemName)

  if (!Number.isFinite(itemId) || itemId <= 0) {
    return res.status(400).json({ success: false, message: '无效的字典项 ID' })
  }

  if (!itemName) {
    return res.status(400).json({ success: false, message: 'itemName 不能为空' })
  }

  const extraJsonRaw = normalizeNullable(req.body.extraJson)
  if (extraJsonRaw) {
    try {
      JSON.parse(extraJsonRaw)
    } catch {
      return res.status(400).json({ success: false, message: 'extraJson 必须是合法 JSON' })
    }
  }

  try {
    const existing = await ConfigDict.getItemById(itemId)
    if (!existing) {
      return res.status(404).json({ success: false, message: '字典项不存在' })
    }

    await ConfigDict.updateItem(itemId, {
      itemName,
      sortOrder: normalizeNumber(req.body.sortOrder, existing.sort_order),
      enabled: normalizeBool(req.body.enabled, existing.enabled),
      color: normalizeNullable(req.body.color),
      remark: normalizeNullable(req.body.remark),
      extraJson: extraJsonRaw,
    })

    const updated = await ConfigDict.getItemById(itemId)
    return res.json({ success: true, message: '更新成功', data: updated })
  } catch (err) {
    console.error('更新字典项失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

const deleteDictItem = async (req, res) => {
  const itemId = Number(req.params.id)

  if (!Number.isFinite(itemId) || itemId <= 0) {
    return res.status(400).json({ success: false, message: '无效的字典项 ID' })
  }

  try {
    const affected = await ConfigDict.deleteItem(itemId)
    if (!affected) {
      return res.status(404).json({ success: false, message: '字典项不存在' })
    }

    return res.json({ success: true, message: '删除成功' })
  } catch (err) {
    console.error('删除字典项失败:', err)
    return res.status(500).json({ success: false, message: '服务器错误' })
  }
}

module.exports = {
  getDictTypes,
  createDictType,
  updateDictType,
  deleteDictType,
  getDictItems,
  createDictItem,
  updateDictItem,
  deleteDictItem,
}
