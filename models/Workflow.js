const pool = require('../utils/db')

const DEMAND_BIZ_TYPE = 'DEMAND'
const DEFAULT_TEMPLATE_KEY = 'DEMAND_STD_FLOW'
const DEFAULT_TEMPLATE_NAME = '需求标准流程'
const DEMAND_PHASE_DICT_KEY = 'demand_phase_type'

const INSTANCE_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  TERMINATED: 'TERMINATED',
}

const NODE_STATUS = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
}

const TASK_STATUS = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
}

const TRACK_ITEM_TYPE_KEYS = new Set(
  String(process.env.WORKFLOW_TRACK_ITEM_TYPE_KEYS || 'DEMAND_DEV')
    .split(',')
    .map((item) => String(item || '').trim().toUpperCase())
    .filter(Boolean),
)
const AUTO_WORKLOG_PREFIX = '[流程待办]'

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeText(value, maxLen = 255) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  return text
}

function normalizeStatus(status, fallback = '') {
  const value = String(status || '').trim().toUpperCase()
  return value || fallback
}

function isWorkflowTableMissingError(err) {
  return err?.code === 'ER_NO_SUCH_TABLE' || err?.errno === 1146
}

function wrapWorkflowError(err) {
  if (!isWorkflowTableMissingError(err)) return err
  const wrapped = new Error('workflow_tables_missing')
  wrapped.code = 'WORKFLOW_TABLES_MISSING'
  return wrapped
}

async function listEnabledDemandPhases(conn) {
  const [rows] = await conn.query(
    `SELECT
       i.item_code AS phase_key,
       i.item_name AS phase_name,
       i.sort_order
     FROM config_dict_items i
     INNER JOIN config_dict_types t ON t.type_key = i.type_key
     WHERE i.type_key = ?
       AND t.enabled = 1
       AND i.enabled = 1
     ORDER BY i.sort_order ASC, i.id ASC`,
    [DEMAND_PHASE_DICT_KEY],
  )

  return (rows || []).map((row, index) => ({
    phase_key: normalizeText(row.phase_key, 64).toUpperCase(),
    phase_name: normalizeText(row.phase_name, 128) || normalizeText(row.phase_key, 64).toUpperCase(),
    sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : (index + 1) * 10,
  }))
}

async function loadTemplateNodes(conn, templateId) {
  const [rows] = await conn.query(
    `SELECT
       id,
       template_id,
       node_key,
       node_name,
       node_type,
       phase_key,
       sort_order,
       allow_return_to_prev,
       assignee_rule,
       extra_json
     FROM wf_process_template_nodes
     WHERE template_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [templateId],
  )
  return rows || []
}

async function findActiveDemandInstance(conn, demandId, { forUpdate = false } = {}) {
  const lockSql = forUpdate ? 'FOR UPDATE' : ''
  const [rows] = await conn.query(
    `SELECT
       i.id,
       i.biz_id,
       i.status,
       i.current_node_key
     FROM wf_process_instances i
     WHERE i.biz_type = ?
       AND i.biz_id = ?
       AND i.status IN (?, ?)
     ORDER BY
       CASE i.status WHEN 'IN_PROGRESS' THEN 0 ELSE 1 END ASC,
       i.id DESC
     LIMIT 1
     ${lockSql}`,
    [DEMAND_BIZ_TYPE, demandId, INSTANCE_STATUS.IN_PROGRESS, INSTANCE_STATUS.NOT_STARTED],
  )
  return rows[0] || null
}

async function ensureDefaultTemplate(conn, { createdBy = null } = {}) {
  const [rows] = await conn.query(
    `SELECT
       id,
       template_key,
       template_name,
       biz_type,
       version,
       is_default,
       enabled
     FROM wf_process_templates
     WHERE biz_type = ?
       AND template_key = ?
       AND enabled = 1
     ORDER BY version DESC, id DESC
     LIMIT 1`,
    [DEMAND_BIZ_TYPE, DEFAULT_TEMPLATE_KEY],
  )

  let template = rows[0] || null
  if (template) {
    const nodes = await loadTemplateNodes(conn, template.id)
    if (nodes.length > 0) return { template, nodes }
  }

  const phases = await listEnabledDemandPhases(conn)
  if (phases.length === 0) {
    const err = new Error('demand_phase_dict_empty')
    err.code = 'DEMAND_PHASE_DICT_EMPTY'
    throw err
  }

  if (!template) {
    const [[versionRow]] = await conn.query(
      `SELECT COALESCE(MAX(version), 0) AS max_version
       FROM wf_process_templates
       WHERE template_key = ?`,
      [DEFAULT_TEMPLATE_KEY],
    )
    const nextVersion = Number(versionRow?.max_version || 0) + 1

    const [result] = await conn.query(
      `INSERT INTO wf_process_templates (
         template_key,
         template_name,
         biz_type,
         version,
         is_default,
         enabled,
         created_by
       ) VALUES (?, ?, ?, ?, 1, 1, ?)`,
      [DEFAULT_TEMPLATE_KEY, DEFAULT_TEMPLATE_NAME, DEMAND_BIZ_TYPE, nextVersion, createdBy],
    )

    template = {
      id: Number(result.insertId),
      template_key: DEFAULT_TEMPLATE_KEY,
      template_name: DEFAULT_TEMPLATE_NAME,
      biz_type: DEMAND_BIZ_TYPE,
      version: nextVersion,
      is_default: 1,
      enabled: 1,
    }
  }

  const insertValues = phases.map((item, index) => [
    template.id,
    item.phase_key,
    item.phase_name,
    'TASK',
    item.phase_key,
    Number.isFinite(item.sort_order) ? item.sort_order : (index + 1) * 10,
    1,
    index === 0 ? 'DEMAND_OWNER' : 'MANUAL',
    null,
  ])

  for (const values of insertValues) {
    await conn.query(
      `INSERT INTO wf_process_template_nodes (
         template_id,
         node_key,
         node_name,
         node_type,
         phase_key,
         sort_order,
         allow_return_to_prev,
         assignee_rule,
         extra_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values,
    )
  }

  const nodes = await loadTemplateNodes(conn, template.id)
  return { template, nodes }
}

