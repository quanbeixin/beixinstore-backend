const pool = require('../utils/db')

const TASK_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SCORING: 'SCORING',
  COMPLETED: 'COMPLETED',
})

const SUBJECT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PARTIAL: 'PARTIAL',
  COMPLETED: 'COMPLETED',
})

const SLOT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
})

const SLOT_TYPES = Object.freeze({
  FORMAL: 'FORMAL',
  COLLABORATOR: 'COLLABORATOR',
})

const ROLE_KEYS = Object.freeze({
  DEMAND_OWNER: 'DEMAND_OWNER',
  DIRECT_OWNER: 'DIRECT_OWNER',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  COLLABORATOR: 'COLLABORATOR',
})

const ROLE_LABELS = Object.freeze({
  [ROLE_KEYS.DEMAND_OWNER]: '需求负责人',
  [ROLE_KEYS.DIRECT_OWNER]: '直属Owner',
  [ROLE_KEYS.PROJECT_MANAGER]: '项目管理',
  [ROLE_KEYS.COLLABORATOR]: '协作方',
})
const PARTICIPANT_ROLE_LABELS = Object.freeze({
  PRODUCT_MANAGER: '产品经理',
  DESIGNER: '设计',
  FRONTEND_DEV: '前端开发',
  BACKEND_DEV: '后端开发',
  QA: '测试',
  BIGDATA_DEV: '大数据开发',
  ALGORITHM_DEV: '算法开发',
  PROJECT_MANAGER: '项目管理',
})
const PARTICIPANT_ROLE_ORDER = Object.freeze([
  'PRODUCT_MANAGER',
  'DESIGNER',
  'FRONTEND_DEV',
  'BACKEND_DEV',
  'QA',
  'BIGDATA_DEV',
  'ALGORITHM_DEV',
  'PROJECT_MANAGER',
])
const NODE_KEY_LABELS = Object.freeze({
  PRODUCT_RESEARCH: '产品调研',
  PRODUCT_PLAN: '产品方案',
  PRODUCT_SOLUTION: '产品方案',
  REQUIREMENT_REVIEW: '需求评审',
  DEMAND_REVIEW: '需求评审',
  NODE_5: '测试用例',
  NODE_6: '用例评审',
  FE_TECH_PLAN: '前端技术方案',
  BE_TECH_PLAN: '后端技术方案',
  BIGDATA_PLAN: '大数据方案',
  ALGORITHM_PLAN: '算法方案',
  FE_DEV: '前端开发',
  DEV: '前端开发',
  BE_DEV: '后端开发',
  DEV_BACK: '后端开发',
  BIGDATA_DEV: '大数据开发',
  BIG_DATA_DEVELOPMENT: '大数据开发',
  ALGORITHM_DEV: '算法开发',
  ALGORITHM_DEVELOPMENT: '算法开发',
  JOINT_DEBUG: '联调阶段',
  FRONTEND_INTEGRATION: '前端联调',
  BACKEND_INTEGRATION: '后端联调',
  RD_SUBMIT_TEST: '研发提测',
  TEST_NOTIFY: '测试通测',
  BUG_RETEST: 'bug复测',
  BUG_FIX: 'Bug修复',
  PRODUCT_ACCEPTANCE: '产品验收',
  PROD_DEPLOY: '上线部署',
  ONLINE_REGRESSION: '线上回归',
  ONLINE_DONE: '已上线',
  NODE_26: '需求跟进（产品&设计）',
  DEMAND_FOLLOW_UP: '需求跟进',
  RELEASE_FOLLOWUP: '上线跟进',
  TRACKING_FOLLOW_UP: '埋点跟进',
})

const ROLE_WEIGHTS = Object.freeze({
  [ROLE_KEYS.DEMAND_OWNER]: 60,
  [ROLE_KEYS.DIRECT_OWNER]: 15,
  [ROLE_KEYS.PROJECT_MANAGER]: 10,
  [ROLE_KEYS.COLLABORATOR]: 15,
})
const OWNER_IS_PM_ROLE_WEIGHTS = Object.freeze({
  [ROLE_KEYS.DIRECT_OWNER]: 60,
  [ROLE_KEYS.PROJECT_MANAGER]: 20,
  [ROLE_KEYS.COLLABORATOR]: 20,
})
const SCORING_COMPLETED_CUTOFF_DATE = '2026-04-20'
const ROLE_SCORE_ITEMS = Object.freeze({
  [ROLE_KEYS.DEMAND_OWNER]: {
    item_key: 'DELIVERY_TIMELINESS',
    item_label: '完成质量&完成时间',
  },
  [ROLE_KEYS.DIRECT_OWNER]: {
    item_key: 'OWNER_PERFORMANCE',
    item_label: '结合职级、任务难度的表现分',
  },
  [ROLE_KEYS.COLLABORATOR]: {
    item_key: 'COLLABORATION',
    item_label: '协作表现分',
  },
  [ROLE_KEYS.PROJECT_MANAGER]: {
    item_key: 'PROCESS',
    item_label: '项目流程表现分',
  },
})

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function toScore(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  if (num < 0 || num > 100) return null
  return Math.round(num)
}

function roundScore(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.round(num * 100) / 100
}

function roundHours1(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 10) / 10
}

