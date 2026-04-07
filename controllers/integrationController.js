const FeishuContact = require('../models/FeishuContact')
const feishuContactService = require('../services/feishuContactService')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeText(value, maxLength = 0) {
  const text = String(value || '').trim()
  if (!text) return ''
  return maxLength > 0 ? text.slice(0, maxLength) : text
}

function ensureAdmin(req, res) {
  if (req.userAccess?.is_super_admin) return true
  const roleKeys = Array.isArray(req.userAccess?.role_keys) ? req.userAccess.role_keys : []
  if (roleKeys.includes('ADMIN')) return true
  res.status(403).json({ success: false, message: '仅管理员可访问第三方接入配置' })
  return false
}

async function listFeishuContacts(req, res) {
  if (!ensureAdmin(req, res)) return

  try {
    const data = await FeishuContact.listSnapshots({
      page: toPositiveInt(req.query.page) || 1,
      pageSize: toPositiveInt(req.query.pageSize) || 20,
      keyword: normalizeText(req.query.keyword, 100),
      status: normalizeText(req.query.status, 32),
    })
    const summary = await FeishuContact.getSummary()

    return res.json({
      success: true,
      data: {
        ...data,
        summary,
        config: feishuContactService.getConfigStatus(),
      },
    })
  } catch (error) {
    console.error('获取飞书通讯录快照失败:', error)
    return res.status(500).json({ success: false, message: '获取飞书通讯录快照失败' })
  }
}

async function getFeishuContactDetail(req, res) {
  if (!ensureAdmin(req, res)) return

  try {
    const id = toPositiveInt(req.params.id)
    if (!id) {
      return res.status(400).json({ success: false, message: '无效的记录 ID' })
    }

    const row = await FeishuContact.getSnapshotById(id)
    if (!row) {
      return res.status(404).json({ success: false, message: '通讯录快照不存在' })
    }

    return res.json({
      success: true,
      data: {
        record: row,
        config: feishuContactService.getConfigStatus(),
      },
    })
  } catch (error) {
    console.error('获取飞书通讯录快照详情失败:', error)
    return res.status(500).json({ success: false, message: '获取飞书通讯录快照详情失败' })
  }
}

async function syncFeishuContacts(req, res) {
  if (!ensureAdmin(req, res)) return

  try {
    const result = await feishuContactService.syncContacts()
    return res.json({
      success: true,
      message: `同步完成，本次写入 ${result.synced_user_total} 条成员快照`,
      data: {
        ...result,
        config: feishuContactService.getConfigStatus(),
      },
    })
  } catch (error) {
    console.error('同步飞书通讯录失败:', error)

    if (error?.code === 'FEISHU_CONFIG_MISSING') {
      return res.status(400).json({ success: false, message: error.message })
    }

    return res.status(500).json({
      success: false,
      message: error?.message || '同步飞书通讯录失败',
    })
  }
}

module.exports = {
  listFeishuContacts,
  getFeishuContactDetail,
  syncFeishuContacts,
}