async function createTaskForNode(
  conn,
  {
    instanceId,
    instanceNodeId,
    demandId,
    phaseKey = null,
    nodeName,
    assigneeUserId,
    dueAt = null,
    expectedStartDate = null,
    assignedByUserId = null,
    createdBy = null,
    sourceType = 'SYSTEM',
    sourceId = null,
  },
) {
  const normalizedAssignee = toPositiveInt(assigneeUserId)
  if (!normalizedAssignee) return null

  const title = `需求 ${demandId} · ${nodeName || '流程节点'}`
  const normalizedDueAt = normalizeDate(dueAt)

  const [result] = await conn.query(
    `INSERT INTO wf_process_tasks (
       instance_id,
       instance_node_id,
       task_title,
       assignee_user_id,
       status,
       priority,
       due_at,
       source_type,
       source_id,
       created_by
     ) VALUES (?, ?, ?, ?, ?, 'NORMAL', ?, ?, ?, ?)`,
    [
      instanceId,
      instanceNodeId,
      normalizeText(title, 255),
      normalizedAssignee,
      TASK_STATUS.TODO,
      normalizedDueAt,
      normalizeText(sourceType, 32) || 'SYSTEM',
      sourceId || null,
      toPositiveInt(createdBy),
    ],
  )

  const taskId = Number(result.insertId)

  await ensureAutoWorkLogForTask(conn, {
    taskId,
    demandId,
    phaseKey,
    nodeName,
    assigneeUserId: normalizedAssignee,
    dueAt: normalizedDueAt,
    expectedStartDate,
    assignedByUserId,
  })

  return taskId
}

async function resolveTrackItemType(conn) {
  const keys = Array.from(TRACK_ITEM_TYPE_KEYS)
  if (keys.length === 0) return null
  const placeholders = keys.map(() => '?').join(', ')

  const [dictRows] = await conn.query(
    `SELECT
       CAST(i.id AS SIGNED) AS item_type_id,
       UPPER(i.item_code) AS item_type_key
     FROM config_dict_items i
     INNER JOIN config_dict_types t ON t.type_key = i.type_key
     WHERE i.type_key = 'issue_type'
       AND UPPER(i.item_code) IN (${placeholders})
       AND t.enabled = 1
       AND i.enabled = 1
     ORDER BY i.sort_order ASC, i.id ASC
     LIMIT 1`,
    keys,
  )
  if ((dictRows || []).length > 0) {
    return {
      item_type_id: Number(dictRows[0].item_type_id),
      item_type_key: String(dictRows[0].item_type_key || '').toUpperCase(),
    }
  }

  const [legacyRows] = await conn.query(
    `SELECT
       id AS item_type_id,
       UPPER(type_key) AS item_type_key
     FROM work_item_types
     WHERE UPPER(type_key) IN (${placeholders})
       AND enabled = 1
     ORDER BY sort_order ASC, id ASC
     LIMIT 1`,
    keys,
  )
  if ((legacyRows || []).length > 0) {
    return {
      item_type_id: Number(legacyRows[0].item_type_id),
      item_type_key: String(legacyRows[0].item_type_key || '').toUpperCase(),
    }
  }
  return null
}

function buildAutoWorkLogDescription({ taskId, demandId, nodeName }) {
  const suffix = taskId ? ` #${taskId}` : ''
  return `${AUTO_WORKLOG_PREFIX} 需求 ${demandId} · ${nodeName || '流程节点'}${suffix}`.slice(0, 2000)
}

async function ensureAutoWorkLogForTask(
  conn,
  {
    taskId,
    demandId,
    phaseKey,
    nodeName,
    assigneeUserId,
    dueAt = null,
    expectedStartDate = null,
    assignedByUserId = null,
  } = {},
) {
  const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
  const normalizedPhaseKey = normalizeText(phaseKey, 64).toUpperCase()
  const normalizedAssignee = toPositiveInt(assigneeUserId)
  const normalizedExpectedStartDate = normalizeDate(expectedStartDate)
  const normalizedAssignedByUserId = toPositiveInt(assignedByUserId)
  if (!normalizedDemandId || !normalizedPhaseKey || !normalizedAssignee) return null

  const trackType = await resolveTrackItemType(conn)
  const itemTypeId = toPositiveInt(trackType?.item_type_id)
  if (!itemTypeId) return null

  const [rows] = await conn.query(
    `SELECT
       id,
       DATE_FORMAT(expected_completion_date, '%Y-%m-%d') AS expected_completion_date
     FROM work_logs
     WHERE user_id = ?
       AND demand_id = ?
       AND phase_key = ?
       AND COALESCE(log_status, 'IN_PROGRESS') <> 'DONE'
       AND description LIKE ?
     ORDER BY id DESC
     LIMIT 1
     FOR UPDATE`,
    [normalizedAssignee, normalizedDemandId, normalizedPhaseKey, `${AUTO_WORKLOG_PREFIX}%`],
  )

  if ((rows || []).length > 0) {
    const existing = rows[0]
    await conn.query(
      `UPDATE work_logs
       SET
         item_type_id = ?,
         description = ?,
         task_source = 'WORKFLOW_AUTO',
         assigned_by_user_id = COALESCE(?, assigned_by_user_id),
         expected_start_date = COALESCE(?, expected_start_date, CURDATE()),
         expected_completion_date = COALESCE(?, expected_completion_date),
         updated_at = NOW()
       WHERE id = ?`,
      [
        itemTypeId,
        buildAutoWorkLogDescription({ taskId, demandId: normalizedDemandId, nodeName }),
        normalizedAssignedByUserId,
        normalizedExpectedStartDate,
        dueAt,
        existing.id,
      ],
    )
    return Number(existing.id)
  }

  const [insertResult] = await conn.query(
    `INSERT INTO work_logs (
       user_id,
       log_date,
       item_type_id,
       description,
       personal_estimate_hours,
       actual_hours,
       remaining_hours,
       log_status,
       task_source,
       demand_id,
       phase_key,
       assigned_by_user_id,
       expected_start_date,
       expected_completion_date,
       log_completed_at
     ) VALUES (?, CURDATE(), ?, ?, 1.0, 0.0, 1.0, 'TODO', 'WORKFLOW_AUTO', ?, ?, ?, COALESCE(?, CURDATE()), ?, NULL)`,
    [
      normalizedAssignee,
      itemTypeId,
      buildAutoWorkLogDescription({ taskId, demandId: normalizedDemandId, nodeName }),
      normalizedDemandId,
      normalizedPhaseKey,
      normalizedAssignedByUserId,
      normalizedExpectedStartDate,
      dueAt,
    ],
  )

  return Number(insertResult.insertId)
}

