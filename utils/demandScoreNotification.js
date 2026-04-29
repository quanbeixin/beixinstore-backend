const DemandScoring = require('../models/DemandScoring')
const NotificationEvent = require('../models/NotificationEvent')
const NotificationRule = require('../models/NotificationRule')

const DEMAND_SCORE_ASSIGN_RULE_CODE = 'sys_demand_score_assign_default'
let demandScoreAssignRuleEnsured = false

function normalizeText(value, maxLength = 255) {
  if (value === undefined || value === null) return ''
  return String(value).trim().slice(0, maxLength)
}

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

async function ensureDemandScoreAssignRule() {
  if (demandScoreAssignRuleEnsured) return

  try {
    const existingRuleRef = await NotificationRule.getByCode(DEMAND_SCORE_ASSIGN_RULE_CODE)
    if (!existingRuleRef?.id) {
      await NotificationRule.create({
        rule_code: DEMAND_SCORE_ASSIGN_RULE_CODE,
        rule_name: '需求评分任务提醒',
        business_line_id: 0,
        scene_code: 'demand_score_assign',
        channel_type: 'feishu',
        receiver_type: 'field',
        receiver_config_json: { user_id_field: 'evaluator_user_id' },
        message_title: '需求评分待处理：${demand_id}',
        message_content: '${demand_name}\n你有 ${pending_slot_count} 条待评分任务${evaluatee_names_display}。',
        condition_config_json: null,
        is_enabled: 1,
        created_by: 0,
        updated_by: 0,
      })
      demandScoreAssignRuleEnsured = true
      return
    }

    const existingRule = await NotificationRule.getById(existingRuleRef.id)
    if (!existingRule) {
      demandScoreAssignRuleEnsured = true
      return
    }

    const receiverConfig =
      existingRule.receiver_config_json && typeof existingRule.receiver_config_json === 'object'
        ? existingRule.receiver_config_json
        : {}

    await NotificationRule.update(existingRule.id, {
      rule_code: normalizeText(existingRule.rule_code, 64) || DEMAND_SCORE_ASSIGN_RULE_CODE,
      rule_name: normalizeText(existingRule.rule_name, 128) || '需求评分任务提醒',
      business_line_id: toPositiveInt(existingRule.business_line_id) || 0,
      scene_code: normalizeText(existingRule.scene_code, 64) || 'demand_score_assign',
      channel_type: normalizeText(existingRule.channel_type, 16) || 'feishu',
      receiver_type: 'field',
      receiver_config_json: {
        ...receiverConfig,
        user_id_field: normalizeText(receiverConfig.user_id_field, 128) || 'evaluator_user_id',
      },
      message_title: normalizeText(existingRule.message_title, 255) || '需求评分待处理：${demand_id}',
      message_content:
        normalizeText(existingRule.message_content, 5000) ||
        '${demand_name}\n你有 ${pending_slot_count} 条待评分任务${evaluatee_names_display}。',
      condition_config_json: existingRule.condition_config_json || null,
      is_enabled: 1,
      updated_by: 0,
    })
    demandScoreAssignRuleEnsured = true
  } catch (error) {
    console.warn('自愈需求评分任务提醒规则失败:', {
      message: error?.message || String(error || ''),
    })
  }
}

async function emitDemandScoreAssignNotifications({ demandId, operatorUserId = null } = {}) {
  const rows = await DemandScoring.listPendingNotificationReceiversByDemand(demandId)
  if (rows.length === 0) return { sentCount: 0 }

  await ensureDemandScoreAssignRule()

  let sentCount = 0
  for (const row of rows) {
    try {
      await NotificationEvent.processEvent({
        eventType: 'demand_score_assign',
        data: {
          demand_id: row.demand_id,
          demand_name: row.demand_name,
          business_line_id: row.business_line_id || null,
          evaluator_user_id: row.evaluator_user_id,
          evaluator_name: row.evaluator_name,
          pending_slot_count: row.pending_slot_count,
          evaluatee_names: row.evaluatee_names,
          evaluatee_names_display: row.evaluatee_names ? `，涉及：${row.evaluatee_names}` : '',
          detail_type: 'demand_score',
          detail_id: row.demand_id,
          detail_action_text: '去评分',
        },
        operatorUserId,
      })
      sentCount += 1
    } catch (error) {
      console.warn('发送需求评分任务提醒失败:', {
        demand_id: row.demand_id,
        evaluator_user_id: row.evaluator_user_id,
        message: error?.message || String(error || ''),
      })
    }
  }

  return { sentCount }
}

module.exports = {
  emitDemandScoreAssignNotifications,
}