function normalizeText(value, maxLen = 255) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeDemandId(value) {
  return normalizeText(value, 64).toUpperCase()
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeUserIdList(value) {
  const source = Array.isArray(value) ? value : [value]
  return Array.from(new Set(source.map((item) => toPositiveInt(item)).filter(Boolean)))
}

function normalizeRoleUserMap(value) {
  const source = parseJson(value, {})
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {}

  const result = {}
  Object.entries(source).forEach(([roleKey, userIds]) => {
    const normalizedRole = normalizeText(roleKey, 64).replace(/\s+/g, '_').toUpperCase()
    if (!normalizedRole) return
    const normalizedUserIds = normalizeUserIdList(userIds)
    if (normalizedUserIds.length > 0) result[normalizedRole] = normalizedUserIds
  })
  return result
}

function normalizeParticipantRoleKey(value) {
  return normalizeText(value, 64).replace(/\s+/g, '_').toUpperCase()
}

function normalizeParticipantRoleList(value) {
  const source = Array.isArray(value) ? value : [value]
  const seen = new Set()
  return source
    .map((item) => normalizeParticipantRoleKey(item))
    .filter((item) => item && !seen.has(item) && seen.add(item))
}

function normalizeDate(value) {
  const text = normalizeText(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function formatDateTime(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function getDemandScoringScopeDate(demand = {}) {
  return normalizeDate(demand.expected_release_date)
}

function isDemandEligibleForScoring(demand = {}) {
  const scopeDate = getDemandScoringScopeDate(demand)
  if (!scopeDate) return false
  return scopeDate >= SCORING_COMPLETED_CUTOFF_DATE
}

function getDemandScoringActualHours(demand = {}) {
  const preferredValue = Number(demand?.scoring_actual_hours)
  if (Number.isFinite(preferredValue)) return roundHours1(preferredValue)
  const fallbackValue = Number(demand?.overall_actual_hours)
  if (Number.isFinite(fallbackValue)) return roundHours1(fallbackValue)
  return 0
}

function isDemandEligibleByActualHours(demand = {}) {
  return getDemandScoringActualHours(demand) > 0
}

function buildPairKey(demandId, userId) {
  const normalizedDemandId = normalizeDemandId(demandId)
  const normalizedUserId = toPositiveInt(userId)
  if (!normalizedDemandId || !normalizedUserId) return ''
  return `${normalizedDemandId}::${normalizedUserId}`
}

function sortParticipantRoleKeys(roleKeys = []) {
  const sorted = normalizeParticipantRoleList(roleKeys)
  return sorted.sort((left, right) => {
    const leftIndex = PARTICIPANT_ROLE_ORDER.indexOf(left)
    const rightIndex = PARTICIPANT_ROLE_ORDER.indexOf(right)
    const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
    const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex
    if (normalizedLeftIndex !== normalizedRightIndex) return normalizedLeftIndex - normalizedRightIndex
    return left.localeCompare(right, 'zh-CN')
  })
}

function participantRoleKeyToLabel(roleKey) {
  const normalizedRoleKey = normalizeParticipantRoleKey(roleKey)
  return PARTICIPANT_ROLE_LABELS[normalizedRoleKey] || normalizedRoleKey || ''
}

function nodeKeyToLabel(nodeKey, fallbackName = '') {
  const normalizedNodeKey = normalizeText(nodeKey, 64).toUpperCase()
  const normalizedFallbackName = normalizeText(fallbackName, 128)
  return NODE_KEY_LABELS[normalizedNodeKey] || normalizedFallbackName || normalizedNodeKey || ''
}

function parseParticipantRolesFromRemark(rawRemark) {
  const parsed = parseJson(rawRemark, null)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  return normalizeParticipantRoleList(parsed.participant_roles || parsed.participantRoles || [])
}

function getPrimaryRoleKey(roleKeys = []) {
  const normalizedRoleKeys = Array.isArray(roleKeys) ? roleKeys : []
  return normalizeText(normalizedRoleKeys[0], 64).toUpperCase() || ''
}

function getRoleScoreItem(roleKey) {
  const normalizedRoleKey = normalizeText(roleKey, 64).toUpperCase()
  return ROLE_SCORE_ITEMS[normalizedRoleKey] || {
    item_key: normalizedRoleKey || 'GENERAL',
    item_label: ROLE_LABELS[normalizedRoleKey] || normalizedRoleKey || '评分',
  }
}

function isSubmittedSlot(slot = {}) {
  return String(slot?.status || '').trim().toUpperCase() === SLOT_STATUS.SUBMITTED && Number.isFinite(Number(slot?.score_value))
}

function calculateRoleScoreSummary(slotRows = []) {
  const roleSlotMap = new Map()
  ;(Array.isArray(slotRows) ? slotRows : []).forEach((slot) => {
    const roleKey = getPrimaryRoleKey(parseJson(slot?.role_keys_json ?? slot?.role_keys, []))
    if (!roleKey) return
    if (!roleSlotMap.has(roleKey)) roleSlotMap.set(roleKey, [])
    roleSlotMap.get(roleKey).push(slot)
  })

  const submittedRoleKeys = []
  const missingRoleKeys = []
  const roleScores = {}
  const roleWeights = {}
  let expectedWeight = 0
  let weightedTotal = 0
  let hasAnySubmittedScore = false

  Object.values(ROLE_KEYS).forEach((roleKey) => {
    const roleSlots = roleSlotMap.get(roleKey) || []
    if (roleSlots.length === 0) return

    const roleWeight = Number(roleSlots[0]?.base_weight || 0)
    if (roleWeight > 0) {
      roleWeights[roleKey] = roleWeight
      expectedWeight += roleWeight
    }

    if (roleKey === ROLE_KEYS.COLLABORATOR) {
      const submittedSlots = roleSlots.filter(isSubmittedSlot)
      if (submittedSlots.length === roleSlots.length && roleSlots.length > 0) {
        const averageScore =
          submittedSlots.reduce((acc, slot) => acc + Number(slot.score_value || 0), 0) / submittedSlots.length
        const normalizedScore = roundScore(averageScore)
        roleScores[roleKey] = normalizedScore
        weightedTotal += normalizedScore * roleWeight
        submittedRoleKeys.push(roleKey)
        hasAnySubmittedScore = true
      } else {
        missingRoleKeys.push(roleKey)
        if (submittedSlots.length > 0) hasAnySubmittedScore = true
      }
      return
    }

    const slot = roleSlots[0]
    if (isSubmittedSlot(slot)) {
      const normalizedScore = roundScore(slot.score_value)
      roleScores[roleKey] = normalizedScore
      weightedTotal += normalizedScore * roleWeight
      submittedRoleKeys.push(roleKey)
      hasAnySubmittedScore = true
    } else {
      missingRoleKeys.push(roleKey)
    }
  })

  const finalScore =
    expectedWeight > 0 && missingRoleKeys.length === 0
      ? roundScore(weightedTotal / expectedWeight)
      : null
  const status =
    finalScore !== null
      ? SUBJECT_STATUS.COMPLETED
      : hasAnySubmittedScore
        ? SUBJECT_STATUS.PARTIAL
        : SUBJECT_STATUS.PENDING

  return {
    status,
    final_score: finalScore,
    effective_weight: expectedWeight,
    submitted_role_keys: Array.from(new Set(submittedRoleKeys)),
    missing_role_keys: Array.from(new Set(missingRoleKeys)),
    role_scores: roleScores,
    role_weights: roleWeights,
    hasAnySubmittedScore,
  }
}

function mapSlotRow(row = {}) {
  const roleKeys = parseJson(row.role_keys_json, [])
  const primaryRoleKey = getPrimaryRoleKey(roleKeys)
  const scoreItem = getRoleScoreItem(primaryRoleKey)
  return {
    ...row,
    id: Number(row.id || 0),
    task_id: Number(row.task_id || 0),
    subject_id: Number(row.subject_id || 0),
    evaluatee_user_id: Number(row.evaluatee_user_id || 0),
    evaluator_user_id: Number(row.evaluator_user_id || 0),
    base_weight: Number(row.base_weight || 0),
    role_keys: Array.isArray(roleKeys) ? roleKeys : [],
    role_labels: (Array.isArray(roleKeys) ? roleKeys : []).map((roleKey) => ROLE_LABELS[roleKey] || roleKey),
    primary_role_key: primaryRoleKey,
    score_item_key: scoreItem.item_key,
    score_item_label: scoreItem.item_label,
    participation_role_keys: normalizeParticipantRoleList(row.participation_role_keys || []),
    participation_role_labels: (Array.isArray(row.participation_role_labels) ? row.participation_role_labels : []).filter(Boolean),
    participation_node_names: Array.from(
      new Set((Array.isArray(row.participation_node_names) ? row.participation_node_names : []).map((item) => normalizeText(item, 128)).filter(Boolean)),
    ),
    actual_hours_total: Number(row.actual_hours_total || 0),
    actual_worklog_count: Number(row.actual_worklog_count || 0),
    score_record: row.record_id
      ? {
          id: Number(row.record_id || 0),
          score: Number(row.record_weighted_score || 0),
          comment: row.record_comment || '',
          submitted_at: row.record_submitted_at || null,
          updated_at: row.record_updated_at || null,
        }
      : null,
  }
}

async function getDemandForScoring(demandId) {
  const normalizedDemandId = normalizeDemandId(demandId)
  if (!normalizedDemandId) return null

  const [rows] = await pool.query(
    `SELECT
       d.id,
       d.name,
       d.status,
       d.owner_user_id,
       COALESCE(NULLIF(owner.real_name, ''), owner.username) AS owner_name,
       d.project_manager,
       COALESCE(NULLIF(pm.real_name, ''), pm.username) AS project_manager_name,
       d.participant_role_user_map_json,
       d.overall_actual_hours,
       ROUND(
         COALESCE(
           d.overall_actual_hours,
           (
             SELECT
               COALESCE(
                 SUM(
                   CASE
                     WHEN UPPER(TRIM(COALESCE(wl.log_status, 'IN_PROGRESS'))) <> 'CANCELLED'
                       THEN COALESCE(wl.actual_hours, 0)
                     ELSE 0
                   END
                 ),
                 0
               )
             FROM work_logs wl
             WHERE wl.demand_id COLLATE utf8mb4_unicode_ci = d.id COLLATE utf8mb4_unicode_ci
           ),
           0
         ),
         1
       ) AS scoring_actual_hours,
       DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS expected_release_date,
       d.completed_at,
       d.created_at
     FROM work_demands d
     LEFT JOIN users owner ON owner.id = d.owner_user_id
     LEFT JOIN users pm ON pm.id = d.project_manager
     WHERE d.id = ?
     LIMIT 1`,
    [normalizedDemandId],
  )
  return rows[0] || null
}

async function listUserNames(userIds) {
  const ids = Array.from(new Set((Array.isArray(userIds) ? userIds : []).map((item) => toPositiveInt(item)).filter(Boolean)))
  if (ids.length === 0) return new Map()

  const [rows] = await pool.query(
    `SELECT id, username, COALESCE(NULLIF(real_name, ''), username) AS display_name
     FROM users
     WHERE id IN (?)`,
    [ids],
  )
  return new Map(rows.map((row) => [Number(row.id), row.display_name || row.username || `用户${row.id}`]))
}

async function listDemandSubjectUserIds(demand) {
  const userIds = new Set()
  const roleUserMap = normalizeRoleUserMap(demand?.participant_role_user_map_json)
  Object.entries(roleUserMap).forEach(([roleKey, ids]) => {
    if (roleKey === ROLE_KEYS.PROJECT_MANAGER) return
    normalizeUserIdList(ids).forEach((userId) => userIds.add(userId))
  })

  const projectManagerId = toPositiveInt(demand?.project_manager)
  if (projectManagerId) userIds.delete(projectManagerId)

  return Array.from(userIds).sort((left, right) => left - right)
}

async function listDirectOwnerMap(userIds) {
  const ids = Array.from(new Set((Array.isArray(userIds) ? userIds : []).map((item) => toPositiveInt(item)).filter(Boolean)))
  if (ids.length === 0) return new Map()

  const [rows] = await pool.query(
    `SELECT
       u.id AS user_id,
       d.manager_user_id AS owner_user_id
     FROM users u
     LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.id IN (?)`,
    [ids],
  )

  return new Map(
    rows
      .map((row) => [Number(row.user_id || 0), toPositiveInt(row.owner_user_id)])
      .filter(([, ownerUserId]) => ownerUserId),
  )
}

async function buildParticipationReferenceMap(slotRows = []) {
  const pairs = Array.isArray(slotRows)
    ? slotRows
        .map((row) => ({
          demand_id: normalizeDemandId(row?.demand_id),
          evaluatee_user_id: toPositiveInt(row?.evaluatee_user_id),
        }))
        .filter((item) => item.demand_id && item.evaluatee_user_id)
    : []
  if (pairs.length === 0) return new Map()

  const pairKeySet = new Set(pairs.map((item) => buildPairKey(item.demand_id, item.evaluatee_user_id)).filter(Boolean))
  const demandIds = Array.from(new Set(pairs.map((item) => item.demand_id)))
  const evaluateeUserIds = Array.from(new Set(pairs.map((item) => item.evaluatee_user_id)))
  const referenceMap = new Map()

  pairKeySet.forEach((pairKey) => {
    referenceMap.set(pairKey, {
      role_keys: new Set(),
      node_entries: [],
      node_key_set: new Set(),
      actual_hours_total: 0,
      actual_worklog_count: 0,
    })
  })

  const [demandRows, nodeRows, taskRows, worklogRows, worklogPhaseRows] = await Promise.all([
    pool.query(
      `SELECT id, participant_role_user_map_json
       FROM work_demands
       WHERE id IN (?)`,
      [demandIds],
    ),
    pool.query(
      `SELECT
         i.biz_id AS demand_id,
         n.assignee_user_id AS user_id,
         n.node_key,
         n.node_name_snapshot,
         n.sort_order,
         n.remark
       FROM wf_process_instance_nodes n
       INNER JOIN wf_process_instances i ON i.id = n.instance_id
       WHERE i.biz_type = 'DEMAND'
         AND i.biz_id IN (?)
         AND n.assignee_user_id IN (?)`,
      [demandIds, evaluateeUserIds],
    ),
    pool.query(
      `SELECT
         i.biz_id AS demand_id,
         t.assignee_user_id AS user_id,
         n.node_key,
         n.node_name_snapshot,
         n.sort_order,
         n.remark
       FROM wf_process_tasks t
       INNER JOIN wf_process_instances i ON i.id = t.instance_id
       LEFT JOIN wf_process_instance_nodes n ON n.id = t.instance_node_id
       WHERE i.biz_type = 'DEMAND'
         AND i.biz_id IN (?)
         AND t.assignee_user_id IN (?)`,
      [demandIds, evaluateeUserIds],
    ),
    pool.query(
      `SELECT
         demand_id,
         user_id,
         ROUND(COALESCE(SUM(actual_hours), 0), 1) AS total_actual_hours,
         COUNT(*) AS worklog_count
       FROM work_logs
       WHERE demand_id IN (?)
         AND user_id IN (?)
       GROUP BY demand_id, user_id`,
      [demandIds, evaluateeUserIds],
    ),
    pool.query(
      `SELECT
         wl.demand_id,
         wl.user_id,
         wl.phase_key,
         COALESCE(pdi.item_name, wl.phase_key) AS phase_name
       FROM work_logs wl
       LEFT JOIN config_dict_items pdi
         ON pdi.type_key = 'demand_phase_type'
        AND pdi.item_code = wl.phase_key
       WHERE wl.demand_id IN (?)
         AND wl.user_id IN (?)
         AND wl.phase_key IS NOT NULL
         AND wl.phase_key <> ''
       GROUP BY wl.demand_id, wl.user_id, wl.phase_key, pdi.item_name`,
      [demandIds, evaluateeUserIds],
    ),
  ])

  ;(demandRows[0] || []).forEach((row) => {
    const demandId = normalizeDemandId(row?.id)
    const roleUserMap = normalizeRoleUserMap(row?.participant_role_user_map_json)
    Object.entries(roleUserMap).forEach(([roleKey, userIds]) => {
      normalizeUserIdList(userIds).forEach((userId) => {
        const pairKey = buildPairKey(demandId, userId)
        const target = referenceMap.get(pairKey)
        if (!target) return
        target.role_keys.add(normalizeParticipantRoleKey(roleKey))
      })
    })
  })

  const appendNodeReference = (row = {}) => {
    const pairKey = buildPairKey(row?.demand_id, row?.user_id)
    const target = referenceMap.get(pairKey)
    if (!target) return

    parseParticipantRolesFromRemark(row?.remark).forEach((roleKey) => target.role_keys.add(roleKey))

    const nodeKey = normalizeText(row?.node_key, 64).toUpperCase()
    const nodeName = nodeKeyToLabel(row?.node_key, row?.node_name_snapshot)
    if (!nodeKey || !nodeName) return
    const nodeIdentity = `${nodeKey}::${nodeName}`
    if (target.node_key_set.has(nodeIdentity)) return
    target.node_key_set.add(nodeIdentity)
    target.node_entries.push({
      node_key: nodeKey,
      node_name: nodeName,
      sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : Number.MAX_SAFE_INTEGER,
    })
  }

  ;(nodeRows[0] || []).forEach(appendNodeReference)
  ;(taskRows[0] || []).forEach(appendNodeReference)

  ;(worklogRows[0] || []).forEach((row) => {
    const pairKey = buildPairKey(row?.demand_id, row?.user_id)
    const target = referenceMap.get(pairKey)
    if (!target) return
    target.actual_hours_total = Number(row?.total_actual_hours || 0)
    target.actual_worklog_count = Number(row?.worklog_count || 0)
  })

  ;(worklogPhaseRows[0] || []).forEach((row) => {
    const pairKey = buildPairKey(row?.demand_id, row?.user_id)
    const target = referenceMap.get(pairKey)
    if (!target) return
    const phaseName = nodeKeyToLabel(row?.phase_key, row?.phase_name)
    const phaseKey = normalizeText(row?.phase_key, 64).toUpperCase()
    if (!phaseName || !phaseKey) return
    const nodeIdentity = `LOG::${phaseKey}::${phaseName}`
    if (target.node_key_set.has(nodeIdentity)) return
    target.node_key_set.add(nodeIdentity)
    target.node_entries.push({
      node_key: phaseKey,
      node_name: phaseName,
      sort_order: Number.MAX_SAFE_INTEGER,
    })
  })

  const finalMap = new Map()
  referenceMap.forEach((value, key) => {
    const sortedRoleKeys = sortParticipantRoleKeys(Array.from(value.role_keys))
    const sortedNodeNames = value.node_entries
      .sort((left, right) => {
        if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order
        return left.node_name.localeCompare(right.node_name, 'zh-CN')
      })
      .map((item) => item.node_name)
    finalMap.set(key, {
      participation_role_keys: sortedRoleKeys,
      participation_role_labels: sortedRoleKeys.map(participantRoleKeyToLabel).filter(Boolean),
      participation_node_names: sortedNodeNames,
      actual_hours_total: Number(value.actual_hours_total || 0),
      actual_worklog_count: Number(value.actual_worklog_count || 0),
    })
  })

  return finalMap
}

async function attachParticipationReference(slotRows = []) {
  const referenceMap = await buildParticipationReferenceMap(slotRows)
  return slotRows.map((row) => {
    const pairKey = buildPairKey(row?.demand_id, row?.evaluatee_user_id)
    const reference = referenceMap.get(pairKey) || {
      participation_role_keys: [],
      participation_role_labels: [],
      participation_node_names: [],
      actual_hours_total: 0,
      actual_worklog_count: 0,
    }
    return {
      ...row,
      participation_role_keys: reference.participation_role_keys,
      participation_role_labels: reference.participation_role_labels,
      participation_node_names: reference.participation_node_names,
      actual_hours_total: Number(reference.actual_hours_total || 0),
      actual_worklog_count: Number(reference.actual_worklog_count || 0),
    }
  })
}

async function deleteTaskCascadeByDemandId(conn, demandId) {
  const normalizedDemandId = normalizeDemandId(demandId)
  if (!normalizedDemandId) {
    return {
      demand_id: normalizedDemandId,
      task_id: 0,
      deleted: false,
      deleted_records: 0,
      deleted_slots: 0,
      deleted_subjects: 0,
      deleted_tasks: 0,
    }
  }

  const [taskRows] = await conn.query(
    `SELECT id
     FROM demand_score_tasks
     WHERE demand_id = ?
     LIMIT 1`,
    [normalizedDemandId],
  )
  const taskId = Number(taskRows?.[0]?.id || 0)
  if (!taskId) {
    return {
      demand_id: normalizedDemandId,
      task_id: 0,
      deleted: false,
      deleted_records: 0,
      deleted_slots: 0,
      deleted_subjects: 0,
      deleted_tasks: 0,
    }
  }

  const [recordResult] = await conn.query('DELETE FROM demand_score_records WHERE task_id = ?', [taskId])
  const [slotResult] = await conn.query('DELETE FROM demand_score_slots WHERE task_id = ?', [taskId])
  const [subjectResult] = await conn.query('DELETE FROM demand_score_subjects WHERE task_id = ?', [taskId])
  const [taskResult] = await conn.query('DELETE FROM demand_score_tasks WHERE id = ?', [taskId])

  return {
    demand_id: normalizedDemandId,
    task_id: taskId,
    deleted: Number(taskResult?.affectedRows || 0) > 0,
    deleted_records: Number(recordResult?.affectedRows || 0),
    deleted_slots: Number(slotResult?.affectedRows || 0),
    deleted_subjects: Number(subjectResult?.affectedRows || 0),
    deleted_tasks: Number(taskResult?.affectedRows || 0),
  }
}

async function createTaskRow(conn, demand, operatorUserId) {
  const storedDeadlineAt =
    formatDateTime(demand.completed_at || demand.created_at) || formatDateTime(new Date()) || '2099-12-31 23:59:59'
  await conn.query(
    `INSERT INTO demand_score_tasks (
       demand_id,
       demand_name,
       owner_user_id,
       project_manager_user_id,
       status,
       deadline_at,
       completed_at,
      generated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       demand_name = VALUES(demand_name),
       owner_user_id = VALUES(owner_user_id),
       project_manager_user_id = VALUES(project_manager_user_id),
       deadline_at = VALUES(deadline_at),
       updated_at = CURRENT_TIMESTAMP`,
    [
      normalizeDemandId(demand.id),
      normalizeText(demand.name, 255),
      toPositiveInt(demand.owner_user_id),
      toPositiveInt(demand.project_manager),
      TASK_STATUS.PENDING,
      storedDeadlineAt,
      demand.completed_at || null,
      toPositiveInt(operatorUserId),
    ],
  )

  const [rows] = await conn.query(
    `SELECT *
     FROM demand_score_tasks
     WHERE demand_id = ?
     LIMIT 1`,
    [normalizeDemandId(demand.id)],
  )
  return rows[0] || null
}

async function replaceTaskDetails(conn, task, demand, subjectUserIds, directOwnerMap) {
  await conn.query('DELETE FROM demand_score_records WHERE task_id = ?', [task.id])
  await conn.query('DELETE FROM demand_score_slots WHERE task_id = ?', [task.id])
  await conn.query('DELETE FROM demand_score_subjects WHERE task_id = ?', [task.id])

  return syncTaskDetails(conn, task, demand, subjectUserIds, directOwnerMap, {
    preserveExisting: false,
  })
}

function buildExpectedSlotDefinitions({
  demand,
  evaluateeUserId,
  subjectUserIds,
  directOwnerMap,
  productManagerUserIds,
} = {}) {
  const isDemandOwnerEvaluatee = toPositiveInt(demand.owner_user_id) === evaluateeUserId
  const isDemandOwnerAlsoProductManager = isDemandOwnerEvaluatee && productManagerUserIds.includes(evaluateeUserId)
  const roleWeightMap = isDemandOwnerAlsoProductManager
    ? OWNER_IS_PM_ROLE_WEIGHTS
    : ROLE_WEIGHTS

  const formalEvaluators = []
  if (toPositiveInt(demand.owner_user_id) !== evaluateeUserId && Number(roleWeightMap[ROLE_KEYS.DEMAND_OWNER] || 0) > 0) {
    formalEvaluators.push({
      evaluator_user_id: toPositiveInt(demand.owner_user_id),
      role_key: ROLE_KEYS.DEMAND_OWNER,
      base_weight: Number(roleWeightMap[ROLE_KEYS.DEMAND_OWNER] || 0),
      slot_type: SLOT_TYPES.FORMAL,
      slot_key: ROLE_KEYS.DEMAND_OWNER,
    })
  }

  const directOwnerUserId = directOwnerMap.get(evaluateeUserId)
  if (
    toPositiveInt(directOwnerUserId) &&
    toPositiveInt(directOwnerUserId) !== evaluateeUserId &&
    Number(roleWeightMap[ROLE_KEYS.DIRECT_OWNER] || 0) > 0
  ) {
    formalEvaluators.push({
      evaluator_user_id: toPositiveInt(directOwnerUserId),
      role_key: ROLE_KEYS.DIRECT_OWNER,
      base_weight: Number(roleWeightMap[ROLE_KEYS.DIRECT_OWNER] || 0),
      slot_type: SLOT_TYPES.FORMAL,
      slot_key: ROLE_KEYS.DIRECT_OWNER,
    })
  }

  if (
    toPositiveInt(demand.project_manager) &&
    toPositiveInt(demand.project_manager) !== evaluateeUserId &&
    Number(roleWeightMap[ROLE_KEYS.PROJECT_MANAGER] || 0) > 0
  ) {
    formalEvaluators.push({
      evaluator_user_id: toPositiveInt(demand.project_manager),
      role_key: ROLE_KEYS.PROJECT_MANAGER,
      base_weight: Number(roleWeightMap[ROLE_KEYS.PROJECT_MANAGER] || 0),
      slot_type: SLOT_TYPES.FORMAL,
      slot_key: ROLE_KEYS.PROJECT_MANAGER,
    })
  }

  const formalEvaluatorSet = new Set(formalEvaluators.map((item) => item.evaluator_user_id).filter(Boolean))
  const collaboratorSlots = subjectUserIds
    .filter((userId) => userId !== evaluateeUserId && !formalEvaluatorSet.has(userId))
    .map((collaboratorId) => ({
      evaluator_user_id: collaboratorId,
      role_key: ROLE_KEYS.COLLABORATOR,
      base_weight: Number(roleWeightMap[ROLE_KEYS.COLLABORATOR] || ROLE_WEIGHTS.COLLABORATOR),
      slot_type: SLOT_TYPES.COLLABORATOR,
      slot_key: ROLE_KEYS.COLLABORATOR,
    }))

  return [...formalEvaluators, ...collaboratorSlots]
}

async function syncTaskDetails(conn, task, demand, subjectUserIds, directOwnerMap, { preserveExisting = false } = {}) {
  const allEvaluatorIds = new Set([
    toPositiveInt(demand.owner_user_id),
    toPositiveInt(demand.project_manager),
    ...Array.from(directOwnerMap.values()),
    ...subjectUserIds,
  ].filter(Boolean))
  const userNameMap = await listUserNames([...new Set([...subjectUserIds, ...allEvaluatorIds])])
  const roleUserMap = normalizeRoleUserMap(demand?.participant_role_user_map_json)
  const productManagerUserIds = normalizeUserIdList(roleUserMap?.PRODUCT_MANAGER || [])
  const sourceJson = {
    from_role_map: true,
    exclude_project_manager: true,
  }

  const created = {
    subject_count: 0,
    slot_count: 0,
  }
  const existingSubjectMap = new Map()
  const existingSlotMap = new Map()

  if (preserveExisting) {
    const [existingSubjects] = await conn.query(
      `SELECT id, evaluatee_user_id
       FROM demand_score_subjects
       WHERE task_id = ?`,
      [task.id],
    )
    existingSubjects.forEach((row) => {
      const evaluateeUserId = toPositiveInt(row?.evaluatee_user_id)
      const subjectId = toPositiveInt(row?.id)
      if (evaluateeUserId && subjectId) {
        existingSubjectMap.set(evaluateeUserId, subjectId)
      }
    })

    const [existingSlots] = await conn.query(
      `SELECT id, subject_id, evaluator_user_id, slot_key
       FROM demand_score_slots
       WHERE task_id = ?`,
      [task.id],
    )
    existingSlots.forEach((row) => {
      const subjectId = toPositiveInt(row?.subject_id)
      const evaluatorUserId = toPositiveInt(row?.evaluator_user_id)
      const slotKey = normalizeText(row?.slot_key, 64)
      if (!subjectId || !evaluatorUserId || !slotKey) return
      existingSlotMap.set(`${subjectId}:${evaluatorUserId}:${slotKey}`, toPositiveInt(row?.id) || 0)
    })
  }

  for (const evaluateeUserId of subjectUserIds) {
    let subjectId = existingSubjectMap.get(evaluateeUserId) || 0
    if (subjectId) {
      await conn.query(
        `UPDATE demand_score_subjects
         SET
           demand_id = ?,
           evaluatee_name = ?,
           source_json = CAST(? AS JSON),
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          normalizeDemandId(demand.id),
          userNameMap.get(evaluateeUserId) || `用户${evaluateeUserId}`,
          JSON.stringify(sourceJson),
          subjectId,
        ],
      )
    } else {
      const [subjectResult] = await conn.query(
        `INSERT INTO demand_score_subjects (
           task_id,
           demand_id,
           evaluatee_user_id,
           evaluatee_name,
           source_json,
           status
         ) VALUES (?, ?, ?, ?, CAST(? AS JSON), ?)`,
        [
          task.id,
          normalizeDemandId(demand.id),
          evaluateeUserId,
          userNameMap.get(evaluateeUserId) || `用户${evaluateeUserId}`,
          JSON.stringify(sourceJson),
          SUBJECT_STATUS.PENDING,
        ],
      )
      subjectId = Number(subjectResult.insertId)
      existingSubjectMap.set(evaluateeUserId, subjectId)
      created.subject_count += 1
    }

    const slotDefinitions = buildExpectedSlotDefinitions({
      demand,
      evaluateeUserId,
      subjectUserIds,
      directOwnerMap,
      productManagerUserIds,
    })

    for (const slotDefinition of slotDefinitions) {
      const slotIdentityKey = `${subjectId}:${slotDefinition.evaluator_user_id}:${slotDefinition.slot_key}`
      if (preserveExisting && existingSlotMap.has(slotIdentityKey)) {
        continue
      }
      await conn.query(
        `INSERT INTO demand_score_slots (
           task_id,
           subject_id,
           demand_id,
           evaluatee_user_id,
           evaluator_user_id,
           evaluator_name,
           slot_type,
           slot_key,
           base_weight,
           role_keys_json,
           status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)`,
        [
          task.id,
          subjectId,
          normalizeDemandId(demand.id),
          evaluateeUserId,
          slotDefinition.evaluator_user_id,
          userNameMap.get(slotDefinition.evaluator_user_id) || `用户${slotDefinition.evaluator_user_id}`,
          slotDefinition.slot_type,
          slotDefinition.slot_key,
          Number(slotDefinition.base_weight || 0),
          JSON.stringify([slotDefinition.role_key]),
          SLOT_STATUS.PENDING,
        ],
      )
      existingSlotMap.set(slotIdentityKey, 1)
      created.slot_count += 1
    }
  }

  return created
}

async function recalculateSubject(subjectId, { conn = pool } = {}) {
  const normalizedSubjectId = toPositiveInt(subjectId)
  if (!normalizedSubjectId) return null

  const [slotRows] = await conn.query(
    `SELECT
       s.id,
       s.slot_type,
       s.base_weight,
       s.role_keys_json,
       s.status,
       r.weighted_score AS score_value
     FROM demand_score_slots s
     LEFT JOIN demand_score_records r ON r.slot_id = s.id
     WHERE s.subject_id = ?`,
    [normalizedSubjectId],
  )
  const summary = calculateRoleScoreSummary(
    (slotRows || []).map((slot) => ({
      ...slot,
      score_value: slot?.score_value === null ? null : Number(slot?.score_value),
    })),
  )

  await conn.query(
    `UPDATE demand_score_subjects
     SET
       status = ?,
       final_score = ?,
       delivery_score = ?,
       collaboration_score = ?,
       responsibility_score = ?,
       effective_weight = ?,
       submitted_role_keys_json = CAST(? AS JSON),
       missing_role_keys_json = CAST(? AS JSON),
       result_calculated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      summary.status,
      summary.final_score,
      null,
      null,
      null,
      summary.effective_weight,
      JSON.stringify(summary.submitted_role_keys),
      JSON.stringify(summary.missing_role_keys),
      normalizedSubjectId,
    ],
  )

  return {
    subject_id: normalizedSubjectId,
    final_score: summary.final_score,
    effective_weight: summary.effective_weight,
    missing_role_keys: summary.missing_role_keys,
    role_scores: summary.role_scores,
  }
}

async function recalculateTask(taskId, { conn = pool } = {}) {
  const normalizedTaskId = toPositiveInt(taskId)
  if (!normalizedTaskId) return null

  const [subjectRows] = await conn.query(
    `SELECT id
     FROM demand_score_subjects
     WHERE task_id = ?`,
    [normalizedTaskId],
  )
  for (const subject of subjectRows) {
    await recalculateSubject(subject.id, { conn })
  }

  const [[summary]] = await conn.query(
    `SELECT
       COUNT(*) AS slot_count,
       SUM(CASE WHEN status = 'SUBMITTED' THEN 1 ELSE 0 END) AS submitted_count
     FROM demand_score_slots
     WHERE task_id = ?`,
    [normalizedTaskId],
  )
  const slotCount = Number(summary?.slot_count || 0)
  const submittedCount = Number(summary?.submitted_count || 0)
  const subjectCount = Number(subjectRows?.length || 0)
  const hasScorableSubjects = subjectCount > 0 && slotCount > 0
  const allSlotsSubmitted = hasScorableSubjects && submittedCount >= slotCount
  const [[partialSummary]] = await conn.query(
    `SELECT COUNT(*) AS partial_subject_count
     FROM demand_score_subjects
     WHERE task_id = ?
       AND status = ?`,
    [normalizedTaskId, SUBJECT_STATUS.PARTIAL],
  )
  const status = allSlotsSubmitted
    ? TASK_STATUS.COMPLETED
    : submittedCount > 0
      ? TASK_STATUS.SCORING
      : TASK_STATUS.PENDING
  const resultReady = allSlotsSubmitted ? 1 : 0
  const partialMissing = Number(partialSummary?.partial_subject_count || 0) > 0 ? 1 : 0

  await conn.query(
    `UPDATE demand_score_tasks
     SET
       status = ?,
       result_ready = ?,
       partial_missing = ?,
       completed_at = CASE WHEN ? = 'COMPLETED' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END
     WHERE id = ?`,
    [status, resultReady, partialMissing, status, normalizedTaskId],
  )

  return { task_id: normalizedTaskId, status, result_ready: resultReady, partial_missing: partialMissing }
}

function averageScores(values = []) {
  const normalizedValues = (Array.isArray(values) ? values : [])
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
  if (normalizedValues.length === 0) return null
  return roundScore(normalizedValues.reduce((acc, item) => acc + item, 0) / normalizedValues.length)
}

function buildSlotResultRow(row = {}) {
  const roleKeys = parseJson(row.role_keys_json, [])
  const primaryRoleKey = getPrimaryRoleKey(roleKeys)
  const scoreItem = getRoleScoreItem(primaryRoleKey)
  return {
    id: Number(row?.id || 0),
    subject_id: Number(row?.subject_id || 0),
    evaluatee_user_id: Number(row?.evaluatee_user_id || 0),
    evaluator_user_id: Number(row?.evaluator_user_id || 0),
    evaluator_name: row?.evaluator_name || '',
    slot_type: row?.slot_type || '',
    status: row?.status || '',
    base_weight: Number(row?.base_weight || 0),
    role_keys: Array.isArray(roleKeys) ? roleKeys : [],
    role_labels: (Array.isArray(roleKeys) ? roleKeys : []).map((roleKey) => ROLE_LABELS[roleKey] || roleKey),
    primary_role_key: primaryRoleKey,
    score_item_key: scoreItem.item_key,
    score_item_label: scoreItem.item_label,
    score: row?.record_weighted_score === null ? null : Number(row?.record_weighted_score),
    comment: row?.record_comment || '',
    submitted_at: row?.record_submitted_at || null,
    updated_at: row?.record_updated_at || null,
  }
}

function buildSubjectResultRow(row = {}, slotRows = []) {
  const slotRecords = (Array.isArray(slotRows) ? slotRows : []).map(buildSlotResultRow)
  const scoreSummary = calculateRoleScoreSummary(
    slotRecords.map((slot) => ({
      role_keys: slot.role_keys,
      status: slot.status,
      base_weight: slot.base_weight,
      score_value: slot.score,
    })),
  )
  return {
    ...row,
    id: Number(row.id || 0),
    evaluatee_user_id: Number(row.evaluatee_user_id || 0),
    status: row?.status || scoreSummary.status,
    final_score: row?.final_score === null || row?.final_score === undefined ? scoreSummary.final_score : Number(row.final_score),
    effective_weight: Number(row?.effective_weight || scoreSummary.effective_weight || 0),
    submitted_role_keys: parseJson(row?.submitted_role_keys_json, scoreSummary.submitted_role_keys),
    missing_role_keys: parseJson(row?.missing_role_keys_json, scoreSummary.missing_role_keys),
    submitted_role_labels: parseJson(row?.submitted_role_keys_json, scoreSummary.submitted_role_keys).map((roleKey) => ROLE_LABELS[roleKey] || roleKey),
    missing_role_labels: parseJson(row?.missing_role_keys_json, scoreSummary.missing_role_keys).map((roleKey) => ROLE_LABELS[roleKey] || roleKey),
    demand_owner_score: scoreSummary.role_scores[ROLE_KEYS.DEMAND_OWNER] ?? null,
    direct_owner_score: scoreSummary.role_scores[ROLE_KEYS.DIRECT_OWNER] ?? null,
    collaborator_score: scoreSummary.role_scores[ROLE_KEYS.COLLABORATOR] ?? null,
    project_manager_score: scoreSummary.role_scores[ROLE_KEYS.PROJECT_MANAGER] ?? null,
    slot_records: slotRecords,
  }
}

function buildDemandAggregateFromSubjects(task = {}, subjects = []) {
  const normalizedSubjects = Array.isArray(subjects) ? subjects : []
  const completedSubjects = normalizedSubjects.filter(
    (subject) => String(subject?.status || '').trim().toUpperCase() === SUBJECT_STATUS.COMPLETED && Number.isFinite(Number(subject?.final_score)),
  )
  const isResultReady = Number(task?.result_ready || 0) === 1
  return {
    subject_count: normalizedSubjects.length,
    avg_final_score: isResultReady ? averageScores(completedSubjects.map((subject) => subject.final_score)) : null,
    avg_demand_owner_score: isResultReady ? averageScores(completedSubjects.map((subject) => subject.demand_owner_score)) : null,
    avg_direct_owner_score: isResultReady ? averageScores(completedSubjects.map((subject) => subject.direct_owner_score)) : null,
    avg_collaborator_score: isResultReady ? averageScores(completedSubjects.map((subject) => subject.collaborator_score)) : null,
    avg_project_manager_score: isResultReady ? averageScores(completedSubjects.map((subject) => subject.project_manager_score)) : null,
    partial_subject_count: normalizedSubjects.filter(
      (subject) => String(subject?.status || '').trim().toUpperCase() === SUBJECT_STATUS.PARTIAL,
    ).length,
  }
}

const DemandScoring = {
  TASK_STATUS,
  SLOT_STATUS,
  ROLE_LABELS,
  ROLE_WEIGHTS,
  ROLE_SCORE_ITEMS,
  SCORING_COMPLETED_CUTOFF_DATE,

  async purgeTaskByDemand(demandId, { conn = null } = {}) {
    const normalizedDemandId = normalizeDemandId(demandId)
    if (!normalizedDemandId) {
      return {
        demand_id: normalizedDemandId,
        task_id: 0,
        deleted: false,
        deleted_records: 0,
        deleted_slots: 0,
        deleted_subjects: 0,
        deleted_tasks: 0,
      }
    }

    if (conn) {
      return deleteTaskCascadeByDemandId(conn, normalizedDemandId)
    }

    const ownedConn = await pool.getConnection()
    try {
      await ownedConn.beginTransaction()
      const result = await deleteTaskCascadeByDemandId(ownedConn, normalizedDemandId)
      await ownedConn.commit()
      return result
    } catch (error) {
      await ownedConn.rollback()
      throw error
    } finally {
      ownedConn.release()
    }
  },

  async hasSubmittedRecordsForDemand(demandId, { conn = pool } = {}) {
    const normalizedDemandId = normalizeDemandId(demandId)
    if (!normalizedDemandId) return false

    const [[row]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM demand_score_records
       WHERE demand_id = ?`,
      [normalizedDemandId],
    )

    return Number(row?.total || 0) > 0
  },

  async ensureTaskForDemand(demandId, { operatorUserId = null, forceRebuild = false } = {}) {
    const demand = await getDemandForScoring(demandId)
    if (!demand) {
      const err = new Error('需求不存在')
      err.code = 'DEMAND_NOT_FOUND'
      throw err
    }
    if (String(demand.status || '').toUpperCase() !== 'DONE') {
      const err = new Error('需求未完成，不能生成评分任务')
      err.code = 'DEMAND_NOT_DONE'
      throw err
    }
    if (!isDemandEligibleForScoring(demand)) {
      const err = new Error(`仅预期上线时间不早于 ${SCORING_COMPLETED_CUTOFF_DATE} 的需求进入评分范围`)
      err.code = 'DEMAND_NOT_IN_SCORING_WINDOW'
      throw err
    }
    if (!isDemandEligibleByActualHours(demand)) {
      const err = new Error('需求总实际工时为 0，暂不进入评分体系')
      err.code = 'DEMAND_ACTUAL_HOURS_ZERO'
      throw err
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [existingRows] = await conn.query(
        `SELECT id
         FROM demand_score_tasks
         WHERE demand_id = ?
         LIMIT 1`,
        [normalizeDemandId(demand.id)],
      )
      if (existingRows[0] && !forceRebuild) {
        await recalculateTask(existingRows[0].id, { conn })
        await conn.commit()
        return { task_id: Number(existingRows[0].id), created: false }
      }

      const subjectUserIds = await listDemandSubjectUserIds(demand)
      const directOwnerMap = await listDirectOwnerMap(subjectUserIds)
      const task = await createTaskRow(conn, demand, operatorUserId)
      let syncSummary = { subject_count: 0, slot_count: 0 }
      let safeRebuilt = false
      if (existingRows[0] && forceRebuild && await this.hasSubmittedRecordsForDemand(demand.id, { conn })) {
        syncSummary = await syncTaskDetails(conn, task, demand, subjectUserIds, directOwnerMap, {
          preserveExisting: true,
        })
        safeRebuilt = true
      } else {
        syncSummary = await replaceTaskDetails(conn, task, demand, subjectUserIds, directOwnerMap)
      }
      await recalculateTask(task.id, { conn })
      await conn.commit()
      return {
        task_id: Number(task.id),
        created: !existingRows[0],
        rebuilt: Boolean(existingRows[0]),
        safe_rebuilt: safeRebuilt,
        created_subject_count: Number(syncSummary?.subject_count || 0),
        created_slot_count: Number(syncSummary?.slot_count || 0),
      }
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async listMySlots(userId, { status = '', demandId = '', page = 1, pageSize = 20 } = {}) {
    const evaluatorUserId = toPositiveInt(userId)
    if (!evaluatorUserId) return { list: [], total: 0, page: 1, pageSize: 20 }

    const normalizedPage = toPositiveInt(page) || 1
    const normalizedPageSize = Math.min(toPositiveInt(pageSize) || 20, 100)
    const statusText = normalizeText(status, 32).toUpperCase()
    const normalizedDemandId = normalizeDemandId(demandId)
    const where = ['s.evaluator_user_id = ?']
    const params = [evaluatorUserId]
    if (statusText && ['PENDING', 'SUBMITTED'].includes(statusText)) {
      where.push('s.status = ?')
      params.push(statusText)
    }
    if (normalizedDemandId) {
      where.push('t.demand_id = ?')
      params.push(normalizedDemandId)
    }

    const whereSql = where.join(' AND ')
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM demand_score_slots s
       INNER JOIN demand_score_tasks t ON t.id = s.task_id
       INNER JOIN demand_score_subjects sub ON sub.id = s.subject_id
       INNER JOIN work_demands d
         ON d.id COLLATE utf8mb4_unicode_ci = t.demand_id
       WHERE ${whereSql}
         AND COALESCE(d.status, '') <> 'CANCELLED'
         AND DATE(d.expected_release_date) >= ?`,
      [...params, SCORING_COMPLETED_CUTOFF_DATE],
    )
    const [rows] = await pool.query(
       `SELECT
         s.*,
         t.demand_name,
         t.deadline_at,
         t.status AS task_status,
         t.result_ready,
         t.partial_missing,
         DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS expected_release_date,
         sub.evaluatee_name,
         r.id AS record_id,
         r.delivery_score AS record_delivery_score,
         r.collaboration_score AS record_collaboration_score,
         r.responsibility_score AS record_responsibility_score,
         r.weighted_score AS record_weighted_score,
         r.comment AS record_comment,
         DATE_FORMAT(r.submitted_at, '%Y-%m-%d %H:%i:%s') AS record_submitted_at,
         DATE_FORMAT(r.updated_at, '%Y-%m-%d %H:%i:%s') AS record_updated_at,
         DATE_FORMAT(s.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
         DATE_FORMAT(t.deadline_at, '%Y-%m-%d %H:%i:%s') AS deadline_at
       FROM demand_score_slots s
       INNER JOIN demand_score_tasks t ON t.id = s.task_id
       INNER JOIN demand_score_subjects sub ON sub.id = s.subject_id
       INNER JOIN work_demands d
         ON d.id COLLATE utf8mb4_unicode_ci = t.demand_id
       LEFT JOIN demand_score_records r ON r.slot_id = s.id
       WHERE ${whereSql}
         AND COALESCE(d.status, '') <> 'CANCELLED'
         AND DATE(d.expected_release_date) >= ?
       ORDER BY
         CASE WHEN d.expected_release_date IS NULL THEN 1 ELSE 0 END ASC,
         d.expected_release_date DESC,
         CASE s.status WHEN 'PENDING' THEN 0 ELSE 1 END,
         t.deadline_at ASC,
         s.id DESC
       LIMIT ? OFFSET ?`,
      [...params, SCORING_COMPLETED_CUTOFF_DATE, normalizedPageSize, (normalizedPage - 1) * normalizedPageSize],
    )

    const hydratedRows = await attachParticipationReference(rows)
    return {
      list: hydratedRows.map(mapSlotRow),
      total: Number(countRow?.total || 0),
      page: normalizedPage,
      pageSize: normalizedPageSize,
    }
  },

  async listPendingNotificationReceiversByDemand(demandId, { conn = pool } = {}) {
    const normalizedDemandId = normalizeDemandId(demandId)
    if (!normalizedDemandId) return []

    const [rows] = await conn.query(
      `SELECT
         t.demand_id,
         t.demand_name,
         dict.id AS business_line_id,
         s.evaluator_user_id,
         COALESCE(NULLIF(TRIM(u.real_name), ''), NULLIF(TRIM(u.username), ''), CONCAT('用户', s.evaluator_user_id)) AS evaluator_name,
         COUNT(*) AS pending_slot_count,
         GROUP_CONCAT(DISTINCT NULLIF(TRIM(sub.evaluatee_name), '') ORDER BY sub.evaluatee_name SEPARATOR '、') AS evaluatee_names
       FROM demand_score_slots s
       INNER JOIN demand_score_tasks t ON t.id = s.task_id
       INNER JOIN demand_score_subjects sub ON sub.id = s.subject_id
       INNER JOIN work_demands d
         ON d.id COLLATE utf8mb4_unicode_ci = t.demand_id
       LEFT JOIN users u ON u.id = s.evaluator_user_id
       LEFT JOIN config_dict_items dict
         ON dict.type_key = 'business_group'
        AND dict.item_code = d.business_group_code
       WHERE t.demand_id = ?
         AND s.status = ?
         AND COALESCE(d.status, '') <> 'CANCELLED'
         AND DATE(d.expected_release_date) >= ?
       GROUP BY
         t.demand_id,
         t.demand_name,
         dict.id,
         s.evaluator_user_id,
         u.real_name,
         u.username
       ORDER BY s.evaluator_user_id ASC`,
      [normalizedDemandId, SLOT_STATUS.PENDING, SCORING_COMPLETED_CUTOFF_DATE],
    )

    return rows.map((row) => ({
      demand_id: normalizeDemandId(row?.demand_id),
      demand_name: normalizeText(row?.demand_name, 200) || '',
      business_line_id: toPositiveInt(row?.business_line_id),
      evaluator_user_id: toPositiveInt(row?.evaluator_user_id),
      evaluator_name: normalizeText(row?.evaluator_name, 100) || '',
      pending_slot_count: Number(row?.pending_slot_count || 0),
      evaluatee_names: normalizeText(row?.evaluatee_names, 1000) || '',
    })).filter((row) => row.demand_id && row.evaluator_user_id && row.pending_slot_count > 0)
  },

  async getSlotForEvaluator(slotId, userId) {
    const normalizedSlotId = toPositiveInt(slotId)
    const evaluatorUserId = toPositiveInt(userId)
    if (!normalizedSlotId || !evaluatorUserId) return null

    const [rows] = await pool.query(
       `SELECT
         s.*,
         t.demand_name,
         t.deadline_at,
         t.status AS task_status,
         t.result_ready,
         t.partial_missing,
         DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS expected_release_date,
         sub.evaluatee_name,
         r.id AS record_id,
         r.delivery_score AS record_delivery_score,
         r.collaboration_score AS record_collaboration_score,
         r.responsibility_score AS record_responsibility_score,
         r.weighted_score AS record_weighted_score,
         r.comment AS record_comment,
         DATE_FORMAT(r.submitted_at, '%Y-%m-%d %H:%i:%s') AS record_submitted_at,
         DATE_FORMAT(r.updated_at, '%Y-%m-%d %H:%i:%s') AS record_updated_at,
         DATE_FORMAT(s.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
         DATE_FORMAT(t.deadline_at, '%Y-%m-%d %H:%i:%s') AS deadline_at
       FROM demand_score_slots s
       INNER JOIN demand_score_tasks t ON t.id = s.task_id
       INNER JOIN demand_score_subjects sub ON sub.id = s.subject_id
       INNER JOIN work_demands d
         ON d.id COLLATE utf8mb4_unicode_ci = t.demand_id
       LEFT JOIN demand_score_records r ON r.slot_id = s.id
       WHERE s.id = ?
         AND s.evaluator_user_id = ?
         AND COALESCE(d.status, '') <> 'CANCELLED'
         AND DATE(d.expected_release_date) >= ?
       LIMIT 1`,
      [normalizedSlotId, evaluatorUserId, SCORING_COMPLETED_CUTOFF_DATE],
    )
    if (!rows[0]) return null
    const [hydratedRow] = await attachParticipationReference(rows)
    return mapSlotRow(hydratedRow)
  },

  async submitSlot(slotId, userId, payload = {}) {
    const normalizedSlotId = toPositiveInt(slotId)
    const evaluatorUserId = toPositiveInt(userId)
    if (!normalizedSlotId || !evaluatorUserId) {
      const err = new Error('评分槽不存在')
      err.code = 'SLOT_NOT_FOUND'
      throw err
    }

    const score = toScore(payload.score)
    if (score === null) {
      const err = new Error('评分需在 0-100 分之间')
      err.code = 'INVALID_SCORE'
      throw err
    }

    const comment = normalizeText(payload.comment, 2000)
    if (score < 80 && !comment) {
      const err = new Error('评分低于 80 分时，必须填写评价说明')
      err.code = 'COMMENT_REQUIRED'
      throw err
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [slotRows] = await conn.query(
        `SELECT *
         FROM demand_score_slots
         WHERE id = ?
           AND evaluator_user_id = ?
         LIMIT 1
         FOR UPDATE`,
        [normalizedSlotId, evaluatorUserId],
      )
      const slot = slotRows[0]
      if (!slot) {
        const err = new Error('评分槽不存在或无权限')
        err.code = 'SLOT_NOT_FOUND'
        throw err
      }

      await conn.query(
        `INSERT INTO demand_score_records (
           slot_id,
           task_id,
           subject_id,
           demand_id,
           evaluatee_user_id,
           evaluator_user_id,
           delivery_score,
           collaboration_score,
           responsibility_score,
           weighted_score,
           comment
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           delivery_score = VALUES(delivery_score),
           collaboration_score = VALUES(collaboration_score),
           responsibility_score = VALUES(responsibility_score),
           weighted_score = VALUES(weighted_score),
           comment = VALUES(comment),
           updated_at = CURRENT_TIMESTAMP`,
        [
          slot.id,
          slot.task_id,
          slot.subject_id,
          slot.demand_id,
          slot.evaluatee_user_id,
          slot.evaluator_user_id,
          score,
          score,
          score,
          score,
          comment || null,
        ],
      )

      await conn.query(
        `UPDATE demand_score_slots
         SET status = 'SUBMITTED',
             submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP)
         WHERE id = ?`,
        [slot.id],
      )

      await recalculateSubject(slot.subject_id, { conn })
      await recalculateTask(slot.task_id, { conn })
      await conn.commit()
      return this.getSlotForEvaluator(slot.id, evaluatorUserId)
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async listResultDemands({ keyword = '', startDate = '', endDate = '', page = 1, pageSize = 20 } = {}) {
    const normalizedPage = toPositiveInt(page) || 1
    const normalizedPageSize = Math.min(toPositiveInt(pageSize) || 20, 100)
    const where = [
      `COALESCE(d.status, '') <> 'CANCELLED'`,
      'DATE(d.expected_release_date) >= ?',
      'EXISTS (SELECT 1 FROM demand_score_subjects sub_exists WHERE sub_exists.task_id = t.id)',
    ]
    const params = [SCORING_COMPLETED_CUTOFF_DATE]
    const keywordText = normalizeText(keyword, 100)
    if (keywordText) {
      where.push('(t.demand_id LIKE ? OR t.demand_name LIKE ?)')
      params.push(`%${keywordText}%`, `%${keywordText}%`)
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ''))) {
      where.push('DATE(d.expected_release_date) >= ?')
      params.push(startDate)
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ''))) {
      where.push('DATE(d.expected_release_date) <= ?')
      params.push(endDate)
    }
    const whereSql = where.join(' AND ')

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM demand_score_tasks t
       LEFT JOIN work_demands d
         ON d.id COLLATE utf8mb4_unicode_ci = t.demand_id
       WHERE ${whereSql}`,
      params,
    )
    const [rows] = await pool.query(
      `SELECT
         t.id,
         t.demand_id,
         t.demand_name,
         t.status,
         t.result_ready,
         t.partial_missing,
         DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS expected_release_date,
         DATE_FORMAT(t.deadline_at, '%Y-%m-%d %H:%i:%s') AS deadline_at,
         DATE_FORMAT(COALESCE(d.completed_at, t.created_at), '%Y-%m-%d %H:%i:%s') AS demand_completed_at,
         COALESCE(pending.pending_slot_count, 0) AS pending_slot_count,
         COALESCE(pending.pending_evaluator_names, '') AS pending_evaluator_names
       FROM demand_score_tasks t
       LEFT JOIN work_demands d
         ON d.id COLLATE utf8mb4_unicode_ci = t.demand_id
       LEFT JOIN (
         SELECT
           task_id,
           COUNT(*) AS pending_slot_count,
           GROUP_CONCAT(
             DISTINCT COALESCE(NULLIF(evaluator_name, ''), CONCAT('用户', evaluator_user_id))
             ORDER BY evaluator_user_id ASC
             SEPARATOR '、'
           ) AS pending_evaluator_names
         FROM demand_score_slots
         WHERE status <> 'SUBMITTED'
         GROUP BY task_id
       ) pending ON pending.task_id = t.id
       WHERE ${whereSql}
       ORDER BY COALESCE(d.completed_at, t.created_at) DESC, t.id DESC
       LIMIT ? OFFSET ?`,
      [...params, normalizedPageSize, (normalizedPage - 1) * normalizedPageSize],
    )
    const taskIds = rows.map((row) => Number(row?.id || 0)).filter((id) => Number.isInteger(id) && id > 0)
    const subjectMapByTaskId = new Map()

    if (taskIds.length > 0) {
      const [subjectRows, slotRows] = await Promise.all([
        pool.query(
          `SELECT
             id,
             task_id,
             evaluatee_user_id,
             evaluatee_name,
             status,
             final_score,
             effective_weight,
             submitted_role_keys_json,
             missing_role_keys_json
           FROM demand_score_subjects
           WHERE task_id IN (?)
           ORDER BY id ASC`,
          [taskIds],
        ),
        pool.query(
          `SELECT
             s.id,
             s.task_id,
             s.subject_id,
             s.evaluatee_user_id,
             s.evaluator_user_id,
             s.evaluator_name,
             s.slot_type,
             s.status,
             s.base_weight,
             s.role_keys_json,
             r.weighted_score AS record_weighted_score,
             r.comment AS record_comment,
             DATE_FORMAT(r.submitted_at, '%Y-%m-%d %H:%i:%s') AS record_submitted_at,
             DATE_FORMAT(r.updated_at, '%Y-%m-%d %H:%i:%s') AS record_updated_at
           FROM demand_score_slots s
           LEFT JOIN demand_score_records r ON r.slot_id = s.id
           WHERE s.task_id IN (?)
           ORDER BY s.subject_id ASC, s.id ASC`,
          [taskIds],
        ),
      ])
      const slotMapBySubjectId = new Map()
      ;(slotRows[0] || []).forEach((row) => {
        const subjectId = Number(row?.subject_id || 0)
        if (!Number.isInteger(subjectId) || subjectId <= 0) return
        if (!slotMapBySubjectId.has(subjectId)) slotMapBySubjectId.set(subjectId, [])
        slotMapBySubjectId.get(subjectId).push(row)
      })
      ;(subjectRows[0] || []).forEach((row) => {
        const taskId = Number(row?.task_id || 0)
        if (!Number.isInteger(taskId) || taskId <= 0) return
        if (!subjectMapByTaskId.has(taskId)) subjectMapByTaskId.set(taskId, [])
        subjectMapByTaskId.get(taskId).push(buildSubjectResultRow(row, slotMapBySubjectId.get(Number(row?.id || 0)) || []))
      })
    }

    return {
      list: rows.map((row) => ({
        ...row,
        id: Number(row.id || 0),
        ...buildDemandAggregateFromSubjects(row, subjectMapByTaskId.get(Number(row.id || 0)) || []),
        pending_slot_count: Number(row.pending_slot_count || 0),
        pending_evaluator_names: String(row.pending_evaluator_names || '')
          .split('、')
          .map((name) => normalizeText(name, 64))
          .filter(Boolean),
      })),
      total: Number(countRow?.total || 0),
      page: normalizedPage,
      pageSize: normalizedPageSize,
    }
  },

  async getDemandResult(taskId) {
    const normalizedTaskId = toPositiveInt(taskId)
    if (!normalizedTaskId) return null
    const [taskRows] = await pool.query(
      `SELECT
         t.*,
         DATE_FORMAT(t.deadline_at, '%Y-%m-%d %H:%i:%s') AS deadline_at,
         DATE_FORMAT(t.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at
       FROM demand_score_tasks t
       INNER JOIN work_demands d
         ON d.id COLLATE utf8mb4_unicode_ci = t.demand_id
       WHERE t.id = ?
         AND COALESCE(d.status, '') <> 'CANCELLED'
         AND DATE(d.expected_release_date) >= ?
       LIMIT 1`,
      [normalizedTaskId, SCORING_COMPLETED_CUTOFF_DATE],
    )
    const task = taskRows[0] || null
    if (!task) return null

    const [subjects] = await pool.query(
      `SELECT
         id,
         task_id,
         evaluatee_user_id,
         evaluatee_name,
         status,
         final_score,
         effective_weight,
         submitted_role_keys_json,
         missing_role_keys_json,
         DATE_FORMAT(result_calculated_at, '%Y-%m-%d %H:%i:%s') AS result_calculated_at
       FROM demand_score_subjects
       WHERE task_id = ?
       ORDER BY final_score DESC, id ASC`,
      [normalizedTaskId],
    )

    const [slotRows] = await pool.query(
      `SELECT
         s.id,
         s.subject_id,
         s.evaluatee_user_id,
         s.evaluator_user_id,
         s.evaluator_name,
        s.slot_type,
        s.status,
        s.base_weight,
        s.role_keys_json,
        r.weighted_score AS record_weighted_score,
        r.comment AS record_comment,
        DATE_FORMAT(r.submitted_at, '%Y-%m-%d %H:%i:%s') AS record_submitted_at,
        DATE_FORMAT(r.updated_at, '%Y-%m-%d %H:%i:%s') AS record_updated_at
       FROM demand_score_slots s
       LEFT JOIN demand_score_records r ON r.slot_id = s.id
       WHERE s.task_id = ?
       ORDER BY s.subject_id ASC, s.id ASC`,
      [normalizedTaskId],
    )

    const slotMapBySubjectId = new Map()
    ;(slotRows || []).forEach((row) => {
      const subjectId = Number(row?.subject_id || 0)
      if (!Number.isInteger(subjectId) || subjectId <= 0) return
      if (!slotMapBySubjectId.has(subjectId)) slotMapBySubjectId.set(subjectId, [])
      slotMapBySubjectId.get(subjectId).push(row)
    })

    return {
      task: {
        ...task,
        id: Number(task.id || 0),
        owner_user_id: toPositiveInt(task.owner_user_id),
        project_manager_user_id: toPositiveInt(task.project_manager_user_id),
      },
      subjects: subjects.map((row) => ({
        ...buildSubjectResultRow(row, slotMapBySubjectId.get(Number(row.id || 0)) || []),
      })),
    }
  },

  async listTeamRanking({ startDate = '', endDate = '' } = {}) {
    const where = ['t.result_ready = 1', `COALESCE(d.status, '') <> 'CANCELLED'`, 'DATE(d.expected_release_date) >= ?']
    const params = [SCORING_COMPLETED_CUTOFF_DATE]
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ''))) {
      where.push('DATE(d.expected_release_date) >= ?')
      params.push(startDate)
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ''))) {
      where.push('DATE(d.expected_release_date) <= ?')
      params.push(endDate)
    }
    const [detailRows] = await pool.query(
      `SELECT
         sub.id,
         sub.evaluatee_user_id,
         sub.evaluatee_name,
         sub.task_id,
         t.id AS task_id,
         t.demand_id,
         t.demand_name,
         DATE_FORMAT(d.expected_release_date, '%Y-%m-%d') AS expected_release_date,
         sub.final_score,
         CASE WHEN JSON_LENGTH(COALESCE(sub.missing_role_keys_json, JSON_ARRAY())) > 0 THEN 1 ELSE 0 END AS partial_flag,
         DATE_FORMAT(COALESCE(d.expected_release_date, d.completed_at, t.completed_at, t.created_at), '%Y-%m-%d') AS demand_date
       FROM demand_score_subjects sub
       INNER JOIN demand_score_tasks t ON t.id = sub.task_id
       LEFT JOIN work_demands d
         ON d.id COLLATE utf8mb4_unicode_ci = t.demand_id
       WHERE ${where.join(' AND ')}
         AND sub.status = 'COMPLETED'
         AND sub.final_score IS NOT NULL
       ORDER BY
         sub.evaluatee_user_id ASC,
         COALESCE(d.expected_release_date, d.completed_at, t.completed_at, t.created_at) DESC,
         t.id DESC`,
      params,
    )
    const subjectIds = detailRows
      .map((row) => Number(row?.id || 0))
      .filter((id) => Number.isInteger(id) && id > 0)
    const [slotRows] = subjectIds.length > 0
      ? await pool.query(
          `SELECT
             s.id,
             s.subject_id,
             s.evaluatee_user_id,
             s.evaluator_user_id,
             s.evaluator_name,
             s.slot_type,
             s.status,
             s.base_weight,
             s.role_keys_json,
             r.weighted_score AS record_weighted_score,
             r.comment AS record_comment,
             DATE_FORMAT(r.submitted_at, '%Y-%m-%d %H:%i:%s') AS record_submitted_at,
             DATE_FORMAT(r.updated_at, '%Y-%m-%d %H:%i:%s') AS record_updated_at
           FROM demand_score_slots s
           LEFT JOIN demand_score_records r ON r.slot_id = s.id
           WHERE s.subject_id IN (?)
           ORDER BY s.subject_id ASC, s.id ASC`,
          [subjectIds],
        )
      : [[]]

    const slotMapBySubjectId = new Map()
    ;(slotRows || []).forEach((row) => {
      const subjectId = Number(row?.subject_id || 0)
      if (!Number.isInteger(subjectId) || subjectId <= 0) return
      if (!slotMapBySubjectId.has(subjectId)) slotMapBySubjectId.set(subjectId, [])
      slotMapBySubjectId.get(subjectId).push(row)
    })

    const memberMap = new Map()
    const detailMap = new Map()
    ;(detailRows || []).forEach((row) => {
      const evaluateeUserId = Number(row.evaluatee_user_id || 0)
      if (!Number.isInteger(evaluateeUserId) || evaluateeUserId <= 0) return
      const subject = buildSubjectResultRow(row, slotMapBySubjectId.get(Number(row?.id || 0)) || [])
      if (!memberMap.has(evaluateeUserId)) {
        memberMap.set(evaluateeUserId, {
          evaluatee_user_id: evaluateeUserId,
          evaluatee_name: row.evaluatee_name || '',
          subjects: [],
        })
      }
      memberMap.get(evaluateeUserId).subjects.push(subject)
      if (!detailMap.has(evaluateeUserId)) {
        detailMap.set(evaluateeUserId, [])
      }
      detailMap.get(evaluateeUserId).push({
        task_id: Number(row.task_id || 0),
        demand_id: row.demand_id || '',
        demand_name: row.demand_name || '',
        expected_release_date: row.expected_release_date || '',
        demand_date: row.demand_date || '',
        final_score: roundScore(subject.final_score),
        demand_owner_score: roundScore(subject.demand_owner_score),
        direct_owner_score: roundScore(subject.direct_owner_score),
        collaborator_score: roundScore(subject.collaborator_score),
        project_manager_score: roundScore(subject.project_manager_score),
        partial_flag: Number(row.partial_flag || 0),
      })
    })

    return Array.from(memberMap.values())
      .map((member) => ({
        evaluatee_user_id: member.evaluatee_user_id,
        evaluatee_name: member.evaluatee_name,
        demand_count: member.subjects.length,
        avg_final_score: averageScores(member.subjects.map((subject) => subject.final_score)),
        avg_demand_owner_score: averageScores(member.subjects.map((subject) => subject.demand_owner_score)),
        avg_direct_owner_score: averageScores(member.subjects.map((subject) => subject.direct_owner_score)),
        avg_collaborator_score: averageScores(member.subjects.map((subject) => subject.collaborator_score)),
        avg_project_manager_score: averageScores(member.subjects.map((subject) => subject.project_manager_score)),
        partial_count: member.subjects.filter((subject) => subject.missing_role_keys.length > 0).length,
        demand_records: detailMap.get(member.evaluatee_user_id) || [],
      }))
      .sort((left, right) => {
        const scoreDiff = (Number(right.avg_final_score || 0) - Number(left.avg_final_score || 0))
        if (scoreDiff !== 0) return scoreDiff
        const demandDiff = Number(right.demand_count || 0) - Number(left.demand_count || 0)
        if (demandDiff !== 0) return demandDiff
        return Number(left.evaluatee_user_id || 0) - Number(right.evaluatee_user_id || 0)
      })
      .map((row, index) => ({
      rank: index + 1,
        evaluatee_user_id: Number(row.evaluatee_user_id || 0),
        evaluatee_name: row.evaluatee_name || '',
        demand_count: Number(row.demand_count || 0),
        avg_final_score: roundScore(row.avg_final_score),
        avg_demand_owner_score: roundScore(row.avg_demand_owner_score),
        avg_direct_owner_score: roundScore(row.avg_direct_owner_score),
        avg_collaborator_score: roundScore(row.avg_collaborator_score),
        avg_project_manager_score: roundScore(row.avg_project_manager_score),
        partial_count: Number(row.partial_count || 0),
        demand_records: row.demand_records || [],
      }))
  },
}

module.exports = DemandScoring
