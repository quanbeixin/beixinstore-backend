const FeishuContact = require('../models/FeishuContact')
const FeishuUserBinding = require('../models/FeishuUserBinding')
const User = require('../models/User')
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

function normalizeUserIds(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',')
  return [
    ...new Set(
      source
        .map((item) => toPositiveInt(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  ]
}

function normalizeMatchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function normalizeMatchAliases(user = {}) {
  return [
    normalizeMatchText(user.real_name),
    normalizeMatchText(user.username),
  ].filter(Boolean)
}

function normalizeDepartmentName(value) {
  return String(value || '').trim().toLowerCase()
}

function buildBindingRecommendation(user = {}, snapshots = []) {
  const aliases = [...new Set(normalizeMatchAliases(user))]
  const userDepartment = normalizeDepartmentName(user.department_name)

  if (aliases.length === 0) {
    return {
      matched: false,
      match_status: 'NO_ALIAS',
      match_score: 0,
      match_reasons: ['系统用户缺少可用于匹配的姓名/用户名'],
      alternative_count: 0,
      snapshot: null,
    }
  }

  const scoredCandidates = snapshots
    .map((snapshot) => {
      const reasons = []
      let score = 0

      const snapshotName = normalizeMatchText(snapshot.name)
      const snapshotNickname = normalizeMatchText(snapshot.nickname)
      const snapshotDepartmentNames = Array.isArray(snapshot.department_names) ? snapshot.department_names : []
      const normalizedSnapshotDepartments = snapshotDepartmentNames.map((item) => normalizeDepartmentName(item)).filter(Boolean)

      if (snapshotName && aliases.includes(snapshotName)) {
        score += 100
        reasons.push('飞书姓名与系统姓名/用户名一致')
      }

      if (snapshotNickname && aliases.includes(snapshotNickname)) {
        score += 80
        reasons.push('飞书昵称与系统姓名/用户名一致')
      }

      if (userDepartment && normalizedSnapshotDepartments.includes(userDepartment)) {
        score += 15
        reasons.push('部门名称一致')
      }

      return {
        score,
        reasons,
        snapshot,
      }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scoredCandidates.length === 0) {
    return {
      matched: false,
      match_status: 'NO_MATCH',
      match_score: 0,
      match_reasons: ['未找到可用于推荐的飞书账号'],
      alternative_count: 0,
      snapshot: null,
    }
  }

  const bestCandidate = scoredCandidates[0]
  const secondCandidate = scoredCandidates[1]
  const scoreGap = secondCandidate ? bestCandidate.score - secondCandidate.score : bestCandidate.score

  let matchStatus = 'REVIEW'
  let matched = false

  if (bestCandidate.score >= 95 && scoreGap >= 15) {
    matchStatus = 'CONFIDENT'
    matched = true
  } else if (secondCandidate && bestCandidate.score === secondCandidate.score) {
    matchStatus = 'AMBIGUOUS'
  } else if (bestCandidate.score >= 80) {
    matchStatus = 'REVIEW'
  } else {
    matchStatus = 'LOW_CONFIDENCE'
  }

  return {
    matched,
    match_status: matchStatus,
    match_score: bestCandidate.score,
    match_reasons: bestCandidate.reasons,
    alternative_count: Math.max(scoredCandidates.length - 1, 0),
    snapshot: bestCandidate.snapshot,
  }
}

function normalizeBatchBindingItems(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => ({
      user_id: toPositiveInt(item?.user_id),
      feishu_snapshot_id: toPositiveInt(item?.feishu_snapshot_id),
    }))
    .filter((item) => item.user_id && item.feishu_snapshot_id)
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

async function listFeishuUserBindings(req, res) {
  if (!ensureAdmin(req, res)) return

  try {
    const userIds = normalizeUserIds(req.query.user_ids)
    const [data, summary] = await Promise.all([
      FeishuUserBinding.listByUserIds(userIds),
      FeishuUserBinding.getSummary(),
    ])

    return res.json({
      success: true,
      data: {
        ...data,
        summary,
      },
    })
  } catch (error) {
    console.error('获取飞书账号映射失败:', error)
    return res.status(500).json({ success: false, message: '获取飞书账号映射失败' })
  }
}

async function listFeishuBindingCandidates(req, res) {
  if (!ensureAdmin(req, res)) return

  try {
    const data = await FeishuContact.listSnapshots({
      page: toPositiveInt(req.query.page) || 1,
      pageSize: toPositiveInt(req.query.pageSize) || 20,
      keyword: normalizeText(req.query.keyword, 100),
      status: normalizeText(req.query.status, 32),
    })

    return res.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('获取飞书绑定候选成员失败:', error)
    return res.status(500).json({ success: false, message: '获取飞书绑定候选成员失败' })
  }
}

async function bindFeishuUser(req, res) {
  if (!ensureAdmin(req, res)) return

  try {
    const userId = toPositiveInt(req.body.user_id)
    const snapshotId = toPositiveInt(req.body.feishu_snapshot_id)

    if (!userId || !snapshotId) {
      return res.status(400).json({ success: false, message: 'user_id 和 feishu_snapshot_id 必填' })
    }

    const [user, snapshot] = await Promise.all([
      User.findById(userId),
      FeishuContact.getSnapshotById(snapshotId),
    ])

    if (!user) {
      return res.status(404).json({ success: false, message: '系统用户不存在' })
    }

    if (!snapshot) {
      return res.status(404).json({ success: false, message: '飞书快照不存在' })
    }

    if (!snapshot.open_id) {
      return res.status(400).json({ success: false, message: '所选飞书快照缺少 open_id，无法绑定' })
    }

    const record = await FeishuUserBinding.upsertBinding({
      userId,
      feishuSnapshotId: snapshotId,
      openId: snapshot.open_id,
      unionId: snapshot.union_id,
      feishuUserId: snapshot.feishu_user_id,
      operatorUserId: req.user?.id || null,
    })

    return res.json({
      success: true,
      message: '飞书账号绑定成功',
      data: {
        record,
      },
    })
  } catch (error) {
    console.error('绑定飞书账号失败:', error)

    if (error?.code === 'BINDING_PARAM_INVALID') {
      return res.status(400).json({ success: false, message: error.message })
    }

    if (error?.code === 'BINDING_OPEN_ID_CONFLICT') {
      return res.status(409).json({ success: false, message: error.message })
    }

    return res.status(500).json({ success: false, message: '绑定飞书账号失败' })
  }
}

async function listFeishuBindingRecommendations(req, res) {
  if (!ensureAdmin(req, res)) return

  try {
    const userIds = normalizeUserIds(req.query.user_ids)
    if (userIds.length === 0) {
      return res.json({
        success: true,
        data: {
          list: [],
          summary: {
            total: 0,
            confident_total: 0,
            review_total: 0,
            unmatched_total: 0,
          },
        },
      })
    }

    const [bindingData, snapshots, users] = await Promise.all([
      FeishuUserBinding.listByUserIds(userIds),
      FeishuUserBinding.listAvailableSnapshots(),
      Promise.all(userIds.map((userId) => User.findById(userId))),
    ])

    const bindingMap = bindingData.map || {}

    const recommendationList = users
      .filter(Boolean)
      .filter((user) => !bindingMap[user.id])
      .map((user) => {
        const recommendation = buildBindingRecommendation(user, snapshots)
        return {
          user_id: user.id,
          username: user.username || '',
          real_name: user.real_name || '',
          department_name: user.department_name || '',
          matched: recommendation.matched,
          match_status: recommendation.match_status,
          match_score: recommendation.match_score,
          match_reasons: recommendation.match_reasons,
          alternative_count: recommendation.alternative_count,
          snapshot: recommendation.snapshot,
        }
      })

    const summary = {
      total: recommendationList.length,
      confident_total: recommendationList.filter((item) => item.match_status === 'CONFIDENT').length,
      review_total: recommendationList.filter((item) => item.match_status === 'REVIEW' || item.match_status === 'LOW_CONFIDENCE' || item.match_status === 'AMBIGUOUS').length,
      unmatched_total: recommendationList.filter((item) => item.match_status === 'NO_MATCH' || item.match_status === 'NO_ALIAS').length,
    }

    return res.json({
      success: true,
      data: {
        list: recommendationList,
        summary,
      },
    })
  } catch (error) {
    console.error('获取飞书智能绑定候选失败:', error)
    return res.status(500).json({ success: false, message: '获取飞书智能绑定候选失败' })
  }
}

async function batchBindFeishuUsers(req, res) {
  if (!ensureAdmin(req, res)) return

  try {
    const items = normalizeBatchBindingItems(req.body.items)
    if (items.length === 0) {
      return res.status(400).json({ success: false, message: 'items 不能为空' })
    }

    const resultItems = []

    for (const item of items) {
      try {
        const [user, snapshot] = await Promise.all([
          User.findById(item.user_id),
          FeishuContact.getSnapshotById(item.feishu_snapshot_id),
        ])

        if (!user) {
          resultItems.push({
            ...item,
            success: false,
            message: '系统用户不存在',
          })
          continue
        }

        if (!snapshot?.open_id) {
          resultItems.push({
            ...item,
            success: false,
            message: '飞书快照不存在或缺少 open_id',
          })
          continue
        }

        await FeishuUserBinding.upsertBinding({
          userId: item.user_id,
          feishuSnapshotId: item.feishu_snapshot_id,
          openId: snapshot.open_id,
          unionId: snapshot.union_id,
          feishuUserId: snapshot.feishu_user_id,
          operatorUserId: req.user?.id || null,
        })

        resultItems.push({
          ...item,
          success: true,
          message: '绑定成功',
        })
      } catch (error) {
        resultItems.push({
          ...item,
          success: false,
          message: error?.message || '绑定失败',
        })
      }
    }

    const successCount = resultItems.filter((item) => item.success).length
    const failCount = resultItems.length - successCount

    return res.json({
      success: true,
      message: failCount > 0 ? `批量绑定完成，成功 ${successCount} 条，失败 ${failCount} 条` : `批量绑定成功，共 ${successCount} 条`,
      data: {
        success_count: successCount,
        fail_count: failCount,
        items: resultItems,
      },
    })
  } catch (error) {
    console.error('批量绑定飞书账号失败:', error)
    return res.status(500).json({ success: false, message: '批量绑定飞书账号失败' })
  }
}

async function unbindFeishuUser(req, res) {
  if (!ensureAdmin(req, res)) return

  try {
    const userId = toPositiveInt(req.body.user_id || req.params.userId)
    if (!userId) {
      return res.status(400).json({ success: false, message: 'user_id 无效' })
    }

    const affectedRows = await FeishuUserBinding.removeByUserId(userId)
    if (affectedRows === 0) {
      return res.status(404).json({ success: false, message: '当前用户暂无飞书绑定关系' })
    }

    return res.json({
      success: true,
      message: '飞书账号解绑成功',
    })
  } catch (error) {
    console.error('解绑飞书账号失败:', error)
    return res.status(500).json({ success: false, message: '解绑飞书账号失败' })
  }
}

module.exports = {
  batchBindFeishuUsers,
  bindFeishuUser,
  listFeishuBindingRecommendations,
  listFeishuContacts,
  listFeishuBindingCandidates,
  listFeishuUserBindings,
  unbindFeishuUser,
  getFeishuContactDetail,
  syncFeishuContacts,
}