async function closeAutoWorkLogsForNodeAssignee(
  conn,
  { demandId, phaseKey, assigneeUserId } = {},
) {
  const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
  const normalizedPhaseKey = normalizeText(phaseKey, 64).toUpperCase()
  const normalizedAssignee = toPositiveInt(assigneeUserId)
  if (!normalizedDemandId || !normalizedPhaseKey || !normalizedAssignee) return 0

  const [result] = await conn.query(
    `UPDATE work_logs
     SET
       log_status = 'DONE',
       remaining_hours = 0,
       log_completed_at = COALESCE(log_completed_at, NOW()),
       updated_at = NOW()
     WHERE user_id = ?
       AND demand_id = ?
       AND phase_key = ?
       AND COALESCE(log_status, 'IN_PROGRESS') <> 'DONE'
       AND description LIKE ?`,
    [normalizedAssignee, normalizedDemandId, normalizedPhaseKey, `${AUTO_WORKLOG_PREFIX}%`],
  )
  return Number(result?.affectedRows || 0)
}

async function insertAction(
  conn,
  {
    instanceId,
    instanceNodeId = null,
    actionType,
    fromNodeKey = null,
    toNodeKey = null,
    operatorUserId = null,
    targetUserId = null,
    comment = '',
    sourceType = null,
    sourceId = null,
  },
) {
  await conn.query(
    `INSERT INTO wf_process_actions (
       instance_id,
       instance_node_id,
       action_type,
       from_node_key,
       to_node_key,
       operator_user_id,
       target_user_id,
       comment,
       source_type,
       source_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      instanceId,
      instanceNodeId ? Number(instanceNodeId) : null,
      normalizeText(actionType, 64),
      normalizeText(fromNodeKey, 64) || null,
      normalizeText(toNodeKey, 64) || null,
      toPositiveInt(operatorUserId),
      toPositiveInt(targetUserId),
      normalizeText(comment, 500) || null,
      normalizeText(sourceType, 32) || null,
      sourceId || null,
    ],
  )
}

async function findCurrentNodeForUpdate(conn, instanceId, currentNodeKey) {
  const [rows] = await conn.query(
    `SELECT
       n.id,
       n.instance_id,
       n.node_key,
       n.node_name_snapshot,
       n.phase_key,
       n.sort_order,
       n.status,
       n.assignee_user_id
     FROM wf_process_instance_nodes n
     WHERE n.instance_id = ?
       AND n.node_key = ?
     LIMIT 1
     FOR UPDATE`,
    [instanceId, currentNodeKey],
  )
  return rows[0] || null
}

async function findNodeByKeyForUpdate(conn, instanceId, nodeKey) {
  const [rows] = await conn.query(
    `SELECT
       n.id,
       n.instance_id,
       n.node_key,
       n.node_name_snapshot,
       n.phase_key,
       n.sort_order,
       n.status,
       n.assignee_user_id
     FROM wf_process_instance_nodes n
     WHERE n.instance_id = ?
       AND n.node_key = ?
     LIMIT 1
     FOR UPDATE`,
    [instanceId, nodeKey],
  )
  return rows[0] || null
}

async function findNextNodeForUpdate(conn, instanceId, currentSortOrder) {
  const [rows] = await conn.query(
    `SELECT
       n.id,
       n.instance_id,
       n.node_key,
       n.node_name_snapshot,
       n.phase_key,
       n.sort_order,
       n.status,
       n.assignee_user_id,
       DATE_FORMAT(n.due_at, '%Y-%m-%d') AS due_at
     FROM wf_process_instance_nodes n
     WHERE n.instance_id = ?
       AND n.sort_order > ?
     ORDER BY n.sort_order ASC, n.id ASC
     LIMIT 1
     FOR UPDATE`,
    [instanceId, Number(currentSortOrder || 0)],
  )
  return rows[0] || null
}

async function ensureNextNodeTask(conn, nextNode, demandId, operatorUserId, sourceType = 'WORKFLOW') {
  if (!nextNode || !toPositiveInt(nextNode.assignee_user_id)) return null

  const [[countRow]] = await conn.query(
    `SELECT COUNT(*) AS total
     FROM wf_process_tasks
     WHERE instance_node_id = ?
       AND assignee_user_id = ?
       AND status IN (?, ?)`,
    [nextNode.id, nextNode.assignee_user_id, TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
  )

  if (Number(countRow?.total || 0) > 0) return null

  return createTaskForNode(conn, {
    instanceId: nextNode.instance_id,
    instanceNodeId: nextNode.id,
    demandId,
    phaseKey: nextNode.phase_key,
    nodeName: nextNode.node_name_snapshot,
    assigneeUserId: nextNode.assignee_user_id,
    dueAt: nextNode.due_at || null,
    createdBy: operatorUserId,
    sourceType,
  })
}

const Workflow = {
  TRACK_ITEM_TYPE_KEYS,
  INSTANCE_STATUS,
  NODE_STATUS,
  TASK_STATUS,

  async initDemandWorkflow({ demandId, ownerUserId = null, operatorUserId = null } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    if (!normalizedDemandId) {
      const err = new Error('demand_id_required')
      err.code = 'DEMAND_ID_REQUIRED'
      throw err
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const existing = await findActiveDemandInstance(conn, normalizedDemandId, { forUpdate: true })
      if (existing) {
        await conn.commit()
        return this.getDemandWorkflowByInstanceId(existing.id)
      }

      const normalizedOwnerUserId = toPositiveInt(ownerUserId)
      const normalizedOperatorUserId = toPositiveInt(operatorUserId)
      const { template, nodes } = await ensureDefaultTemplate(conn, {
        createdBy: normalizedOperatorUserId,
      })

      if (!Array.isArray(nodes) || nodes.length === 0) {
        const err = new Error('workflow_template_has_no_nodes')
        err.code = 'WORKFLOW_TEMPLATE_HAS_NO_NODES'
        throw err
      }

      const firstNode = nodes[0]
      const [instanceResult] = await conn.query(
        `INSERT INTO wf_process_instances (
           biz_type,
           biz_id,
           template_id,
           template_version,
           status,
           current_node_key,
           started_at,
           created_by
         ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [
          DEMAND_BIZ_TYPE,
          normalizedDemandId,
          template.id,
          template.version,
          INSTANCE_STATUS.IN_PROGRESS,
          firstNode.node_key,
          normalizedOperatorUserId,
        ],
      )
      const instanceId = Number(instanceResult.insertId)

      let firstInstanceNodeId = null
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i]
        const isCurrent = i === 0
        const status = isCurrent ? NODE_STATUS.IN_PROGRESS : NODE_STATUS.TODO
        const assigneeUserId = isCurrent ? normalizedOwnerUserId : null

        const [result] = await conn.query(
          `INSERT INTO wf_process_instance_nodes (
             instance_id,
             node_key,
             node_name_snapshot,
             node_type,
             phase_key,
             sort_order,
             status,
             assignee_user_id,
             started_at,
             completed_at,
             due_at,
             remark
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
          [
            instanceId,
            node.node_key,
            node.node_name,
            node.node_type || 'TASK',
            node.phase_key || null,
            Number(node.sort_order || (i + 1) * 10),
            status,
            assigneeUserId,
            isCurrent ? new Date() : null,
          ],
        )

        if (isCurrent) {
          firstInstanceNodeId = Number(result.insertId)
        }
      }

      await insertAction(conn, {
        instanceId,
        instanceNodeId: firstInstanceNodeId,
        actionType: 'PROCESS_INIT',
        fromNodeKey: null,
        toNodeKey: firstNode.node_key,
        operatorUserId: normalizedOperatorUserId,
        comment: '闇€姹傛祦绋嬪疄渚嬪凡鍒涘缓',
      })

      if (firstInstanceNodeId && normalizedOwnerUserId) {
        await createTaskForNode(conn, {
          instanceId,
          instanceNodeId: firstInstanceNodeId,
          demandId: normalizedDemandId,
          phaseKey: firstNode.phase_key,
          nodeName: firstNode.node_name,
          assigneeUserId: normalizedOwnerUserId,
          createdBy: normalizedOperatorUserId,
          sourceType: 'SYSTEM_INIT',
          sourceId: firstInstanceNodeId,
        })

        await insertAction(conn, {
          instanceId,
          instanceNodeId: firstInstanceNodeId,
          actionType: 'ASSIGN',
          fromNodeKey: firstNode.node_key,
          toNodeKey: firstNode.node_key,
          operatorUserId: normalizedOperatorUserId,
          targetUserId: normalizedOwnerUserId,
          comment: '鍒濆鍖栬嚜鍔ㄦ寚娲剧粰闇€姹傝礋璐ｄ汉',
        })
      }

      await conn.commit()
      return this.getDemandWorkflowByInstanceId(instanceId)
    } catch (err) {
      await conn.rollback()
      throw wrapWorkflowError(err)
    } finally {
      conn.release()
    }
  },

  async getDemandWorkflowByDemandId(demandId, { includeActionsLimit = 50 } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    if (!normalizedDemandId) return null

    try {
      const [rows] = await pool.query(
        `SELECT
           i.id
         FROM wf_process_instances i
         WHERE i.biz_type = ?
           AND i.biz_id = ?
         ORDER BY
           CASE i.status WHEN 'IN_PROGRESS' THEN 0 WHEN 'NOT_STARTED' THEN 1 ELSE 2 END ASC,
           i.id DESC
         LIMIT 1`,
        [DEMAND_BIZ_TYPE, normalizedDemandId],
      )

      const row = rows[0]
      if (!row?.id) return null
      return this.getDemandWorkflowByInstanceId(row.id, { includeActionsLimit })
    } catch (err) {
      throw wrapWorkflowError(err)
    }
  },

  async getDemandWorkflowByInstanceId(instanceId, { includeActionsLimit = 50 } = {}) {
    const normalizedInstanceId = toPositiveInt(instanceId)
    if (!normalizedInstanceId) return null

    try {
      const [instanceRows] = await pool.query(
        `SELECT
           i.id,
           i.biz_type,
           i.biz_id,
           i.template_id,
           i.template_version,
           i.status,
           i.current_node_key,
           DATE_FORMAT(i.started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
           DATE_FORMAT(i.ended_at, '%Y-%m-%d %H:%i:%s') AS ended_at,
           DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           DATE_FORMAT(i.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
           t.template_key,
           t.template_name
         FROM wf_process_instances i
         LEFT JOIN wf_process_templates t ON t.id = i.template_id
         WHERE i.id = ?
         LIMIT 1`,
        [normalizedInstanceId],
      )

      const instance = instanceRows[0]
      if (!instance) return null

      const [nodeRows, taskRows, actionRows] = await Promise.all([
        pool.query(
          `SELECT
             n.id,
             n.instance_id,
             n.node_key,
             n.node_name_snapshot,
             n.node_type,
             n.phase_key,
             n.sort_order,
             n.status,
             n.assignee_user_id,
             COALESCE(NULLIF(u.real_name, ''), u.username) AS assignee_name,
             DATE_FORMAT(n.started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
             DATE_FORMAT(n.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
             DATE_FORMAT(n.due_at, '%Y-%m-%d') AS due_at,
             n.remark
           FROM wf_process_instance_nodes n
           LEFT JOIN users u ON u.id = n.assignee_user_id
           WHERE n.instance_id = ?
           ORDER BY n.sort_order ASC, n.id ASC`,
          [normalizedInstanceId],
        ),
        pool.query(
          `SELECT
             t.id,
             t.instance_id,
             t.instance_node_id,
             t.task_title,
             t.assignee_user_id,
             COALESCE(NULLIF(u.real_name, ''), u.username) AS assignee_name,
             t.status,
             t.priority,
             DATE_FORMAT(t.due_at, '%Y-%m-%d') AS due_at,
             t.source_type,
             t.source_id,
             DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
             DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
             DATE_FORMAT(t.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at
           FROM wf_process_tasks t
           LEFT JOIN users u ON u.id = t.assignee_user_id
           WHERE t.instance_id = ?
           ORDER BY t.id DESC
           LIMIT 200`,
          [normalizedInstanceId],
        ),
        pool.query(
          `SELECT
             a.id,
             a.instance_id,
             a.instance_node_id,
             a.action_type,
             a.from_node_key,
             a.to_node_key,
             a.operator_user_id,
             COALESCE(NULLIF(u.real_name, ''), u.username, CONCAT('用户#', a.operator_user_id)) AS operator_name,
             a.target_user_id,
             COALESCE(NULLIF(tu.real_name, ''), tu.username, CONCAT('用户#', a.target_user_id)) AS target_user_name,
             a.comment,
             a.source_type,
             a.source_id,
             DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
           FROM wf_process_actions a
           LEFT JOIN users u ON u.id = a.operator_user_id
           LEFT JOIN users tu ON tu.id = a.target_user_id
           WHERE a.instance_id = ?
           ORDER BY a.id DESC
           LIMIT ?`,
          [normalizedInstanceId, Math.max(10, Number(includeActionsLimit || 50))],
        ),
      ])

      const nodes = nodeRows[0] || []
      const tasks = taskRows[0] || []
      const actions = actionRows[0] || []

      const doneCount = nodes.filter((node) => node.status === NODE_STATUS.DONE).length
      const totalCount = nodes.length
      const progressPercent = totalCount > 0 ? Number(((doneCount / totalCount) * 100).toFixed(1)) : 0
      const currentNode =
        nodes.find((node) => node.node_key === instance.current_node_key) ||
        nodes.find((node) => node.status === NODE_STATUS.IN_PROGRESS) ||
        null

      return {
        instance,
        summary: {
          total_nodes: totalCount,
          done_nodes: doneCount,
          progress_percent: progressPercent,
        },
        current_node: currentNode,
        nodes,
        tasks,
        actions,
      }
    } catch (err) {
      throw wrapWorkflowError(err)
    }
  },

  async listMyOpenTasks(userId, { limit = 30, accessProjectId = null } = {}) {
    const normalizedUserId = toPositiveInt(userId)
    const scopedProjectId = toPositiveInt(accessProjectId)
    if (!normalizedUserId) return []

    try {
      const [rows] = await pool.query(
        `SELECT
           t.id,
           t.instance_id,
           t.instance_node_id,
           t.task_title,
           t.status,
           t.priority,
           DATE_FORMAT(t.due_at, '%Y-%m-%d') AS due_at,
           DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           i.biz_id AS demand_id,
           d.name AS demand_name,
           n.node_key,
           n.node_name_snapshot AS node_name
         FROM wf_process_tasks t
         INNER JOIN wf_process_instances i ON i.id = t.instance_id
         LEFT JOIN wf_process_instance_nodes n ON n.id = t.instance_node_id
         LEFT JOIN work_demands d ON d.id = i.biz_id
         WHERE t.assignee_user_id = ?
           AND t.status IN (?, ?)
           AND i.biz_type = ?
           AND i.status IN (?, ?)
           ${
             scopedProjectId
               ? `AND EXISTS (
                    SELECT 1
                    FROM pm_user_business_lines ubl_scope
                    WHERE ubl_scope.user_id = d.owner_user_id
                      AND ubl_scope.project_id = ?
                  )`
               : ''
           }
         ORDER BY
           CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END ASC,
           t.due_at ASC,
           t.id DESC
         LIMIT ?`,
        [
          normalizedUserId,
          TASK_STATUS.TODO,
          TASK_STATUS.IN_PROGRESS,
          DEMAND_BIZ_TYPE,
          INSTANCE_STATUS.NOT_STARTED,
          INSTANCE_STATUS.IN_PROGRESS,
          ...(scopedProjectId ? [scopedProjectId] : []),
          Math.max(1, Number(limit || 30)),
        ],
      )

      return rows || []
    } catch (err) {
      throw wrapWorkflowError(err)
    }
  },

  async assignCurrentNode({
    demandId,
    assigneeUserId,
    operatorUserId,
    dueAt = null,
    expectedStartDate = null,
    comment = '',
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedAssigneeUserId = toPositiveInt(assigneeUserId)
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)
    const normalizedDueAt = normalizeDate(dueAt)
    const normalizedExpectedStartDate = normalizeDate(expectedStartDate)

    if (!normalizedDemandId) {
      const err = new Error('demand_id_required')
      err.code = 'DEMAND_ID_REQUIRED'
      throw err
    }

    if (!normalizedAssigneeUserId) {
      const err = new Error('assignee_user_id_invalid')
      err.code = 'ASSIGNEE_USER_ID_INVALID'
      throw err
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const instance = await findActiveDemandInstance(conn, normalizedDemandId, { forUpdate: true })
      if (!instance) {
        const err = new Error('workflow_instance_not_found')
        err.code = 'WORKFLOW_INSTANCE_NOT_FOUND'
        throw err
      }

      const currentNode = await findCurrentNodeForUpdate(conn, instance.id, instance.current_node_key)
      if (!currentNode) {
        const err = new Error('workflow_current_node_not_found')
        err.code = 'WORKFLOW_CURRENT_NODE_NOT_FOUND'
        throw err
      }

      const previousAssigneeUserId = toPositiveInt(currentNode.assignee_user_id)
      if (
        previousAssigneeUserId &&
        previousAssigneeUserId !== normalizedAssigneeUserId
      ) {
        await closeAutoWorkLogsForNodeAssignee(conn, {
          demandId: normalizedDemandId,
          phaseKey: currentNode.phase_key,
          assigneeUserId: previousAssigneeUserId,
        })
      }

      if (currentNode.status === NODE_STATUS.TODO) {
        await conn.query(
          `UPDATE wf_process_instance_nodes
           SET status = ?, started_at = COALESCE(started_at, NOW())
           WHERE id = ?`,
          [NODE_STATUS.IN_PROGRESS, currentNode.id],
        )
      }

      await conn.query(
        `UPDATE wf_process_instance_nodes
         SET assignee_user_id = ?, due_at = ?, updated_at = NOW()
         WHERE id = ?`,
        [normalizedAssigneeUserId, normalizedDueAt, currentNode.id],
      )

      await conn.query(
        `UPDATE wf_process_tasks
         SET status = ?, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
         WHERE instance_node_id = ?
           AND status IN (?, ?)`,
        [TASK_STATUS.CANCELLED, currentNode.id, TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
      )

      await createTaskForNode(conn, {
        instanceId: instance.id,
        instanceNodeId: currentNode.id,
        demandId: normalizedDemandId,
        phaseKey: currentNode.phase_key,
        nodeName: currentNode.node_name_snapshot,
        assigneeUserId: normalizedAssigneeUserId,
        dueAt: normalizedDueAt,
        expectedStartDate: normalizedExpectedStartDate,
        assignedByUserId: normalizedOperatorUserId,
        createdBy: normalizedOperatorUserId,
        sourceType: 'ASSIGN',
        sourceId: currentNode.id,
      })

      await insertAction(conn, {
        instanceId: instance.id,
        instanceNodeId: currentNode.id,
        actionType: 'ASSIGN',
        fromNodeKey: currentNode.node_key,
        toNodeKey: currentNode.node_key,
        operatorUserId: normalizedOperatorUserId,
        targetUserId: normalizedAssigneeUserId,
        comment: comment || '节点任务已指派',
      })

      await conn.commit()
      return this.getDemandWorkflowByInstanceId(instance.id)
    } catch (err) {
      await conn.rollback()
      throw wrapWorkflowError(err)
    } finally {
      conn.release()
    }
  },

  async assignNode({
    demandId,
    nodeKey,
    assigneeUserId,
    operatorUserId,
    dueAt = null,
    expectedStartDate = null,
    comment = '',
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedNodeKey = normalizeText(nodeKey, 64).toUpperCase()
    const normalizedAssigneeUserId = toPositiveInt(assigneeUserId)
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)
    const normalizedDueAt = normalizeDate(dueAt)
    const normalizedExpectedStartDate = normalizeDate(expectedStartDate)

    if (!normalizedDemandId) {
      const err = new Error('demand_id_required')
      err.code = 'DEMAND_ID_REQUIRED'
      throw err
    }
    if (!normalizedNodeKey) {
      const err = new Error('node_key_required')
      err.code = 'NODE_KEY_REQUIRED'
      throw err
    }
    if (!normalizedAssigneeUserId) {
      const err = new Error('assignee_user_id_invalid')
      err.code = 'ASSIGNEE_USER_ID_INVALID'
      throw err
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const instance = await findActiveDemandInstance(conn, normalizedDemandId, { forUpdate: true })
      if (!instance) {
        const err = new Error('workflow_instance_not_found')
        err.code = 'WORKFLOW_INSTANCE_NOT_FOUND'
        throw err
      }

      const currentNode = await findCurrentNodeForUpdate(conn, instance.id, instance.current_node_key)
      if (!currentNode) {
        const err = new Error('workflow_current_node_not_found')
        err.code = 'WORKFLOW_CURRENT_NODE_NOT_FOUND'
        throw err
      }

      const targetNode = await findNodeByKeyForUpdate(conn, instance.id, normalizedNodeKey)
      if (!targetNode) {
        const err = new Error('workflow_node_not_found')
        err.code = 'WORKFLOW_NODE_NOT_FOUND'
        throw err
      }
      if (targetNode.status === NODE_STATUS.DONE || targetNode.status === NODE_STATUS.CANCELLED) {
        const err = new Error('workflow_node_closed')
        err.code = 'WORKFLOW_NODE_CLOSED'
        throw err
      }

      const isCurrentNode = targetNode.node_key === currentNode.node_key
      const previousAssigneeUserId = toPositiveInt(targetNode.assignee_user_id)
      if (previousAssigneeUserId && previousAssigneeUserId !== normalizedAssigneeUserId) {
        await closeAutoWorkLogsForNodeAssignee(conn, {
          demandId: normalizedDemandId,
          phaseKey: targetNode.phase_key,
          assigneeUserId: previousAssigneeUserId,
        })
      }

      if (isCurrentNode && targetNode.status === NODE_STATUS.TODO) {
        await conn.query(
          `UPDATE wf_process_instance_nodes
           SET status = ?, started_at = COALESCE(started_at, NOW())
           WHERE id = ?`,
          [NODE_STATUS.IN_PROGRESS, targetNode.id],
        )
      }

      await conn.query(
        `UPDATE wf_process_instance_nodes
         SET assignee_user_id = ?, due_at = ?, updated_at = NOW()
         WHERE id = ?`,
        [normalizedAssigneeUserId, normalizedDueAt, targetNode.id],
      )

      if (isCurrentNode) {
        await conn.query(
          `UPDATE wf_process_tasks
           SET status = ?, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
           WHERE instance_node_id = ?
             AND status IN (?, ?)`,
          [TASK_STATUS.CANCELLED, targetNode.id, TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
        )

        await createTaskForNode(conn, {
          instanceId: instance.id,
          instanceNodeId: targetNode.id,
          demandId: normalizedDemandId,
          phaseKey: targetNode.phase_key,
          nodeName: targetNode.node_name_snapshot,
          assigneeUserId: normalizedAssigneeUserId,
          dueAt: normalizedDueAt,
          expectedStartDate: normalizedExpectedStartDate,
          assignedByUserId: normalizedOperatorUserId,
          createdBy: normalizedOperatorUserId,
          sourceType: 'ASSIGN',
          sourceId: targetNode.id,
        })
      } else {
        // For pre-assigned future nodes, also expose a TODO item in personal workbench.
        await ensureAutoWorkLogForTask(conn, {
          taskId: null,
          demandId: normalizedDemandId,
          phaseKey: targetNode.phase_key,
          nodeName: targetNode.node_name_snapshot,
          assigneeUserId: normalizedAssigneeUserId,
          dueAt: normalizedDueAt,
          expectedStartDate: normalizedExpectedStartDate,
          assignedByUserId: normalizedOperatorUserId,
        })
      }

      await insertAction(conn, {
        instanceId: instance.id,
        instanceNodeId: targetNode.id,
        actionType: isCurrentNode ? 'ASSIGN' : 'PREASSIGN',
        fromNodeKey: targetNode.node_key,
        toNodeKey: targetNode.node_key,
        operatorUserId: normalizedOperatorUserId,
        targetUserId: normalizedAssigneeUserId,
        comment: comment || (isCurrentNode ? '当前节点任务已指派' : '节点已预指派'),
      })

      await conn.commit()
      return this.getDemandWorkflowByInstanceId(instance.id)
    } catch (err) {
      await conn.rollback()
      throw wrapWorkflowError(err)
    } finally {
      conn.release()
    }
  },

  async submitCurrentNode({
    demandId,
    operatorUserId,
    comment = '',
    sourceType = 'MANUAL',
    sourceId = null,
    skipAssigneeCheck = false,
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)

    if (!normalizedDemandId) {
      const err = new Error('demand_id_required')
      err.code = 'DEMAND_ID_REQUIRED'
      throw err
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const instance = await findActiveDemandInstance(conn, normalizedDemandId, { forUpdate: true })
      if (!instance) {
        const err = new Error('workflow_instance_not_found')
        err.code = 'WORKFLOW_INSTANCE_NOT_FOUND'
        throw err
      }

      const currentNode = await findCurrentNodeForUpdate(conn, instance.id, instance.current_node_key)
      if (!currentNode) {
        const err = new Error('workflow_current_node_not_found')
        err.code = 'WORKFLOW_CURRENT_NODE_NOT_FOUND'
        throw err
      }

      if (!skipAssigneeCheck && toPositiveInt(currentNode.assignee_user_id)) {
        if (Number(currentNode.assignee_user_id) !== Number(normalizedOperatorUserId)) {
          const err = new Error('workflow_not_assignee')
          err.code = 'WORKFLOW_NOT_ASSIGNEE'
          throw err
        }
      }

      await conn.query(
        `UPDATE wf_process_tasks
         SET status = ?, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
         WHERE instance_node_id = ?
           AND status IN (?, ?)`,
        [TASK_STATUS.DONE, currentNode.id, TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
      )

      await conn.query(
        `UPDATE wf_process_instance_nodes
         SET status = ?, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
         WHERE id = ?`,
        [NODE_STATUS.DONE, currentNode.id],
      )

      await closeAutoWorkLogsForNodeAssignee(conn, {
        demandId: normalizedDemandId,
        phaseKey: currentNode.phase_key,
        assigneeUserId: currentNode.assignee_user_id,
      })

      const nextNode = await findNextNodeForUpdate(conn, instance.id, currentNode.sort_order)

      if (nextNode) {
        await conn.query(
          `UPDATE wf_process_instances
           SET current_node_key = ?, status = ?, updated_at = NOW()
           WHERE id = ?`,
          [nextNode.node_key, INSTANCE_STATUS.IN_PROGRESS, instance.id],
        )

        await conn.query(
          `UPDATE wf_process_instance_nodes
           SET status = ?, started_at = COALESCE(started_at, NOW()), updated_at = NOW()
           WHERE id = ?`,
          [NODE_STATUS.IN_PROGRESS, nextNode.id],
        )

        await ensureNextNodeTask(conn, nextNode, normalizedDemandId, normalizedOperatorUserId, 'AUTO_NEXT')

        await insertAction(conn, {
          instanceId: instance.id,
          instanceNodeId: currentNode.id,
          actionType: String(sourceType || 'MANUAL').toUpperCase() === 'WORK_LOG' ? 'AUTO_SUBMIT_BY_WORKLOG' : 'SUBMIT',
          fromNodeKey: currentNode.node_key,
          toNodeKey: nextNode.node_key,
          operatorUserId: normalizedOperatorUserId,
          comment: comment || '鑺傜偣宸叉彁浜わ紝杩涘叆涓嬩竴闃舵',
          sourceType: sourceType || null,
          sourceId: sourceId || null,
        })
      } else {
        await conn.query(
          `UPDATE wf_process_instances
           SET status = ?, ended_at = COALESCE(ended_at, NOW()), updated_at = NOW()
           WHERE id = ?`,
          [INSTANCE_STATUS.DONE, instance.id],
        )

        await conn.query(
          `UPDATE work_demands
           SET status = CASE WHEN status = 'CANCELLED' THEN status ELSE 'DONE' END,
               completed_at = CASE WHEN status = 'CANCELLED' THEN completed_at ELSE COALESCE(completed_at, NOW()) END
           WHERE id = ?`,
          [normalizedDemandId],
        )

        await insertAction(conn, {
          instanceId: instance.id,
          instanceNodeId: currentNode.id,
          actionType: String(sourceType || 'MANUAL').toUpperCase() === 'WORK_LOG' ? 'AUTO_COMPLETE_BY_WORKLOG' : 'COMPLETE',
          fromNodeKey: currentNode.node_key,
          toNodeKey: null,
          operatorUserId: normalizedOperatorUserId,
          comment: comment || '流程已完成',
          sourceType: sourceType || null,
          sourceId: sourceId || null,
        })
      }

      await conn.commit()
      return this.getDemandWorkflowByInstanceId(instance.id)
    } catch (err) {
      await conn.rollback()
      throw wrapWorkflowError(err)
    } finally {
      conn.release()
    }
  },

  async syncFromWorkLogStatusChange({
    logId,
    demandId,
    phaseKey,
    itemTypeKey,
    taskSource,
    operatorUserId,
    previousStatus,
    nextStatus,
  } = {}) {
    const normalizedNextStatus = normalizeStatus(nextStatus, '')
    const normalizedPrevStatus = normalizeStatus(previousStatus, '')
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedPhaseKey = normalizeText(phaseKey, 64).toUpperCase()
    const normalizedItemTypeKey = normalizeText(itemTypeKey, 64).toUpperCase()
    const normalizedTaskSource = normalizeText(taskSource, 32).toUpperCase() || 'SELF'
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)
    const normalizedLogId = toPositiveInt(logId)

    if (normalizedNextStatus !== TASK_STATUS.DONE) {
      return { triggered: false, reason: 'NEXT_STATUS_NOT_DONE' }
    }
    if (normalizedPrevStatus === TASK_STATUS.DONE) {
      return { triggered: false, reason: 'STATUS_ALREADY_DONE' }
    }
    if (!normalizedDemandId || !normalizedPhaseKey) {
      return { triggered: false, reason: 'DEMAND_OR_PHASE_MISSING' }
    }
    if (!normalizedItemTypeKey || !TRACK_ITEM_TYPE_KEYS.has(normalizedItemTypeKey)) {
      return { triggered: false, reason: 'ITEM_TYPE_NOT_TRACKED' }
    }
    if (normalizedTaskSource === 'OWNER_ASSIGN') {
      return { triggered: false, reason: 'OWNER_ASSIGN_SKIP_SYNC' }
    }
    if (!normalizedOperatorUserId) {
      return { triggered: false, reason: 'OPERATOR_INVALID' }
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const instance = await findActiveDemandInstance(conn, normalizedDemandId, { forUpdate: true })
      if (!instance) {
        await conn.commit()
        return { triggered: false, reason: 'INSTANCE_NOT_FOUND' }
      }

      const currentNode = await findCurrentNodeForUpdate(conn, instance.id, instance.current_node_key)
      if (!currentNode) {
        await conn.commit()
        return { triggered: false, reason: 'CURRENT_NODE_NOT_FOUND' }
      }

      if (normalizeText(currentNode.phase_key, 64).toUpperCase() !== normalizedPhaseKey) {
        await conn.commit()
        return { triggered: false, reason: 'PHASE_NOT_CURRENT_NODE' }
      }

      if (!toPositiveInt(currentNode.assignee_user_id)) {
        await conn.commit()
        return { triggered: false, reason: 'CURRENT_NODE_UNASSIGNED' }
      }

      if (Number(currentNode.assignee_user_id) !== Number(normalizedOperatorUserId)) {
        await conn.commit()
        return { triggered: false, reason: 'OPERATOR_NOT_ASSIGNEE' }
      }

      const [taskRows] = await conn.query(
        `SELECT
           t.id
         FROM wf_process_tasks t
         WHERE t.instance_node_id = ?
           AND t.assignee_user_id = ?
           AND t.status IN (?, ?)
         ORDER BY t.id DESC
         LIMIT 2
         FOR UPDATE`,
        [currentNode.id, normalizedOperatorUserId, TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
      )

      if ((taskRows || []).length !== 1) {
        await conn.commit()
        return { triggered: false, reason: 'TASK_NOT_UNIQUE' }
      }

      const targetTaskId = Number(taskRows[0].id)
      await conn.query(
        `UPDATE wf_process_tasks
         SET status = ?, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
         WHERE id = ?`,
        [TASK_STATUS.DONE, targetTaskId],
      )

      await insertAction(conn, {
        instanceId: instance.id,
        instanceNodeId: currentNode.id,
        actionType: 'AUTO_TASK_DONE_BY_WORKLOG',
        fromNodeKey: currentNode.node_key,
        toNodeKey: currentNode.node_key,
        operatorUserId: normalizedOperatorUserId,
        comment: '工作台事项置为已完成，自动完成当前待办',
        sourceType: 'WORK_LOG',
        sourceId: normalizedLogId || null,
      })

      const [[remainingRow]] = await conn.query(
        `SELECT COUNT(*) AS total
         FROM wf_process_tasks
         WHERE instance_node_id = ?
           AND status IN (?, ?)`,
        [currentNode.id, TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
      )

      if (Number(remainingRow?.total || 0) > 0) {
        await conn.commit()
        return {
          triggered: true,
          node_completed: false,
          instance_id: instance.id,
          reason: 'NODE_HAS_REMAINING_OPEN_TASKS',
        }
      }

      await conn.query(
        `UPDATE wf_process_instance_nodes
         SET status = ?, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
         WHERE id = ?`,
        [NODE_STATUS.DONE, currentNode.id],
      )

      await closeAutoWorkLogsForNodeAssignee(conn, {
        demandId: normalizedDemandId,
        phaseKey: currentNode.phase_key,
        assigneeUserId: currentNode.assignee_user_id,
      })

      const nextNode = await findNextNodeForUpdate(conn, instance.id, currentNode.sort_order)
      if (nextNode) {
        await conn.query(
          `UPDATE wf_process_instances
           SET current_node_key = ?, status = ?, updated_at = NOW()
           WHERE id = ?`,
          [nextNode.node_key, INSTANCE_STATUS.IN_PROGRESS, instance.id],
        )

        await conn.query(
          `UPDATE wf_process_instance_nodes
           SET status = ?, started_at = COALESCE(started_at, NOW()), updated_at = NOW()
           WHERE id = ?`,
          [NODE_STATUS.IN_PROGRESS, nextNode.id],
        )

        await ensureNextNodeTask(conn, nextNode, normalizedDemandId, normalizedOperatorUserId, 'AUTO_WORKLOG')

        await insertAction(conn, {
          instanceId: instance.id,
          instanceNodeId: currentNode.id,
          actionType: 'AUTO_SUBMIT_BY_WORKLOG',
          fromNodeKey: currentNode.node_key,
          toNodeKey: nextNode.node_key,
          operatorUserId: normalizedOperatorUserId,
          comment: '褰撳墠鑺傜偣宸茶嚜鍔ㄥ畬鎴愬苟鎺ㄨ繘鍒颁笅涓€鑺傜偣',
          sourceType: 'WORK_LOG',
          sourceId: normalizedLogId || null,
        })
      } else {
        await conn.query(
          `UPDATE wf_process_instances
           SET status = ?, ended_at = COALESCE(ended_at, NOW()), updated_at = NOW()
           WHERE id = ?`,
          [INSTANCE_STATUS.DONE, instance.id],
        )

        await conn.query(
          `UPDATE work_demands
           SET status = CASE WHEN status = 'CANCELLED' THEN status ELSE 'DONE' END,
               completed_at = CASE WHEN status = 'CANCELLED' THEN completed_at ELSE COALESCE(completed_at, NOW()) END
           WHERE id = ?`,
          [normalizedDemandId],
        )

        await insertAction(conn, {
          instanceId: instance.id,
          instanceNodeId: currentNode.id,
          actionType: 'AUTO_COMPLETE_BY_WORKLOG',
          fromNodeKey: currentNode.node_key,
          toNodeKey: null,
          operatorUserId: normalizedOperatorUserId,
          comment: '鏈€鍚庤妭鐐硅嚜鍔ㄥ畬鎴愶紝娴佺▼缁撴潫',
          sourceType: 'WORK_LOG',
          sourceId: normalizedLogId || null,
        })
      }

      await conn.commit()
      return {
        triggered: true,
        node_completed: true,
        instance_id: instance.id,
        advanced: Boolean(nextNode),
        next_node_key: nextNode?.node_key || null,
      }
    } catch (err) {
      await conn.rollback()
      throw wrapWorkflowError(err)
    } finally {
      conn.release()
    }
  },
}

module.exports = Workflow

