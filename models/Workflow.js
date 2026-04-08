const pool = require('../utils/db')
const {
  normalizeTemplateGraph,
  filterTemplateGraphByParticipantRoles,
  buildGraphMaps,
  isSystemNodeType,
  normalizeNodeKey: normalizeTemplateNodeKey,
  normalizeParticipantRoles,
} = require('../utils/projectTemplateWorkflowGraph')

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
const TRUE_LIKE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on'])

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizePositiveIntList(values) {
  if (!Array.isArray(values)) return []
  return Array.from(new Set(values.map((item) => toPositiveInt(item)).filter(Boolean)))
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

function normalizeDateTime(value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const text = String(value).trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(text)) return `${text}:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(text)) return text
  return undefined
}

function normalizeHours(value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return undefined
  return Number(num.toFixed(2))
}

function normalizeStatus(status, fallback = '') {
  const value = String(status || '').trim().toUpperCase()
  return value || fallback
}

function normalizeOwnerEstimateRequired(value, fallback = true) {
  if (value === undefined || value === null || value === '') return Boolean(fallback)
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (TRUE_LIKE_VALUES.has(normalized)) return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false
  return Boolean(fallback)
}

function normalizeNullableOwnerEstimateRequired(value) {
  if (value === undefined || value === null || value === '') return null
  return normalizeOwnerEstimateRequired(value, true) ? 1 : 0
}

function isMissingColumnError(err) {
  return err?.code === 'ER_BAD_FIELD_ERROR'
}

function parseJsonArray(raw, fallback = []) {
  if (Array.isArray(raw)) return raw
  if (!raw) return fallback
  if (typeof raw === 'object') return fallback
  if (typeof raw !== 'string') return fallback

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch (err) {
    return fallback
  }
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

async function ensureDefaultTemplate(conn, { createdBy = null, forceRebuild = false } = {}) {
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
  if (template && !forceRebuild) {
    const nodes = await loadTemplateNodes(conn, template.id)
    if (nodes.length > 0) return { template, nodes }
  }

  const phases = await listEnabledDemandPhases(conn)
  if (phases.length === 0) {
    const err = new Error('demand_phase_dict_empty')
    err.code = 'DEMAND_PHASE_DICT_EMPTY'
    throw err
  }

  if (!template || forceRebuild) {
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

function parseWorkflowGraphMeta(rawRemark) {
  if (!rawRemark || typeof rawRemark !== 'string') return null
  try {
    const parsed = JSON.parse(rawRemark)
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray(parsed.outgoing_keys) && !Array.isArray(parsed.incoming_keys)) return null
    return parsed
  } catch (err) {
    return null
  }
}

function buildWorkflowGraphFromInstanceRows(rows) {
  const list = Array.isArray(rows) ? rows : []
  const withMeta = list.map((row) => {
    const meta = parseWorkflowGraphMeta(row?.remark)
    return {
      node_key: normalizeTemplateNodeKey(row?.node_key),
      node_name: normalizeText(row?.node_name_snapshot, 128) || normalizeTemplateNodeKey(row?.node_key),
      node_type: normalizeText(meta?.node_type || row?.node_type, 64).toUpperCase() || 'TASK',
      phase_key: normalizeText(meta?.phase_key || row?.phase_key, 64) || null,
      sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
      branch_key: normalizeText(meta?.branch_key, 64) || null,
      parallel_group_key: normalizeText(meta?.parallel_group_key, 64) || null,
      join_rule: normalizeText(meta?.join_rule, 32).toUpperCase() || 'ALL',
      description: normalizeText(meta?.description, 1000) || '',
      owner_estimate_required: normalizeOwnerEstimateRequired(
        meta?.owner_estimate_required ?? meta?.ownerEstimateRequired ?? row?.owner_estimate_required,
        true,
      ),
      outgoing_keys: Array.isArray(meta?.outgoing_keys)
        ? meta.outgoing_keys.map((item) => normalizeTemplateNodeKey(item)).filter(Boolean)
        : [],
      incoming_keys: Array.isArray(meta?.incoming_keys)
        ? meta.incoming_keys.map((item) => normalizeTemplateNodeKey(item)).filter(Boolean)
        : [],
    }
  })

  const hasGraphMeta = withMeta.some(
    (item) =>
      item.outgoing_keys.length > 0 ||
      item.incoming_keys.length > 0 ||
      item.parallel_group_key ||
      isSystemNodeType(item.node_type),
  )

  const normalizedGraph = hasGraphMeta
    ? {
        schema_version: 2,
        entry_node_key:
          withMeta.find((item) => (item.incoming_keys || []).length === 0)?.node_key ||
          withMeta[0]?.node_key ||
          null,
        nodes: withMeta,
        edges: withMeta.flatMap((item) =>
          (item.outgoing_keys || []).map((targetNodeKey) => ({
            from: item.node_key,
            to: targetNodeKey,
          })),
        ),
      }
    : normalizeTemplateGraph(
        list.map((row) => ({
          node_key: row?.node_key,
          node_name: row?.node_name_snapshot,
          node_type: row?.node_type,
          phase_key: row?.phase_key,
          sort_order: row?.sort_order,
        })),
      )

  const graphMaps = buildGraphMaps(normalizedGraph)
  const nodes = (normalizedGraph.nodes || []).map((node) => ({
    ...node,
    outgoing_keys: graphMaps.outgoingMap.get(node.node_key) || [],
    incoming_keys: graphMaps.incomingMap.get(node.node_key) || [],
  }))

  return {
    ...normalizedGraph,
    nodes,
    nodeMap: new Map(nodes.map((item) => [item.node_key, item])),
    outgoingMap: graphMaps.outgoingMap,
    incomingMap: graphMaps.incomingMap,
  }
}

async function loadDemandProjectTemplateGraph(conn, demandId) {
  const [rows] = await conn.query(
    `SELECT
       d.template_id,
       d.participant_roles_json,
       pt.id AS project_template_id,
       pt.name AS project_template_name,
       pt.node_config
     FROM work_demands d
     LEFT JOIN project_templates pt ON pt.id = d.template_id
     WHERE d.id = ?
     LIMIT 1`,
    [demandId],
  )
  const row = rows[0] || null
  const templateId = toPositiveInt(row?.project_template_id)
  if (!templateId || !row?.node_config) return null

  const hasConfiguredParticipantRoles =
    row?.participant_roles_json !== null &&
    row?.participant_roles_json !== undefined &&
    String(row.participant_roles_json).trim() !== ''
  const normalizedParticipantRoles = hasConfiguredParticipantRoles
    ? normalizeParticipantRoles(parseJsonArray(row?.participant_roles_json))
    : null
  const normalizedGraph = hasConfiguredParticipantRoles
    ? filterTemplateGraphByParticipantRoles(row.node_config, normalizedParticipantRoles)
    : normalizeTemplateGraph(row.node_config)

  const graphMaps = buildGraphMaps(normalizedGraph)
  const nodes = (normalizedGraph.nodes || []).map((node) => ({
    ...node,
    outgoing_keys: graphMaps.outgoingMap.get(node.node_key) || [],
    incoming_keys: graphMaps.incomingMap.get(node.node_key) || [],
  }))

  return {
    source: 'PROJECT_TEMPLATE',
    template_id: templateId,
    template_name: normalizeText(row.project_template_name, 128) || `项目模板#${templateId}`,
    schema_version: Number(normalizedGraph.schema_version || 2) || 2,
    entry_node_key: normalizedGraph.entry_node_key || nodes[0]?.node_key || null,
    nodes,
    edges: normalizedGraph.edges || [],
    nodeMap: new Map(nodes.map((item) => [item.node_key, item])),
    outgoingMap: graphMaps.outgoingMap,
    incomingMap: graphMaps.incomingMap,
  }
}

function normalizeSelectableNode(row, fallbackOrder = 0) {
  const nodeKey = normalizeTemplateNodeKey(row?.node_key || row?.phase_key || '')
  if (!nodeKey) return null
  const nodeType = normalizeStatus(row?.node_type, 'TASK')
  if (isSystemNodeType(nodeType)) return null
  return {
    node_key: nodeKey,
    node_name:
      normalizeText(row?.node_name_snapshot || row?.node_name || row?.phase_name || row?.phase_key, 128) || nodeKey,
    node_type: nodeType,
    phase_key: normalizeText(row?.phase_key, 64).toUpperCase() || null,
    sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : fallbackOrder,
    status: normalizeStatus(row?.status, ''),
    owner_estimate_required: normalizeOwnerEstimateRequired(
      row?.owner_estimate_required ?? row?.ownerEstimateRequired,
      true,
    ),
  }
}

async function resolveDemandWorkflowTemplate(conn, demandId, { createdBy = null, forceRebuild = false } = {}) {
  const projectTemplateGraph = await loadDemandProjectTemplateGraph(conn, demandId)
  if (projectTemplateGraph) {
    return projectTemplateGraph
  }

  const { template, nodes } = await ensureDefaultTemplate(conn, {
    createdBy,
    forceRebuild,
  })
  const normalizedGraph = normalizeTemplateGraph(
    (nodes || []).map((item) => ({
      node_key: item?.node_key,
      node_name: item?.node_name,
      node_type: item?.node_type || 'TASK',
      phase_key: item?.phase_key,
      sort_order: item?.sort_order,
    })),
  )
  const graphMaps = buildGraphMaps(normalizedGraph)
  const graphNodes = (normalizedGraph.nodes || []).map((node) => ({
    ...node,
    outgoing_keys: graphMaps.outgoingMap.get(node.node_key) || [],
    incoming_keys: graphMaps.incomingMap.get(node.node_key) || [],
  }))

  return {
    source: 'WF_TEMPLATE',
    template_id: Number(template.id),
    template_name: normalizeText(template.template_name, 128) || DEFAULT_TEMPLATE_NAME,
    schema_version: 1,
    entry_node_key: normalizedGraph.entry_node_key || graphNodes[0]?.node_key || null,
    nodes: graphNodes,
    edges: normalizedGraph.edges || [],
    nodeMap: new Map(graphNodes.map((item) => [item.node_key, item])),
    outgoingMap: graphMaps.outgoingMap,
    incomingMap: graphMaps.incomingMap,
  }
}

function buildInstanceNodeRemark(graphNode) {
  return JSON.stringify({
    schema_version: 2,
    node_type: normalizeText(graphNode?.node_type, 64).toUpperCase() || 'TASK',
    phase_key: normalizeText(graphNode?.phase_key, 64) || null,
    branch_key: normalizeText(graphNode?.branch_key, 64) || null,
    parallel_group_key: normalizeText(graphNode?.parallel_group_key, 64) || null,
    join_rule: normalizeText(graphNode?.join_rule, 32).toUpperCase() || 'ALL',
    description: normalizeText(graphNode?.description, 1000) || '',
    participant_roles: normalizeParticipantRoles(graphNode?.participant_roles),
    owner_estimate_required: normalizeOwnerEstimateRequired(graphNode?.owner_estimate_required, true),
    outgoing_keys: Array.isArray(graphNode?.outgoing_keys) ? graphNode.outgoing_keys : [],
    incoming_keys: Array.isArray(graphNode?.incoming_keys) ? graphNode.incoming_keys : [],
  })
}

async function listInstanceNodesForUpdate(conn, instanceId) {
  const [rows] = await conn.query(
    `SELECT
       id,
       instance_id,
       node_key,
       node_name_snapshot,
       node_type,
       phase_key,
       sort_order,
       status,
       assignee_user_id,
       DATE_FORMAT(due_at, '%Y-%m-%d') AS due_at,
       remark
     FROM wf_process_instance_nodes
     WHERE instance_id = ?
     ORDER BY sort_order ASC, id ASC
     FOR UPDATE`,
    [instanceId],
  )
  return rows || []
}

function getPrimaryActiveNodeRow(rows) {
  return [...(rows || [])]
    .filter((item) => item.status === NODE_STATUS.IN_PROGRESS)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))[0] || null
}

async function refreshInstanceProgressState(conn, instance, demandId, instanceRows) {
  const rows = Array.isArray(instanceRows) ? instanceRows : []
  const activeRows = rows
    .filter((item) => item.status === NODE_STATUS.IN_PROGRESS)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))

  if (activeRows.length > 0) {
    await conn.query(
      `UPDATE wf_process_instances
       SET current_node_key = ?, status = ?, ended_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [activeRows[0].node_key, INSTANCE_STATUS.IN_PROGRESS, instance.id],
    )
    await conn.query(
      `UPDATE work_demands
       SET status = CASE WHEN status = 'CANCELLED' THEN status ELSE 'IN_PROGRESS' END,
           completed_at = CASE WHEN status = 'CANCELLED' THEN completed_at ELSE NULL END
       WHERE id = ?`,
      [demandId],
    )
    return {
      status: INSTANCE_STATUS.IN_PROGRESS,
      currentNodeKey: activeRows[0].node_key,
      activeCount: activeRows.length,
    }
  }

  const unfinishedRows = rows.filter(
    (item) => item.status !== NODE_STATUS.DONE && item.status !== NODE_STATUS.CANCELLED,
  )

  if (unfinishedRows.length > 0) {
    await conn.query(
      `UPDATE wf_process_instances
       SET current_node_key = NULL, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [INSTANCE_STATUS.IN_PROGRESS, instance.id],
    )
    await conn.query(
      `UPDATE work_demands
       SET status = CASE WHEN status = 'CANCELLED' THEN status ELSE 'IN_PROGRESS' END,
           completed_at = CASE WHEN status = 'CANCELLED' THEN completed_at ELSE NULL END
       WHERE id = ?`,
      [demandId],
    )
    return {
      status: INSTANCE_STATUS.IN_PROGRESS,
      currentNodeKey: null,
      activeCount: 0,
    }
  }

  await conn.query(
    `UPDATE wf_process_instances
     SET current_node_key = NULL, status = ?, ended_at = COALESCE(ended_at, NOW()), updated_at = NOW()
     WHERE id = ?`,
    [INSTANCE_STATUS.DONE, instance.id],
  )

  await conn.query(
    `UPDATE work_demands
     SET status = CASE WHEN status = 'CANCELLED' THEN status ELSE 'DONE' END,
         completed_at = CASE WHEN status = 'CANCELLED' THEN completed_at ELSE COALESCE(completed_at, NOW()) END
     WHERE id = ?`,
    [demandId],
  )

  return {
    status: INSTANCE_STATUS.DONE,
    currentNodeKey: null,
    activeCount: 0,
  }
}

async function activateGraphNode(conn, {
  instance,
  instanceRows,
  graph,
  nodeKey,
  demandId,
  operatorUserId = null,
  taskSource = 'AUTO_NEXT',
  visited = new Set(),
}) {
  const normalizedNodeKey = normalizeTemplateNodeKey(nodeKey)
  if (!normalizedNodeKey || visited.has(normalizedNodeKey)) return []
  visited.add(normalizedNodeKey)

  const graphNode = graph.nodeMap.get(normalizedNodeKey)
  const instanceNode = (instanceRows || []).find((item) => item.node_key === normalizedNodeKey)
  if (!graphNode || !instanceNode) return []

  const incomingKeys = graph.incomingMap.get(normalizedNodeKey) || []
  const ready = incomingKeys.every((incomingKey) => {
    const incomingNode = (instanceRows || []).find((item) => item.node_key === incomingKey)
    return incomingNode && incomingNode.status === NODE_STATUS.DONE
  })

  if (!ready) return []

  if (isSystemNodeType(graphNode.node_type)) {
    if (instanceNode.status !== NODE_STATUS.DONE) {
      await conn.query(
        `UPDATE wf_process_instance_nodes
         SET status = ?, started_at = COALESCE(started_at, NOW()), completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
         WHERE id = ?`,
        [NODE_STATUS.DONE, instanceNode.id],
      )
      instanceNode.status = NODE_STATUS.DONE
    }

    const activated = []
    for (const nextNodeKey of graph.outgoingMap.get(normalizedNodeKey) || []) {
      activated.push(
        ...(await activateGraphNode(conn, {
          instance,
          instanceRows,
          graph,
          nodeKey: nextNodeKey,
          demandId,
          operatorUserId,
          taskSource,
          visited,
        })),
      )
    }
    return activated
  }

  if (instanceNode.status === NODE_STATUS.DONE || instanceNode.status === NODE_STATUS.CANCELLED) {
    return []
  }

  if (instanceNode.status !== NODE_STATUS.IN_PROGRESS) {
    await conn.query(
      `UPDATE wf_process_instance_nodes
       SET status = ?, started_at = COALESCE(started_at, NOW()), completed_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [NODE_STATUS.IN_PROGRESS, instanceNode.id],
    )
    instanceNode.status = NODE_STATUS.IN_PROGRESS
  }

  await ensureNextNodeTask(conn, instanceNode, demandId, operatorUserId, taskSource)
  return [normalizedNodeKey]
}

async function advanceWorkflowFromNode(conn, {
  instance,
  instanceRows,
  graph,
  sourceNodeKey,
  demandId,
  operatorUserId = null,
  taskSource = 'AUTO_NEXT',
}) {
  const activated = []
  for (const nextNodeKey of graph.outgoingMap.get(sourceNodeKey) || []) {
    activated.push(
      ...(await activateGraphNode(conn, {
        instance,
        instanceRows,
        graph,
        nodeKey: nextNodeKey,
        demandId,
        operatorUserId,
        taskSource,
      })),
    )
  }
  return activated
}

function findPreviousExecutableNodeKey(graph, nodeKey) {
  const normalizedNodeKey = normalizeTemplateNodeKey(nodeKey)
  if (!normalizedNodeKey || !graph?.incomingMap) return null

  const queue = [...(graph.incomingMap.get(normalizedNodeKey) || [])]
  const visited = new Set()
  while (queue.length > 0) {
    const currentKey = queue.shift()
    if (!currentKey || visited.has(currentKey)) continue
    visited.add(currentKey)
    const currentNode = graph.nodeMap.get(currentKey)
    if (!currentNode) continue
    if (!isSystemNodeType(currentNode.node_type)) return currentKey
    queue.push(...(graph.incomingMap.get(currentKey) || []))
  }
  return null
}

async function submitNodeByGraph(conn, {
  instance,
  demandId,
  nodeKey,
  operatorUserId,
  comment = '',
  sourceType = 'MANUAL',
  sourceId = null,
  skipAssigneeCheck = false,
}) {
  const instanceRows = await listInstanceNodesForUpdate(conn, instance.id)
  const graph = buildWorkflowGraphFromInstanceRows(instanceRows)
  const normalizedNodeKey =
    normalizeTemplateNodeKey(nodeKey) ||
    normalizeTemplateNodeKey(instance.current_node_key) ||
    getPrimaryActiveNodeRow(instanceRows)?.node_key ||
    null

  if (!normalizedNodeKey) {
    const err = new Error('workflow_current_node_not_found')
    err.code = 'WORKFLOW_CURRENT_NODE_NOT_FOUND'
    throw err
  }

  const currentNode = instanceRows.find((item) => item.node_key === normalizedNodeKey)
  if (!currentNode) {
    const err = new Error('workflow_node_not_found')
    err.code = 'WORKFLOW_NODE_NOT_FOUND'
    throw err
  }
  if (currentNode.status !== NODE_STATUS.IN_PROGRESS && currentNode.status !== NODE_STATUS.TODO) {
    const err = new Error('workflow_node_closed')
    err.code = 'WORKFLOW_NODE_CLOSED'
    throw err
  }

  if (!skipAssigneeCheck && toPositiveInt(currentNode.assignee_user_id)) {
    if (Number(currentNode.assignee_user_id) !== Number(operatorUserId)) {
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
  currentNode.status = NODE_STATUS.DONE

  await closeAutoWorkLogsForNodeAssignee(conn, {
    demandId,
    phaseKey: currentNode.phase_key,
    assigneeUserId: currentNode.assignee_user_id,
  })

  const activatedNodeKeys = await advanceWorkflowFromNode(conn, {
    instance,
    instanceRows,
    graph,
    sourceNodeKey: currentNode.node_key,
    demandId,
    operatorUserId,
    taskSource:
      String(sourceType || '').toUpperCase() === 'WORK_LOG'
        ? 'AUTO_WORKLOG'
        : String(sourceType || '').toUpperCase() === 'FORCE'
          ? 'FORCE'
          : 'AUTO_NEXT',
  })

  const progressState = await refreshInstanceProgressState(conn, instance, demandId, instanceRows)
  const normalizedSourceType = String(sourceType || 'MANUAL').toUpperCase()

  await insertAction(conn, {
    instanceId: instance.id,
    instanceNodeId: currentNode.id,
    actionType:
      progressState.status === INSTANCE_STATUS.DONE
        ? normalizedSourceType === 'WORK_LOG'
          ? 'AUTO_COMPLETE_BY_WORKLOG'
          : normalizedSourceType === 'FORCE'
            ? 'FORCE_COMPLETE'
            : 'COMPLETE'
        : normalizedSourceType === 'WORK_LOG'
          ? 'AUTO_SUBMIT_BY_WORKLOG'
          : normalizedSourceType === 'FORCE'
            ? 'FORCE_SUBMIT'
            : 'SUBMIT',
    fromNodeKey: currentNode.node_key,
    toNodeKey: progressState.currentNodeKey || activatedNodeKeys[0] || null,
    operatorUserId,
    comment:
      normalizeText(comment, 500) ||
      (progressState.status === INSTANCE_STATUS.DONE ? '流程已完成' : '当前节点已提交'),
    sourceType: sourceType || null,
    sourceId: sourceId || null,
  })
}

async function rejectNodeByGraph(conn, {
  instance,
  demandId,
  nodeKey,
  operatorUserId,
  rejectReason,
  comment = '',
}) {
  const instanceRows = await listInstanceNodesForUpdate(conn, instance.id)
  const graph = buildWorkflowGraphFromInstanceRows(instanceRows)
  const normalizedNodeKey =
    normalizeTemplateNodeKey(nodeKey) ||
    normalizeTemplateNodeKey(instance.current_node_key) ||
    getPrimaryActiveNodeRow(instanceRows)?.node_key ||
    null

  if (!normalizedNodeKey) {
    const err = new Error('workflow_current_node_not_found')
    err.code = 'WORKFLOW_CURRENT_NODE_NOT_FOUND'
    throw err
  }

  const currentNode = instanceRows.find((item) => item.node_key === normalizedNodeKey)
  if (!currentNode) {
    const err = new Error('workflow_node_not_found')
    err.code = 'WORKFLOW_NODE_NOT_FOUND'
    throw err
  }

  const previousNodeKey = findPreviousExecutableNodeKey(graph, currentNode.node_key)
  if (!previousNodeKey) {
    const err = new Error('workflow_previous_node_not_found')
    err.code = 'WORKFLOW_PREVIOUS_NODE_NOT_FOUND'
    throw err
  }

  const previousNode = instanceRows.find((item) => item.node_key === previousNodeKey)
  if (!previousNode) {
    const err = new Error('workflow_previous_node_not_found')
    err.code = 'WORKFLOW_PREVIOUS_NODE_NOT_FOUND'
    throw err
  }

  const currentGraphNode = graph.nodeMap.get(currentNode.node_key)
  const previousGraphNode = graph.nodeMap.get(previousNode.node_key)
  const shouldResetParallelGroup =
    currentGraphNode?.parallel_group_key &&
    currentGraphNode.parallel_group_key !== previousGraphNode?.parallel_group_key

  await conn.query(
    `UPDATE wf_process_tasks
     SET status = ?, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
     WHERE instance_node_id = ?
       AND status IN (?, ?)`,
    [TASK_STATUS.CANCELLED, currentNode.id, TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
  )

  await closeAutoWorkLogsForNodeAssignee(conn, {
    demandId,
    phaseKey: currentNode.phase_key,
    assigneeUserId: currentNode.assignee_user_id,
  })

  if (shouldResetParallelGroup) {
    const sameGroupRows = instanceRows.filter(
      (item) => graph.nodeMap.get(item.node_key)?.parallel_group_key === currentGraphNode.parallel_group_key,
    )

    for (const row of sameGroupRows) {
      await conn.query(
        `UPDATE wf_process_tasks
         SET status = ?, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
         WHERE instance_node_id = ?
           AND status IN (?, ?)`,
        [TASK_STATUS.CANCELLED, row.id, TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
      )

      await closeAutoWorkLogsForNodeAssignee(conn, {
        demandId,
        phaseKey: row.phase_key,
        assigneeUserId: row.assignee_user_id,
      })

      await conn.query(
        `UPDATE wf_process_instance_nodes
         SET status = ?, completed_at = NULL, started_at = NULL, reject_reason = NULL, updated_at = NOW()
         WHERE id = ?`,
        [row.id === currentNode.id ? NODE_STATUS.RETURNED : NODE_STATUS.TODO, row.id],
      )

      row.status = row.id === currentNode.id ? NODE_STATUS.RETURNED : NODE_STATUS.TODO
    }
  } else {
    await conn.query(
      `UPDATE wf_process_instance_nodes
       SET status = ?, reject_reason = ?, updated_at = NOW()
       WHERE id = ?`,
      [NODE_STATUS.RETURNED, rejectReason, currentNode.id],
    )
    currentNode.status = NODE_STATUS.RETURNED
  }

  await conn.query(
    `UPDATE wf_process_instance_nodes
     SET status = ?, completed_at = NULL, started_at = COALESCE(started_at, NOW()), updated_at = NOW()
     WHERE id = ?`,
    [NODE_STATUS.IN_PROGRESS, previousNode.id],
  )
  previousNode.status = NODE_STATUS.IN_PROGRESS

  await ensureNextNodeTask(conn, previousNode, demandId, operatorUserId, 'REJECT_RETURN')

  await conn.query(
    `INSERT INTO node_status_logs (
       node_id, from_status, to_status, operator_id, operation_type, remark
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      currentNode.id,
      currentNode.status || null,
      NODE_STATUS.RETURNED,
      operatorUserId,
      'NODE_REJECT',
      rejectReason,
    ],
  )

  await refreshInstanceProgressState(conn, instance, demandId, instanceRows)

  await insertAction(conn, {
    instanceId: instance.id,
    instanceNodeId: currentNode.id,
    actionType: 'REJECT',
    fromNodeKey: currentNode.node_key,
    toNodeKey: previousNode.node_key,
    operatorUserId,
    targetUserId: toPositiveInt(previousNode.assignee_user_id),
    comment: normalizeText(comment, 500) || rejectReason,
    sourceType: 'MANUAL',
  })
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
    ownerEstimateRequired = null,
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
    ownerEstimateRequired,
  })

  return taskId
}

async function syncActiveNodeTasksForAssignees(
  conn,
  {
    instanceId,
    instanceNodeId,
    demandId,
    phaseKey = null,
    nodeName,
    assigneeUserIds = [],
    dueAt = null,
    expectedStartDate = null,
    assignedByUserId = null,
    ownerEstimateRequired = null,
    createdBy = null,
    sourceType = 'ASSIGN',
    sourceId = null,
  } = {},
) {
  const normalizedNodeId = toPositiveInt(instanceNodeId)
  const normalizedAssigneeUserIds = normalizePositiveIntList(assigneeUserIds)
  if (!normalizedNodeId || normalizedAssigneeUserIds.length === 0) return

  const [openTaskRows] = await conn.query(
    `SELECT id, assignee_user_id
     FROM wf_process_tasks
     WHERE instance_node_id = ?
       AND status IN (?, ?)
     ORDER BY id DESC
     FOR UPDATE`,
    [normalizedNodeId, TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
  )

  const keepTaskIdByAssignee = new Map()
  const duplicateTaskIds = []

  ;(openTaskRows || []).forEach((row) => {
    const assigneeUserId = toPositiveInt(row?.assignee_user_id)
    const taskId = toPositiveInt(row?.id)
    if (!assigneeUserId || !taskId) return
    if (!keepTaskIdByAssignee.has(assigneeUserId)) {
      keepTaskIdByAssignee.set(assigneeUserId, taskId)
      return
    }
    duplicateTaskIds.push(taskId)
  })

  if (duplicateTaskIds.length > 0) {
    await conn.query(
      `UPDATE wf_process_tasks
       SET status = ?, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
       WHERE id IN (${duplicateTaskIds.map(() => '?').join(', ')})
         AND status IN (?, ?)`,
      [TASK_STATUS.CANCELLED, ...duplicateTaskIds, TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
    )
  }

  const desiredSet = new Set(normalizedAssigneeUserIds)
  const existingAssignees = Array.from(keepTaskIdByAssignee.keys())

  for (const existingUserId of existingAssignees) {
    if (desiredSet.has(existingUserId)) continue

    await conn.query(
      `UPDATE wf_process_tasks
       SET status = ?, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
       WHERE instance_node_id = ?
         AND assignee_user_id = ?
         AND status IN (?, ?)`,
      [TASK_STATUS.CANCELLED, normalizedNodeId, existingUserId, TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
    )

    await closeAutoWorkLogsForNodeAssignee(conn, {
      demandId,
      phaseKey,
      assigneeUserId: existingUserId,
    })
  }

  for (const assigneeUserId of normalizedAssigneeUserIds) {
    const existingTaskId = keepTaskIdByAssignee.get(assigneeUserId) || null
    if (existingTaskId) {
      await conn.query(
        `UPDATE wf_process_tasks
         SET due_at = ?, updated_at = NOW()
         WHERE id = ?`,
        [normalizeDate(dueAt), existingTaskId],
      )

      await ensureAutoWorkLogForTask(conn, {
        taskId: existingTaskId,
        demandId,
        phaseKey,
        nodeName,
        assigneeUserId,
        dueAt,
        expectedStartDate,
        assignedByUserId,
        ownerEstimateRequired,
      })
      continue
    }

    await createTaskForNode(conn, {
      instanceId,
      instanceNodeId: normalizedNodeId,
      demandId,
      phaseKey,
      nodeName,
      assigneeUserId,
      dueAt,
      expectedStartDate,
      assignedByUserId,
      ownerEstimateRequired,
      createdBy,
      sourceType,
      sourceId,
    })
  }
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

function parseTaskIdFromAutoWorkLogDescription(description) {
  const text = normalizeText(description, 2000)
  if (!text) return null
  const matched = text.match(/#(\d+)\s*$/)
  if (!matched || !matched[1]) return null
  return toPositiveInt(matched[1])
}

function resolveAutoWorkLogTaskId(log = {}) {
  const directTaskId = toPositiveInt(log?.relate_task_id)
  if (directTaskId) return directTaskId
  return parseTaskIdFromAutoWorkLogDescription(log?.description)
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
    ownerEstimateRequired = null,
  } = {},
) {
  const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
  const normalizedPhaseKey = normalizeText(phaseKey, 64).toUpperCase()
  const normalizedTaskId = toPositiveInt(taskId)
  const normalizedAssignee = toPositiveInt(assigneeUserId)
  const normalizedExpectedStartDate = normalizeDate(expectedStartDate)
  const normalizedAssignedByUserId = toPositiveInt(assignedByUserId)
  const normalizedOwnerEstimateRequired = normalizeNullableOwnerEstimateRequired(ownerEstimateRequired)
  if (!normalizedDemandId || !normalizedPhaseKey || !normalizedAssignee) return null

  const trackType = await resolveTrackItemType(conn)
  const itemTypeId = toPositiveInt(trackType?.item_type_id)
  if (!itemTypeId) return null

  let rows = []
  if (normalizedTaskId) {
    try {
      const [withTaskRows] = await conn.query(
        `SELECT
           id,
           DATE_FORMAT(expected_completion_date, '%Y-%m-%d') AS expected_completion_date
         FROM work_logs
         WHERE user_id = ?
           AND demand_id = ?
           AND phase_key = ?
           AND COALESCE(log_status, 'IN_PROGRESS') <> 'DONE'
           AND task_source = 'WORKFLOW_AUTO'
           AND relate_task_id = ?
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [normalizedAssignee, normalizedDemandId, normalizedPhaseKey, normalizedTaskId],
      )
      rows = withTaskRows || []
    } catch (err) {
      if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err
    }
  }

  if (!rows.length) {
    const [fallbackRows] = await conn.query(
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
    rows = fallbackRows || []
  }

  if ((rows || []).length > 0) {
    const existing = rows[0]
    if (normalizedTaskId) {
      try {
        await conn.query(
          `UPDATE work_logs
           SET
             item_type_id = ?,
             description = ?,
             task_source = 'WORKFLOW_AUTO',
             relate_task_id = ?,
             assigned_by_user_id = COALESCE(?, assigned_by_user_id),
             expected_start_date = COALESCE(?, expected_start_date, CURDATE()),
             expected_completion_date = COALESCE(?, expected_completion_date),
             updated_at = NOW()
           WHERE id = ?`,
          [
            itemTypeId,
            buildAutoWorkLogDescription({ taskId, demandId: normalizedDemandId, nodeName }),
            normalizedTaskId,
            normalizedAssignedByUserId,
            normalizedExpectedStartDate,
            dueAt,
            existing.id,
          ],
        )
        await tryUpdateWorkLogOwnerEstimateRequired(conn, existing.id, normalizedOwnerEstimateRequired)
        return Number(existing.id)
      } catch (err) {
        if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err
      }
    }

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
    await tryUpdateWorkLogOwnerEstimateRequired(conn, existing.id, normalizedOwnerEstimateRequired)
    return Number(existing.id)
  }

  if (normalizedTaskId) {
    try {
      const [insertWithTaskResult] = await conn.query(
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
           relate_task_id,
           assigned_by_user_id,
           expected_start_date,
           expected_completion_date,
           log_completed_at
         ) VALUES (?, CURDATE(), ?, ?, 1.0, 0.0, 1.0, 'TODO', 'WORKFLOW_AUTO', ?, ?, ?, ?, COALESCE(?, CURDATE()), ?, NULL)`,
        [
          normalizedAssignee,
          itemTypeId,
          buildAutoWorkLogDescription({ taskId, demandId: normalizedDemandId, nodeName }),
          normalizedDemandId,
          normalizedPhaseKey,
          normalizedTaskId,
          normalizedAssignedByUserId,
          normalizedExpectedStartDate,
          dueAt,
        ],
      )
      await tryUpdateWorkLogOwnerEstimateRequired(
        conn,
        insertWithTaskResult.insertId,
        normalizedOwnerEstimateRequired,
      )
      return Number(insertWithTaskResult.insertId)
    } catch (err) {
      if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err
    }
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
  await tryUpdateWorkLogOwnerEstimateRequired(conn, insertResult.insertId, normalizedOwnerEstimateRequired)

  return Number(insertResult.insertId)
}

async function tryUpdateWorkLogOwnerEstimateRequired(conn, logId, ownerEstimateRequired) {
  const normalizedLogId = toPositiveInt(logId)
  if (!normalizedLogId) return
  if (ownerEstimateRequired !== 0 && ownerEstimateRequired !== 1) return
  try {
    await conn.query(
      `UPDATE work_logs
       SET owner_estimate_required = ?
       WHERE id = ?`,
      [ownerEstimateRequired, normalizedLogId],
    )
  } catch (err) {
    if (isMissingColumnError(err)) return
    throw err
  }
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

async function closeAutoWorkLogsForTaskCollaborator(
  conn,
  { taskId, demandId, phaseKey, collaboratorUserId } = {},
) {
  const normalizedTaskId = toPositiveInt(taskId)
  const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
  const normalizedPhaseKey = normalizeText(phaseKey, 64).toUpperCase()
  const normalizedCollaboratorUserId = toPositiveInt(collaboratorUserId)

  if (!normalizedTaskId || !normalizedDemandId || !normalizedPhaseKey || !normalizedCollaboratorUserId) return 0

  try {
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
         AND task_source = 'WORKFLOW_AUTO'
         AND COALESCE(log_status, 'IN_PROGRESS') <> 'DONE'
         AND relate_task_id = ?`,
      [normalizedCollaboratorUserId, normalizedDemandId, normalizedPhaseKey, normalizedTaskId],
    )
    return Number(result?.affectedRows || 0)
  } catch (err) {
    if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err
  }

  const [fallbackResult] = await conn.query(
    `UPDATE work_logs
     SET
       log_status = 'DONE',
       remaining_hours = 0,
       log_completed_at = COALESCE(log_completed_at, NOW()),
       updated_at = NOW()
     WHERE user_id = ?
       AND demand_id = ?
       AND phase_key = ?
       AND task_source = 'WORKFLOW_AUTO'
       AND COALESCE(log_status, 'IN_PROGRESS') <> 'DONE'
       AND description LIKE ?`,
    [normalizedCollaboratorUserId, normalizedDemandId, normalizedPhaseKey, `%#${normalizedTaskId}`],
  )
  return Number(fallbackResult?.affectedRows || 0)
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

async function findPreviousNodeForUpdate(conn, instanceId, currentSortOrder) {
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
       AND n.sort_order < ?
     ORDER BY n.sort_order DESC, n.id DESC
     LIMIT 1
     FOR UPDATE`,
    [instanceId, Number(currentSortOrder || 0)],
  )
  return rows[0] || null
}

async function ensureNextNodeTask(conn, nextNode, demandId, operatorUserId, sourceType = 'WORKFLOW') {
  if (!nextNode || !toPositiveInt(nextNode.assignee_user_id)) return null
  const nextNodeMeta = parseWorkflowGraphMeta(nextNode?.remark)

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
    ownerEstimateRequired: normalizeOwnerEstimateRequired(
      nextNodeMeta?.owner_estimate_required ?? nextNodeMeta?.ownerEstimateRequired,
      true,
    ),
    createdBy: operatorUserId,
    sourceType,
  })
}

function normalizeNodeMatchName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 128)
}

async function createWorkflowInstanceSkeleton(
  conn,
  {
    demandId,
    operatorUserId = null,
    forceRebuildTemplateFromDict = false,
  } = {},
) {
  const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
  const normalizedOperatorUserId = toPositiveInt(operatorUserId)
  const runtimeTemplate = await resolveDemandWorkflowTemplate(conn, normalizedDemandId, {
    createdBy: normalizedOperatorUserId,
    forceRebuild: Boolean(forceRebuildTemplateFromDict),
  })

  if (!Array.isArray(runtimeTemplate?.nodes) || runtimeTemplate.nodes.length === 0) {
    const err = new Error('workflow_template_has_no_nodes')
    err.code = 'WORKFLOW_TEMPLATE_HAS_NO_NODES'
    throw err
  }

  const entryNode = runtimeTemplate.nodeMap.get(runtimeTemplate.entry_node_key) || runtimeTemplate.nodes[0]
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
      runtimeTemplate.template_id,
      runtimeTemplate.source === 'PROJECT_TEMPLATE' ? 0 : Number(runtimeTemplate.schema_version || 1),
      INSTANCE_STATUS.IN_PROGRESS,
      entryNode?.node_key || null,
      normalizedOperatorUserId,
    ],
  )
  const instanceId = Number(instanceResult.insertId)

  let firstInstanceNodeId = null
  const instanceRows = []
  for (let i = 0; i < runtimeTemplate.nodes.length; i += 1) {
    const node = runtimeTemplate.nodes[i]

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
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
      [
        instanceId,
        node.node_key,
        node.node_name,
        node.node_type || 'TASK',
        node.phase_key || null,
        Number(node.sort_order || (i + 1) * 10),
        NODE_STATUS.TODO,
        null,
        null,
        buildInstanceNodeRemark(node),
      ],
    )

    const insertedNodeId = Number(result.insertId)
    if (i === 0) firstInstanceNodeId = insertedNodeId
    instanceRows.push({
      id: insertedNodeId,
      instance_id: instanceId,
      node_key: node.node_key,
      node_name_snapshot: node.node_name,
      node_type: node.node_type || 'TASK',
      phase_key: node.phase_key || null,
      sort_order: Number(node.sort_order || (i + 1) * 10),
      status: NODE_STATUS.TODO,
      assignee_user_id: null,
      due_at: null,
      remark: buildInstanceNodeRemark(node),
    })
  }

  return {
    instance: {
      id: instanceId,
      biz_id: normalizedDemandId,
      current_node_key: entryNode?.node_key || null,
    },
    instanceId,
    runtimeTemplate,
    entryNode,
    firstInstanceNodeId,
    instanceRows,
  }
}

async function listInstanceNodesForReplace(conn, instanceId) {
  const [rows] = await conn.query(
    `SELECT
       id,
       instance_id,
       node_key,
       node_name_snapshot,
       node_type,
       phase_key,
       sort_order,
       status,
       assignee_user_id,
       owner_estimated_hours,
       personal_estimated_hours,
       actual_hours,
       DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
       DATE_FORMAT(completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
       DATE_FORMAT(due_at, '%Y-%m-%d') AS due_at,
       DATE_FORMAT(planned_start_time, '%Y-%m-%d %H:%i:%s') AS planned_start_time,
       DATE_FORMAT(planned_end_time, '%Y-%m-%d %H:%i:%s') AS planned_end_time,
       DATE_FORMAT(actual_start_time, '%Y-%m-%d %H:%i:%s') AS actual_start_time,
       DATE_FORMAT(actual_end_time, '%Y-%m-%d %H:%i:%s') AS actual_end_time,
       reject_reason
     FROM wf_process_instance_nodes
     WHERE instance_id = ?
     ORDER BY sort_order ASC, id ASC
     FOR UPDATE`,
    [instanceId],
  )
  return rows || []
}

function findReplacementTargetNode(sourceNode, targetRows, usedNodeKeys = new Set()) {
  const candidates = (Array.isArray(targetRows) ? targetRows : []).filter(
    (item) => item?.node_key && !usedNodeKeys.has(item.node_key) && !isSystemNodeType(item.node_type),
  )
  if (candidates.length === 0) return null

  const sourceNodeKey = normalizeTemplateNodeKey(sourceNode?.node_key)
  if (sourceNodeKey) {
    const exactMatch = candidates.find((item) => normalizeTemplateNodeKey(item?.node_key) === sourceNodeKey)
    if (exactMatch) {
      return { target: exactMatch, matchType: 'NODE_KEY' }
    }
  }

  const sourcePhaseKey = normalizeText(sourceNode?.phase_key, 64).toUpperCase()
  const sourceNodeName = normalizeNodeMatchName(sourceNode?.node_name_snapshot)

  if (sourcePhaseKey && sourceNodeName) {
    const phaseAndNameMatches = candidates.filter(
      (item) =>
        normalizeText(item?.phase_key, 64).toUpperCase() === sourcePhaseKey &&
        normalizeNodeMatchName(item?.node_name_snapshot) === sourceNodeName,
    )
    if (phaseAndNameMatches.length === 1) {
      return { target: phaseAndNameMatches[0], matchType: 'PHASE_AND_NAME' }
    }
  }

  if (sourceNodeName) {
    const nameOnlyMatches = candidates.filter(
      (item) => normalizeNodeMatchName(item?.node_name_snapshot) === sourceNodeName,
    )
    if (nameOnlyMatches.length === 1) {
      return { target: nameOnlyMatches[0], matchType: 'NAME_ONLY' }
    }
  }

  return null
}

function canReplayHistoricalDoneNode(nodeKey, graph, completedNodeKeys, visiting = new Set()) {
  const normalizedNodeKey = normalizeTemplateNodeKey(nodeKey)
  if (!normalizedNodeKey || !graph?.incomingMap) return false
  if (visiting.has(normalizedNodeKey)) return false

  const incomingKeys = graph.incomingMap.get(normalizedNodeKey) || []
  if (incomingKeys.length === 0) return true

  visiting.add(normalizedNodeKey)
  const ready = incomingKeys.every((incomingKey) => {
    const incomingNode = graph.nodeMap.get(incomingKey)
    if (!incomingNode) return true
    if (isSystemNodeType(incomingNode.node_type)) {
      return canReplayHistoricalDoneNode(incomingKey, graph, completedNodeKeys, visiting)
    }
    return completedNodeKeys.has(incomingKey)
  })
  visiting.delete(normalizedNodeKey)
  return ready
}

async function applyHistoricalDoneNodeState(conn, targetNode, sourceNode) {
  const normalizedAssigneeUserId = toPositiveInt(sourceNode?.assignee_user_id)
  const startedAt = normalizeDateTime(sourceNode?.started_at) || normalizeDateTime(sourceNode?.actual_start_time) || null
  const completedAt = normalizeDateTime(sourceNode?.completed_at) || normalizeDateTime(sourceNode?.actual_end_time) || startedAt || null
  const dueAt = normalizeDate(sourceNode?.due_at)
  const plannedStartTime = normalizeDateTime(sourceNode?.planned_start_time)
  const plannedEndTime = normalizeDateTime(sourceNode?.planned_end_time)
  const actualStartTime = normalizeDateTime(sourceNode?.actual_start_time)
  const actualEndTime = normalizeDateTime(sourceNode?.actual_end_time)
  const ownerEstimatedHours = normalizeHours(sourceNode?.owner_estimated_hours)
  const personalEstimatedHours = normalizeHours(sourceNode?.personal_estimated_hours)
  const actualHours = normalizeHours(sourceNode?.actual_hours)
  const rejectReason = normalizeText(sourceNode?.reject_reason, 2000) || null

  await conn.query(
    `UPDATE wf_process_instance_nodes
     SET status = ?,
         assignee_user_id = ?,
         started_at = ?,
         completed_at = ?,
         due_at = ?,
         owner_estimated_hours = ?,
         personal_estimated_hours = ?,
         actual_hours = ?,
         planned_start_time = ?,
         planned_end_time = ?,
         actual_start_time = ?,
         actual_end_time = ?,
         reject_reason = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [
      NODE_STATUS.DONE,
      normalizedAssigneeUserId,
      startedAt,
      completedAt || startedAt || null,
      dueAt,
      ownerEstimatedHours,
      personalEstimatedHours,
      actualHours,
      plannedStartTime,
      plannedEndTime,
      actualStartTime,
      actualEndTime,
      rejectReason,
      targetNode.id,
    ],
  )

  targetNode.status = NODE_STATUS.DONE
  targetNode.assignee_user_id = normalizedAssigneeUserId
  targetNode.due_at = dueAt
}

async function activateReadyWorkflowNodes(conn, { instance, instanceRows, graph, demandId, operatorUserId = null, taskSource = 'AUTO_NEXT' }) {
  const orderedNodes = [...(graph?.nodes || [])].sort(
    (a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0),
  )
  for (const node of orderedNodes) {
    await activateGraphNode(conn, {
      instance,
      instanceRows,
      graph,
      nodeKey: node.node_key,
      demandId,
      operatorUserId,
      taskSource,
    })
  }
}

const Workflow = {
  TRACK_ITEM_TYPE_KEYS,
  INSTANCE_STATUS,
  NODE_STATUS,
  TASK_STATUS,

  async initDemandWorkflow({
    demandId,
    ownerUserId = null,
    operatorUserId = null,
    autoAssignCurrentNode = false,
    forceRebuildTemplateFromDict = false,
  } = {}) {
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
      const shouldAutoAssignCurrentNode = Boolean(autoAssignCurrentNode) && Boolean(normalizedOwnerUserId)
      const {
        instance,
        instanceId,
        runtimeTemplate,
        entryNode,
        firstInstanceNodeId,
        instanceRows,
      } = await createWorkflowInstanceSkeleton(conn, {
        demandId: normalizedDemandId,
        operatorUserId: normalizedOperatorUserId,
        forceRebuildTemplateFromDict,
      })

      await activateGraphNode(conn, {
        instance,
        instanceRows,
        graph: runtimeTemplate,
        nodeKey: entryNode?.node_key,
        demandId: normalizedDemandId,
        operatorUserId: normalizedOperatorUserId,
        taskSource: 'SYSTEM_INIT',
      })

      const currentActiveRows = instanceRows.filter((item) => item.status === NODE_STATUS.IN_PROGRESS)
      if (shouldAutoAssignCurrentNode && currentActiveRows.length > 0) {
        for (const activeRow of currentActiveRows) {
          await conn.query(
            `UPDATE wf_process_instance_nodes
             SET assignee_user_id = ?, updated_at = NOW()
             WHERE id = ?`,
            [normalizedOwnerUserId, activeRow.id],
          )
          activeRow.assignee_user_id = normalizedOwnerUserId

          await createTaskForNode(conn, {
            instanceId,
            instanceNodeId: activeRow.id,
            demandId: normalizedDemandId,
            phaseKey: activeRow.phase_key,
            nodeName: activeRow.node_name_snapshot,
            assigneeUserId: normalizedOwnerUserId,
            ownerEstimateRequired: normalizeOwnerEstimateRequired(
              parseWorkflowGraphMeta(activeRow?.remark)?.owner_estimate_required,
              true,
            ),
            createdBy: normalizedOperatorUserId,
            sourceType: 'SYSTEM_INIT',
            sourceId: activeRow.id,
          })

          await insertAction(conn, {
            instanceId,
            instanceNodeId: activeRow.id,
            actionType: 'ASSIGN',
            fromNodeKey: activeRow.node_key,
            toNodeKey: activeRow.node_key,
            operatorUserId: normalizedOperatorUserId,
            targetUserId: normalizedOwnerUserId,
            comment: '初始化自动指派给需求负责人',
          })
        }
      }

      const progressState = await refreshInstanceProgressState(
        conn,
        instance,
        normalizedDemandId,
        instanceRows,
      )

      await insertAction(conn, {
        instanceId,
        instanceNodeId: firstInstanceNodeId,
        actionType: 'PROCESS_INIT',
        fromNodeKey: null,
        toNodeKey: progressState.currentNodeKey || entryNode?.node_key || null,
        operatorUserId: normalizedOperatorUserId,
        comment: '需求流程实例已创建',
      })

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

  async listDemandSelectableNodes(demandId) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    if (!normalizedDemandId) return []

    try {
      const workflow = await this.getDemandWorkflowByDemandId(normalizedDemandId, { includeActionsLimit: 0 })
      const workflowNodes = (Array.isArray(workflow?.nodes) ? workflow.nodes : [])
        .map((row, index) => normalizeSelectableNode(row, index + 1))
        .filter(Boolean)
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))

      if (workflowNodes.length > 0) {
        return workflowNodes
      }
    } catch (err) {
      if (!isWorkflowTableMissingError(err)) throw err
    }

    const conn = await pool.getConnection()
    try {
      const templateGraph = await loadDemandProjectTemplateGraph(conn, normalizedDemandId)
      const templateNodes = (Array.isArray(templateGraph?.nodes) ? templateGraph.nodes : [])
        .map((row, index) => normalizeSelectableNode(row, index + 1))
        .filter(Boolean)
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      return templateNodes
    } finally {
      conn.release()
    }
  },

  async findDemandSelectableNodeByKey(demandId, nodeKey) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedNodeKey = normalizeTemplateNodeKey(nodeKey)
    if (!normalizedDemandId || !normalizedNodeKey) return null
    const nodes = await this.listDemandSelectableNodes(normalizedDemandId)
    return (
      nodes.find((item) => normalizeTemplateNodeKey(item?.node_key) === normalizedNodeKey) || null
    )
  },

  async replaceDemandWorkflowWithLatestTemplate({
    demandId,
    operatorUserId = null,
    autoAssignCurrentNode = false,
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)
    if (!normalizedDemandId) {
      const err = new Error('demand_id_required')
      err.code = 'DEMAND_ID_REQUIRED'
      throw err
    }

    const conn = await pool.getConnection()
    let replacedInstanceId = null
    try {
      await conn.beginTransaction()

      const existing = await findActiveDemandInstance(conn, normalizedDemandId, { forUpdate: true })
      if (!existing) {
        const err = new Error('workflow_instance_not_found')
        err.code = 'WORKFLOW_INSTANCE_NOT_FOUND'
        throw err
      }
      replacedInstanceId = Number(existing.id)

      const oldNodeRows = await listInstanceNodesForReplace(conn, replacedInstanceId)
      const historicalDoneNodes = oldNodeRows.filter(
        (row) => row.status === NODE_STATUS.DONE && !isSystemNodeType(row.node_type),
      )

      await conn.query(
        `UPDATE wf_process_tasks
         SET status = ?, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
         WHERE instance_id = ?
           AND status IN (?, ?)`,
        [TASK_STATUS.CANCELLED, replacedInstanceId, TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
      )

      await conn.query(
        `UPDATE wf_process_instance_nodes
         SET status = ?,
             completed_at = COALESCE(completed_at, NOW()),
             updated_at = NOW()
         WHERE instance_id = ?
           AND status <> ?`,
        [NODE_STATUS.CANCELLED, replacedInstanceId, NODE_STATUS.DONE],
      )

      await conn.query(
        `UPDATE wf_process_instances
         SET status = ?, ended_at = COALESCE(ended_at, NOW()), current_node_key = NULL, updated_at = NOW()
         WHERE id = ?`,
        [INSTANCE_STATUS.TERMINATED, replacedInstanceId],
      )

      await insertAction(conn, {
        instanceId: replacedInstanceId,
        instanceNodeId: null,
        actionType: 'REPLACE_TEMPLATE',
        fromNodeKey: normalizeText(existing.current_node_key, 64) || null,
        toNodeKey: null,
        operatorUserId: normalizedOperatorUserId,
        comment: '强制替换为最新流程模板',
      })

      const {
        instance: nextInstance,
        instanceId: nextInstanceId,
        runtimeTemplate,
        entryNode,
        firstInstanceNodeId,
        instanceRows: nextInstanceRows,
      } = await createWorkflowInstanceSkeleton(conn, {
        demandId: normalizedDemandId,
        operatorUserId: normalizedOperatorUserId,
        forceRebuildTemplateFromDict: true,
      })

      const targetRows = nextInstanceRows.filter((row) => !isSystemNodeType(row.node_type))
      const usedTargetNodeKeys = new Set()
      const matchedHistoricalDoneNodes = []
      const unmatchedHistoricalDoneNodes = []

      historicalDoneNodes.forEach((sourceNode) => {
        const matched = findReplacementTargetNode(sourceNode, targetRows, usedTargetNodeKeys)
        if (!matched?.target?.node_key) {
          unmatchedHistoricalDoneNodes.push({
            source_node_key: normalizeTemplateNodeKey(sourceNode?.node_key) || null,
            source_node_name: sourceNode?.node_name_snapshot || sourceNode?.phase_key || '未命名节点',
            phase_key: normalizeText(sourceNode?.phase_key, 64).toUpperCase() || null,
            reason: 'NO_CONFIDENT_MATCH',
          })
          return
        }
        usedTargetNodeKeys.add(matched.target.node_key)
        matchedHistoricalDoneNodes.push({
          source: sourceNode,
          target: matched.target,
          match_type: matched.matchType,
        })
      })

      const nextGraph = buildWorkflowGraphFromInstanceRows(nextInstanceRows)
      const pendingDoneNodes = matchedHistoricalDoneNodes
        .slice()
        .sort((a, b) => Number(a?.target?.sort_order || 0) - Number(b?.target?.sort_order || 0))
      const migratedDoneNodeKeys = new Set()
      const migratedDoneNodes = []

      let advanced = true
      while (advanced && pendingDoneNodes.length > 0) {
        advanced = false
        for (let index = 0; index < pendingDoneNodes.length; index += 1) {
          const candidate = pendingDoneNodes[index]
          if (!candidate?.target?.node_key) continue
          if (!canReplayHistoricalDoneNode(candidate.target.node_key, nextGraph, migratedDoneNodeKeys)) {
            continue
          }
          await applyHistoricalDoneNodeState(conn, candidate.target, candidate.source)
          migratedDoneNodeKeys.add(candidate.target.node_key)
          migratedDoneNodes.push(candidate)
          pendingDoneNodes.splice(index, 1)
          index -= 1
          advanced = true
        }
      }

      pendingDoneNodes.forEach((item) => {
        unmatchedHistoricalDoneNodes.push({
          source_node_key: normalizeTemplateNodeKey(item?.source?.node_key) || null,
          source_node_name: item?.source?.node_name_snapshot || item?.source?.phase_key || '未命名节点',
          target_node_key: item?.target?.node_key || null,
          target_node_name: item?.target?.node_name_snapshot || item?.target?.phase_key || '未命名节点',
          phase_key: normalizeText(item?.source?.phase_key, 64).toUpperCase() || null,
          reason: 'DEPENDENCY_BLOCKED',
        })
      })

      await activateReadyWorkflowNodes(conn, {
        instance: nextInstance,
        instanceRows: nextInstanceRows,
        graph: runtimeTemplate,
        demandId: normalizedDemandId,
        operatorUserId: normalizedOperatorUserId,
        taskSource: 'TEMPLATE_REPLACE',
      })

      const progressState = await refreshInstanceProgressState(
        conn,
        nextInstance,
        normalizedDemandId,
        nextInstanceRows,
      )

      if (Boolean(autoAssignCurrentNode)) {
        // 保持与旧逻辑兼容，当前接口目前默认不自动指派
      }

      await insertAction(conn, {
        instanceId: nextInstanceId,
        instanceNodeId: firstInstanceNodeId,
        actionType: 'PROCESS_INIT',
        fromNodeKey: null,
        toNodeKey: progressState.currentNodeKey || entryNode?.node_key || null,
        operatorUserId: normalizedOperatorUserId,
        comment: '需求流程已按最新模板重建',
      })

      await insertAction(conn, {
        instanceId: nextInstanceId,
        instanceNodeId: null,
        actionType: 'REPLACE_TEMPLATE',
        fromNodeKey: normalizeText(existing.current_node_key, 64) || null,
        toNodeKey: progressState.currentNodeKey || null,
        operatorUserId: normalizedOperatorUserId,
        comment: `已替换为最新流程模板，继承 ${migratedDoneNodes.length} 个已完成节点`,
      })

      await conn.commit()

      const nextWorkflow = await this.getDemandWorkflowByInstanceId(nextInstanceId)
      return {
        replaced_instance_id: replacedInstanceId,
        workflow: nextWorkflow,
        migration_summary: {
          historical_node_count: oldNodeRows.length,
          new_workflow_node_count: nextInstanceRows.length,
          historical_done_node_count: historicalDoneNodes.length,
          matched_done_node_count: matchedHistoricalDoneNodes.length,
          migrated_done_node_count: migratedDoneNodes.length,
          unmatched_done_node_count: unmatchedHistoricalDoneNodes.length,
          unmatched_done_nodes: unmatchedHistoricalDoneNodes.slice(0, 20),
        },
      }
    } catch (err) {
      await conn.rollback()
      throw wrapWorkflowError(err)
    } finally {
      conn.release()
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

      if (Number(instance.template_version || 0) === 0 && instance.biz_id) {
        try {
          const [projectTemplateRows] = await pool.query(
            `SELECT
               pt.id,
               pt.name
             FROM work_demands d
             LEFT JOIN project_templates pt ON pt.id = d.template_id
             WHERE d.id = ?
             LIMIT 1`,
            [instance.biz_id],
          )
          const projectTemplate = projectTemplateRows[0] || null
          if (projectTemplate?.id) {
            instance.template_key = `PROJECT_TEMPLATE_${projectTemplate.id}`
            instance.template_name = projectTemplate.name || `项目模板#${projectTemplate.id}`
          }
        } catch (err) {
          // ignore template label override failure
        }
      }

      const [nodeRows, taskRows, actionRows] = await Promise.all([
        pool.query(
          `SELECT
             n.id,
             n.instance_id,
             n.node_key,
             n.node_name_snapshot,
             n.node_type,
             n.phase_key,
             COALESCE(
               pdi_phase.item_name,
               pdi_node.item_name,
               NULL
             ) AS phase_name,
             n.sort_order,
             n.status,
             n.assignee_user_id,
             COALESCE(NULLIF(u.real_name, ''), u.username) AS assignee_name,
             DATE_FORMAT(n.started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
             DATE_FORMAT(n.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
             DATE_FORMAT(ns.expected_start_date, '%Y-%m-%d') AS expected_start_date,
             DATE_FORMAT(n.due_at, '%Y-%m-%d') AS due_at,
             n.remark,
             n.owner_estimated_hours,
             n.personal_estimated_hours,
             n.actual_hours,
             DATE_FORMAT(n.planned_start_time, '%Y-%m-%d %H:%i:%s') AS planned_start_time,
             DATE_FORMAT(n.planned_end_time, '%Y-%m-%d %H:%i:%s') AS planned_end_time,
             DATE_FORMAT(n.actual_start_time, '%Y-%m-%d %H:%i:%s') AS actual_start_time,
             DATE_FORMAT(n.actual_end_time, '%Y-%m-%d %H:%i:%s') AS actual_end_time,
             n.reject_reason
           FROM wf_process_instance_nodes n
           LEFT JOIN (
             SELECT
               t.instance_node_id,
               MIN(wl.expected_start_date) AS expected_start_date
             FROM wf_process_tasks t
             LEFT JOIN (
               SELECT wl1.relate_task_id, MAX(wl1.id) AS latest_log_id
               FROM work_logs wl1
               WHERE wl1.task_source = 'WORKFLOW_AUTO'
                 AND wl1.relate_task_id IS NOT NULL
               GROUP BY wl1.relate_task_id
             ) wl_idx ON wl_idx.relate_task_id = t.id
             LEFT JOIN work_logs wl ON wl.id = wl_idx.latest_log_id
             WHERE t.instance_id = ?
             GROUP BY t.instance_node_id
           ) ns ON ns.instance_node_id = n.id
           LEFT JOIN users u ON u.id = n.assignee_user_id
           LEFT JOIN config_dict_items pdi_phase
             ON pdi_phase.type_key = '${DEMAND_PHASE_DICT_KEY}'
            AND pdi_phase.item_code = n.phase_key
           LEFT JOIN config_dict_items pdi_node
            ON pdi_node.type_key = '${DEMAND_PHASE_DICT_KEY}'
            AND pdi_node.item_code = n.node_key
           WHERE n.instance_id = ?
           ORDER BY n.sort_order ASC, n.id ASC`,
          [normalizedInstanceId, normalizedInstanceId],
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
             t.personal_estimated_hours,
             t.actual_hours,
             DATE_FORMAT(t.deadline, '%Y-%m-%d %H:%i:%s') AS deadline,
             DATE_FORMAT(wl.expected_start_date, '%Y-%m-%d') AS expected_start_date,
             DATE_FORMAT(wl.expected_completion_date, '%Y-%m-%d') AS expected_completion_date,
             t.source_type,
             t.source_id,
             DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
             DATE_FORMAT(t.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
             DATE_FORMAT(t.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at
           FROM wf_process_tasks t
           LEFT JOIN users u ON u.id = t.assignee_user_id
           LEFT JOIN (
             SELECT wl1.relate_task_id, MAX(wl1.id) AS latest_log_id
             FROM work_logs wl1
             WHERE wl1.task_source = 'WORKFLOW_AUTO'
               AND wl1.relate_task_id IS NOT NULL
             GROUP BY wl1.relate_task_id
           ) wl_idx ON wl_idx.relate_task_id = t.id
           LEFT JOIN work_logs wl ON wl.id = wl_idx.latest_log_id
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
             COALESCE(NULLIF(u.real_name, ''), u.username) AS operator_name,
             a.target_user_id,
             COALESCE(NULLIF(tu.real_name, ''), tu.username) AS target_user_name,
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
      const graph = buildWorkflowGraphFromInstanceRows(nodes)
      const graphNodeMap = graph.nodeMap || new Map()

      const collaboratorsByTaskId = new Map()
      try {
        const [collaboratorRows] = await pool.query(
          `SELECT
             tc.task_id,
             tc.user_id,
             COALESCE(NULLIF(u.real_name, ''), u.username) AS user_name,
             u.username,
             DATE_FORMAT(tc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
           FROM task_collaborators tc
           INNER JOIN wf_process_tasks t ON t.id = tc.task_id
           LEFT JOIN users u ON u.id = tc.user_id
           WHERE t.instance_id = ?
           ORDER BY tc.id ASC`,
          [normalizedInstanceId],
        )

        ;(collaboratorRows || []).forEach((item) => {
          const taskId = Number(item?.task_id)
          const userId = Number(item?.user_id)
          if (!Number.isInteger(taskId) || taskId <= 0) return
          if (!Number.isInteger(userId) || userId <= 0) return

          if (!collaboratorsByTaskId.has(taskId)) {
            collaboratorsByTaskId.set(taskId, [])
          }
          collaboratorsByTaskId.get(taskId).push({
            user_id: userId,
            user_name: item?.user_name || '',
            username: item?.username || '',
            created_at: item?.created_at || null,
          })
        })
      } catch (err) {
        if (!isWorkflowTableMissingError(err)) {
          throw err
        }
      }

      const hydratedTasks = (tasks || []).map((task) => {
        const taskId = Number(task?.id)
        const collaborators = Number.isInteger(taskId) && taskId > 0 ? collaboratorsByTaskId.get(taskId) || [] : []
        return {
          ...task,
          collaborators,
          collaborator_count: collaborators.length,
        }
      })

      const enrichedNodes = (nodes || []).map((node) => {
        const graphNode = graphNodeMap.get(normalizeTemplateNodeKey(node?.node_key))
        return {
          ...node,
          branch_key: graphNode?.branch_key || null,
          parallel_group_key: graphNode?.parallel_group_key || null,
          join_rule: graphNode?.join_rule || null,
          owner_estimate_required: normalizeOwnerEstimateRequired(graphNode?.owner_estimate_required, true),
          outgoing_keys: graphNode?.outgoing_keys || [],
          incoming_keys: graphNode?.incoming_keys || [],
        }
      })

      const doneCount = enrichedNodes.filter((node) => node.status === NODE_STATUS.DONE).length
      const totalCount = enrichedNodes.length
      const progressPercent = totalCount > 0 ? Number(((doneCount / totalCount) * 100).toFixed(1)) : 0
      const currentNodes = enrichedNodes
        .filter((node) => node.status === NODE_STATUS.IN_PROGRESS)
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      const currentNode =
        currentNodes.find((node) => node.node_key === instance.current_node_key) ||
        currentNodes[0] ||
        null

      return {
        instance,
        summary: {
          total_nodes: totalCount,
          done_nodes: doneCount,
          progress_percent: progressPercent,
          active_nodes: currentNodes.length,
        },
        current_node: currentNode,
        current_nodes: currentNodes,
        nodes: enrichedNodes,
        tasks: hydratedTasks,
        actions,
      }
    } catch (err) {
      throw wrapWorkflowError(err)
    }
  },

  async listTaskCollaborators({ demandId, taskId } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedTaskId = toPositiveInt(taskId)
    if (!normalizedDemandId) {
      const err = new Error('demand_id_required')
      err.code = 'DEMAND_ID_REQUIRED'
      throw err
    }
    if (!normalizedTaskId) {
      const err = new Error('task_id_required')
      err.code = 'TASK_ID_REQUIRED'
      throw err
    }

    const conn = await pool.getConnection()
    try {
      const instance = await findActiveDemandInstance(conn, normalizedDemandId, { forUpdate: false })
      if (!instance) {
        const err = new Error('workflow_instance_not_found')
        err.code = 'WORKFLOW_INSTANCE_NOT_FOUND'
        throw err
      }

      const [taskRows] = await conn.query(
        `SELECT id
         FROM wf_process_tasks
         WHERE id = ?
           AND instance_id = ?
         LIMIT 1`,
        [normalizedTaskId, instance.id],
      )
      if (!taskRows[0]) {
        const err = new Error('workflow_task_not_found')
        err.code = 'WORKFLOW_TASK_NOT_FOUND'
        throw err
      }

      const [rows] = await conn.query(
        `SELECT
           tc.id,
           tc.task_id,
           tc.user_id,
           COALESCE(NULLIF(u.real_name, ''), u.username) AS user_name,
           u.username,
           DATE_FORMAT(tc.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
         FROM task_collaborators tc
         LEFT JOIN users u ON u.id = tc.user_id
         WHERE tc.task_id = ?
         ORDER BY tc.id ASC`,
        [normalizedTaskId],
      )

      return (rows || []).map((item) => ({
        id: Number(item.id),
        task_id: Number(item.task_id),
        user_id: Number(item.user_id),
        user_name: item.user_name || '',
        username: item.username || '',
        created_at: item.created_at || null,
      }))
    } catch (err) {
      throw wrapWorkflowError(err)
    } finally {
      conn.release()
    }
  },

  async addTaskCollaborator({
    demandId,
    taskId,
    collaboratorUserId,
    operatorUserId,
    expectedStartDate = null,
    comment = '',
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedTaskId = toPositiveInt(taskId)
    const normalizedCollaboratorUserId = toPositiveInt(collaboratorUserId)
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)
    const normalizedExpectedStartDate = normalizeDate(expectedStartDate)

    if (!normalizedDemandId) {
      const err = new Error('demand_id_required')
      err.code = 'DEMAND_ID_REQUIRED'
      throw err
    }
    if (!normalizedTaskId) {
      const err = new Error('task_id_required')
      err.code = 'TASK_ID_REQUIRED'
      throw err
    }
    if (!normalizedCollaboratorUserId) {
      const err = new Error('collaborator_user_id_invalid')
      err.code = 'COLLABORATOR_USER_ID_INVALID'
      throw err
    }
    if (!normalizedOperatorUserId) {
      const err = new Error('operator_user_id_invalid')
      err.code = 'OPERATOR_USER_ID_INVALID'
      throw err
    }
    if (expectedStartDate !== null && expectedStartDate !== undefined && normalizedExpectedStartDate === null) {
      const err = new Error('expected_start_date_invalid')
      err.code = 'EXPECTED_START_DATE_INVALID'
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

      const [taskRows] = await conn.query(
        `SELECT
           t.id,
           t.instance_id,
           t.instance_node_id,
           t.assignee_user_id,
           DATE_FORMAT(t.due_at, '%Y-%m-%d') AS due_at,
           n.node_key,
           n.phase_key,
           n.node_name_snapshot,
           n.remark AS node_remark
         FROM wf_process_tasks t
         LEFT JOIN wf_process_instance_nodes n ON n.id = t.instance_node_id
         WHERE t.id = ?
           AND t.instance_id = ?
         LIMIT 1
         FOR UPDATE`,
        [normalizedTaskId, instance.id],
      )
      const task = taskRows[0] || null
      if (!task) {
        const err = new Error('workflow_task_not_found')
        err.code = 'WORKFLOW_TASK_NOT_FOUND'
        throw err
      }

      if (Number(task.assignee_user_id) === Number(normalizedCollaboratorUserId)) {
        const err = new Error('workflow_task_collaborator_is_assignee')
        err.code = 'WORKFLOW_TASK_COLLABORATOR_IS_ASSIGNEE'
        throw err
      }

      const [existingRows] = await conn.query(
        `SELECT id
         FROM task_collaborators
         WHERE task_id = ?
           AND user_id = ?
         LIMIT 1
         FOR UPDATE`,
        [normalizedTaskId, normalizedCollaboratorUserId],
      )
      const exists = Boolean(existingRows[0])

      if (!exists) {
        await conn.query(
          `INSERT INTO task_collaborators (task_id, user_id)
           VALUES (?, ?)`,
          [normalizedTaskId, normalizedCollaboratorUserId],
        )
      }

      await ensureAutoWorkLogForTask(conn, {
        taskId: normalizedTaskId,
        demandId: normalizedDemandId,
        phaseKey: task.phase_key,
        nodeName: task.node_name_snapshot,
        assigneeUserId: normalizedCollaboratorUserId,
        dueAt: task.due_at || null,
        expectedStartDate: normalizedExpectedStartDate,
        assignedByUserId: normalizedOperatorUserId,
        ownerEstimateRequired: normalizeOwnerEstimateRequired(
          parseWorkflowGraphMeta(task?.node_remark)?.owner_estimate_required,
          true,
        ),
      })

      await insertAction(conn, {
        instanceId: instance.id,
        instanceNodeId: task.instance_node_id || null,
        actionType: exists ? 'UPSERT_COLLABORATOR' : 'ADD_COLLABORATOR',
        fromNodeKey: task.node_key || null,
        toNodeKey: task.node_key || null,
        operatorUserId: normalizedOperatorUserId,
        targetUserId: normalizedCollaboratorUserId,
        comment: normalizeText(comment, 500) || '添加任务协作人',
        sourceType: 'TASK',
        sourceId: normalizedTaskId,
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

  async removeTaskCollaborator({
    demandId,
    taskId,
    collaboratorUserId,
    operatorUserId,
    comment = '',
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedTaskId = toPositiveInt(taskId)
    const normalizedCollaboratorUserId = toPositiveInt(collaboratorUserId)
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)

    if (!normalizedDemandId) {
      const err = new Error('demand_id_required')
      err.code = 'DEMAND_ID_REQUIRED'
      throw err
    }
    if (!normalizedTaskId) {
      const err = new Error('task_id_required')
      err.code = 'TASK_ID_REQUIRED'
      throw err
    }
    if (!normalizedCollaboratorUserId) {
      const err = new Error('collaborator_user_id_invalid')
      err.code = 'COLLABORATOR_USER_ID_INVALID'
      throw err
    }
    if (!normalizedOperatorUserId) {
      const err = new Error('operator_user_id_invalid')
      err.code = 'OPERATOR_USER_ID_INVALID'
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

      const [taskRows] = await conn.query(
        `SELECT
           t.id,
           t.instance_id,
           t.instance_node_id,
           n.node_key,
           n.phase_key
         FROM wf_process_tasks t
         LEFT JOIN wf_process_instance_nodes n ON n.id = t.instance_node_id
         WHERE t.id = ?
           AND t.instance_id = ?
         LIMIT 1
         FOR UPDATE`,
        [normalizedTaskId, instance.id],
      )
      const task = taskRows[0] || null
      if (!task) {
        const err = new Error('workflow_task_not_found')
        err.code = 'WORKFLOW_TASK_NOT_FOUND'
        throw err
      }

      const [deleteResult] = await conn.query(
        `DELETE FROM task_collaborators
         WHERE task_id = ?
           AND user_id = ?`,
        [normalizedTaskId, normalizedCollaboratorUserId],
      )
      if (Number(deleteResult?.affectedRows || 0) === 0) {
        const err = new Error('workflow_task_collaborator_not_found')
        err.code = 'WORKFLOW_TASK_COLLABORATOR_NOT_FOUND'
        throw err
      }

      await closeAutoWorkLogsForTaskCollaborator(conn, {
        taskId: normalizedTaskId,
        demandId: normalizedDemandId,
        phaseKey: task.phase_key,
        collaboratorUserId: normalizedCollaboratorUserId,
      })

      await insertAction(conn, {
        instanceId: instance.id,
        instanceNodeId: task.instance_node_id || null,
        actionType: 'REMOVE_COLLABORATOR',
        fromNodeKey: task.node_key || null,
        toNodeKey: task.node_key || null,
        operatorUserId: normalizedOperatorUserId,
        targetUserId: normalizedCollaboratorUserId,
        comment: normalizeText(comment, 500) || '移除任务协作人',
        sourceType: 'TASK',
        sourceId: normalizedTaskId,
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

  async listMyOpenTasks(userId, { limit = 30 } = {}) {
    const normalizedUserId = toPositiveInt(userId)
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
    assigneeUserIds = [],
    operatorUserId,
    dueAt = null,
    comment = '',
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedAssigneeUserIds = normalizePositiveIntList(assigneeUserIds)
    const normalizedSingleAssigneeUserId = toPositiveInt(assigneeUserId)
    const finalAssigneeUserIds =
      normalizedAssigneeUserIds.length > 0
        ? normalizedAssigneeUserIds
        : (normalizedSingleAssigneeUserId ? [normalizedSingleAssigneeUserId] : [])
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)
    const normalizedDueAt = normalizeDate(dueAt)

    if (!normalizedDemandId) {
      const err = new Error('demand_id_required')
      err.code = 'DEMAND_ID_REQUIRED'
      throw err
    }

    if (finalAssigneeUserIds.length === 0) {
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
        [finalAssigneeUserIds.length === 1 ? finalAssigneeUserIds[0] : null, normalizedDueAt, currentNode.id],
      )

      await insertAction(conn, {
        instanceId: instance.id,
        instanceNodeId: currentNode.id,
        actionType: 'ASSIGN',
        fromNodeKey: currentNode.node_key,
        toNodeKey: currentNode.node_key,
        operatorUserId: normalizedOperatorUserId,
        targetUserId: finalAssigneeUserIds.length === 1 ? finalAssigneeUserIds[0] : null,
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
    assigneeUserIds = [],
    operatorUserId,
    dueAt = null,
    comment = '',
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedNodeKey = normalizeText(nodeKey, 64).toUpperCase()
    const normalizedAssigneeUserIds = normalizePositiveIntList(assigneeUserIds)
    const normalizedSingleAssigneeUserId = toPositiveInt(assigneeUserId)
    const finalAssigneeUserIds =
      normalizedAssigneeUserIds.length > 0
        ? normalizedAssigneeUserIds
        : (normalizedSingleAssigneeUserId ? [normalizedSingleAssigneeUserId] : [])
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)
    const normalizedDueAt = normalizeDate(dueAt)

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
    if (finalAssigneeUserIds.length === 0) {
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

      if (targetNode.status === NODE_STATUS.TODO) {
        await conn.query(
          `UPDATE wf_process_instance_nodes
           SET status = ?, started_at = COALESCE(started_at, NOW())
           WHERE id = ?`,
          [NODE_STATUS.IN_PROGRESS, targetNode.id],
        )
        targetNode.status = NODE_STATUS.IN_PROGRESS
      }

      await conn.query(
        `UPDATE wf_process_instance_nodes
         SET assignee_user_id = ?, due_at = ?, updated_at = NOW()
         WHERE id = ?`,
        [finalAssigneeUserIds.length === 1 ? finalAssigneeUserIds[0] : null, normalizedDueAt, targetNode.id],
      )
      targetNode.assignee_user_id = finalAssigneeUserIds.length === 1 ? finalAssigneeUserIds[0] : null

      const isActiveNode = targetNode.status === NODE_STATUS.IN_PROGRESS

      await insertAction(conn, {
        instanceId: instance.id,
        instanceNodeId: targetNode.id,
        actionType: isActiveNode ? 'ASSIGN' : 'PREASSIGN',
        fromNodeKey: targetNode.node_key,
        toNodeKey: targetNode.node_key,
        operatorUserId: normalizedOperatorUserId,
        targetUserId: finalAssigneeUserIds.length === 1 ? finalAssigneeUserIds[0] : null,
        comment: comment || (isActiveNode ? '当前激活节点任务已指派' : '节点已预指派'),
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

      await submitNodeByGraph(conn, {
        instance,
        demandId: normalizedDemandId,
        operatorUserId: normalizedOperatorUserId,
        comment,
        sourceType,
        sourceId,
        skipAssigneeCheck,
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

  async submitNode({
    demandId,
    nodeKey,
    operatorUserId,
    comment = '',
    sourceType = 'MANUAL',
    sourceId = null,
    skipAssigneeCheck = false,
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedNodeKey = normalizeText(nodeKey, 64).toUpperCase()
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)

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

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const instance = await findActiveDemandInstance(conn, normalizedDemandId, { forUpdate: true })
      if (!instance) {
        const err = new Error('workflow_instance_not_found')
        err.code = 'WORKFLOW_INSTANCE_NOT_FOUND'
        throw err
      }

      await submitNodeByGraph(conn, {
        instance,
        demandId: normalizedDemandId,
        nodeKey: normalizedNodeKey,
        operatorUserId: normalizedOperatorUserId,
        comment,
        sourceType,
        sourceId,
        skipAssigneeCheck,
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

  async rejectCurrentNode({
    demandId,
    operatorUserId,
    rejectReason = '',
    comment = '',
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)
    const normalizedRejectReason = normalizeText(rejectReason, 2000)
    const normalizedComment = normalizeText(comment, 500)

    if (!normalizedDemandId) {
      const err = new Error('demand_id_required')
      err.code = 'DEMAND_ID_REQUIRED'
      throw err
    }
    if (!normalizedOperatorUserId) {
      const err = new Error('operator_user_id_invalid')
      err.code = 'OPERATOR_USER_ID_INVALID'
      throw err
    }
    if (!normalizedRejectReason) {
      const err = new Error('reject_reason_required')
      err.code = 'REJECT_REASON_REQUIRED'
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

      await rejectNodeByGraph(conn, {
        instance,
        demandId: normalizedDemandId,
        operatorUserId: normalizedOperatorUserId,
        rejectReason: normalizedRejectReason,
        comment: normalizedComment,
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

  async rejectNode({
    demandId,
    nodeKey,
    operatorUserId,
    rejectReason = '',
    comment = '',
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedNodeKey = normalizeText(nodeKey, 64).toUpperCase()
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)
    const normalizedRejectReason = normalizeText(rejectReason, 2000)
    const normalizedComment = normalizeText(comment, 500)

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
    if (!normalizedOperatorUserId) {
      const err = new Error('operator_user_id_invalid')
      err.code = 'OPERATOR_USER_ID_INVALID'
      throw err
    }
    if (!normalizedRejectReason) {
      const err = new Error('reject_reason_required')
      err.code = 'REJECT_REASON_REQUIRED'
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

      await rejectNodeByGraph(conn, {
        instance,
        demandId: normalizedDemandId,
        nodeKey: normalizedNodeKey,
        operatorUserId: normalizedOperatorUserId,
        rejectReason: normalizedRejectReason,
        comment: normalizedComment,
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

  async updateNodeHours({
    demandId,
    nodeKey,
    ownerEstimatedHours,
    personalEstimatedHours,
    actualHours,
    plannedStartTime,
    plannedEndTime,
    actualStartTime,
    actualEndTime,
    rejectReason,
    operatorUserId,
    comment = '',
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedNodeKey = normalizeText(nodeKey, 64).toUpperCase()
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)

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
    if (!normalizedOperatorUserId) {
      const err = new Error('operator_user_id_invalid')
      err.code = 'OPERATOR_USER_ID_INVALID'
      throw err
    }

    const normalizedOwnerHours = normalizeHours(ownerEstimatedHours)
    const normalizedPersonalHours = normalizeHours(personalEstimatedHours)
    const normalizedActualHours = normalizeHours(actualHours)
    const normalizedPlannedStart = normalizeDateTime(plannedStartTime)
    const normalizedPlannedEnd = normalizeDateTime(plannedEndTime)
    const normalizedActualStart = normalizeDateTime(actualStartTime)
    const normalizedActualEnd = normalizeDateTime(actualEndTime)
    const normalizedRejectReason =
      rejectReason === undefined ? undefined : (normalizeText(rejectReason, 2000) || null)

    const hasInvalidInput =
      (ownerEstimatedHours !== undefined && normalizedOwnerHours === undefined) ||
      (personalEstimatedHours !== undefined && normalizedPersonalHours === undefined) ||
      (actualHours !== undefined && normalizedActualHours === undefined) ||
      (plannedStartTime !== undefined && normalizedPlannedStart === undefined) ||
      (plannedEndTime !== undefined && normalizedPlannedEnd === undefined) ||
      (actualStartTime !== undefined && normalizedActualStart === undefined) ||
      (actualEndTime !== undefined && normalizedActualEnd === undefined) ||
      (rejectReason !== undefined && normalizedRejectReason === undefined)
    if (hasInvalidInput) {
      const err = new Error('workflow_node_hours_invalid_input')
      err.code = 'WORKFLOW_NODE_HOURS_INVALID_INPUT'
      throw err
    }

    const updateFields = []
    const updateParams = []

    if (ownerEstimatedHours !== undefined) {
      updateFields.push('owner_estimated_hours = ?')
      updateParams.push(normalizedOwnerHours)
    }
    if (personalEstimatedHours !== undefined) {
      updateFields.push('personal_estimated_hours = ?')
      updateParams.push(normalizedPersonalHours)
    }
    if (actualHours !== undefined) {
      updateFields.push('actual_hours = ?')
      updateParams.push(normalizedActualHours)
    }
    if (plannedStartTime !== undefined) {
      updateFields.push('planned_start_time = ?')
      updateParams.push(normalizedPlannedStart)
    }
    if (plannedEndTime !== undefined) {
      updateFields.push('planned_end_time = ?')
      updateParams.push(normalizedPlannedEnd)
    }
    if (actualStartTime !== undefined) {
      updateFields.push('actual_start_time = ?')
      updateParams.push(normalizedActualStart)
    }
    if (actualEndTime !== undefined) {
      updateFields.push('actual_end_time = ?')
      updateParams.push(normalizedActualEnd)
    }
    if (rejectReason !== undefined) {
      updateFields.push('reject_reason = ?')
      updateParams.push(normalizedRejectReason)
    }

    if (updateFields.length === 0) {
      const err = new Error('workflow_node_hours_no_fields')
      err.code = 'WORKFLOW_NODE_HOURS_NO_FIELDS'
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

      const node = await findNodeByKeyForUpdate(conn, instance.id, normalizedNodeKey)
      if (!node) {
        const err = new Error('workflow_node_not_found')
        err.code = 'WORKFLOW_NODE_NOT_FOUND'
        throw err
      }

      await conn.query(
        `UPDATE wf_process_instance_nodes
         SET ${updateFields.join(', ')}, updated_at = NOW()
         WHERE id = ?`,
        [...updateParams, node.id],
      )

      await conn.query(
        `INSERT INTO node_status_logs (
           node_id, from_status, to_status, operator_id, operation_type, remark
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          node.id,
          node.status || null,
          node.status || NODE_STATUS.TODO,
          normalizedOperatorUserId,
          'HOURS_UPDATE',
          normalizeText(comment, 500) || null,
        ],
      )

      await insertAction(conn, {
        instanceId: instance.id,
        instanceNodeId: node.id,
        actionType: 'UPDATE_NODE_HOURS',
        fromNodeKey: node.node_key,
        toNodeKey: node.node_key,
        operatorUserId: normalizedOperatorUserId,
        comment: normalizeText(comment, 500) || '更新节点工时信息',
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

  async updateTaskHours({
    demandId,
    taskId,
    personalEstimatedHours,
    actualHours,
    deadline,
    expectedStartDate,
    expectedCompletionDate,
    operatorUserId,
    comment = '',
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedTaskId = toPositiveInt(taskId)
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)

    if (!normalizedDemandId) {
      const err = new Error('demand_id_required')
      err.code = 'DEMAND_ID_REQUIRED'
      throw err
    }
    if (!normalizedTaskId) {
      const err = new Error('task_id_required')
      err.code = 'TASK_ID_REQUIRED'
      throw err
    }
    if (!normalizedOperatorUserId) {
      const err = new Error('operator_user_id_invalid')
      err.code = 'OPERATOR_USER_ID_INVALID'
      throw err
    }

    const normalizedPersonalHours = normalizeHours(personalEstimatedHours)
    const normalizedActualHours = normalizeHours(actualHours)
    const normalizedDeadline = normalizeDateTime(deadline)
    const normalizedExpectedStartDate = normalizeDate(expectedStartDate)
    const normalizedExpectedCompletionDate = normalizeDate(expectedCompletionDate)

    const hasInvalidInput =
      (personalEstimatedHours !== undefined && normalizedPersonalHours === undefined) ||
      (actualHours !== undefined && normalizedActualHours === undefined) ||
      (deadline !== undefined && normalizedDeadline === undefined) ||
      (expectedStartDate !== undefined && normalizedExpectedStartDate === null) ||
      (expectedCompletionDate !== undefined && normalizedExpectedCompletionDate === null) ||
      (normalizedExpectedStartDate &&
        normalizedExpectedCompletionDate &&
        normalizedExpectedStartDate > normalizedExpectedCompletionDate)
    if (hasInvalidInput) {
      const err = new Error('workflow_task_hours_invalid_input')
      err.code = 'WORKFLOW_TASK_HOURS_INVALID_INPUT'
      throw err
    }

    const updateFields = []
    const updateParams = []

    if (personalEstimatedHours !== undefined) {
      updateFields.push('personal_estimated_hours = ?')
      updateParams.push(normalizedPersonalHours)
    }
    if (actualHours !== undefined) {
      updateFields.push('actual_hours = ?')
      updateParams.push(normalizedActualHours)
    }
    if (deadline !== undefined) {
      updateFields.push('deadline = ?')
      updateParams.push(normalizedDeadline)
      updateFields.push('due_at = ?')
      updateParams.push(normalizedDeadline ? String(normalizedDeadline).slice(0, 10) : null)
    } else if (expectedCompletionDate !== undefined) {
      updateFields.push('due_at = ?')
      updateParams.push(normalizedExpectedCompletionDate || null)
    }
    if (updateFields.length === 0) {
      const err = new Error('workflow_task_hours_no_fields')
      err.code = 'WORKFLOW_TASK_HOURS_NO_FIELDS'
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

      const [taskRows] = await conn.query(
        `SELECT
           t.id,
           t.instance_id,
           t.instance_node_id,
           t.assignee_user_id,
           n.phase_key
         FROM wf_process_tasks t
         LEFT JOIN wf_process_instance_nodes n ON n.id = t.instance_node_id
         WHERE t.id = ?
           AND t.instance_id = ?
         LIMIT 1
         FOR UPDATE`,
        [normalizedTaskId, instance.id],
      )
      const task = taskRows[0] || null
      if (!task) {
        const err = new Error('workflow_task_not_found')
        err.code = 'WORKFLOW_TASK_NOT_FOUND'
        throw err
      }

      await conn.query(
        `UPDATE wf_process_tasks
         SET ${updateFields.join(', ')}, updated_at = NOW()
         WHERE id = ?`,
        [...updateParams, task.id],
      )

      const logUpdateFields = []
      const logUpdateParams = []
      if (personalEstimatedHours !== undefined) {
        logUpdateFields.push('personal_estimate_hours = ?')
        logUpdateParams.push(normalizedPersonalHours)
      }
      if (expectedStartDate !== undefined) {
        logUpdateFields.push('expected_start_date = ?')
        logUpdateParams.push(normalizedExpectedStartDate)
      }
      if (expectedCompletionDate !== undefined) {
        logUpdateFields.push('expected_completion_date = ?')
        logUpdateParams.push(normalizedExpectedCompletionDate)
      } else if (deadline !== undefined) {
        logUpdateFields.push('expected_completion_date = ?')
        logUpdateParams.push(normalizedDeadline ? String(normalizedDeadline).slice(0, 10) : null)
      }

      if (logUpdateFields.length > 0) {
        try {
          const [logUpdateResult] = await conn.query(
            `UPDATE work_logs
             SET ${logUpdateFields.join(', ')}, updated_at = NOW()
             WHERE task_source = 'WORKFLOW_AUTO'
               AND relate_task_id = ?
               AND user_id = ?
               AND demand_id = ?
               AND phase_key = ?
               AND COALESCE(log_status, 'IN_PROGRESS') <> 'DONE'`,
            [
              ...logUpdateParams,
              task.id,
              toPositiveInt(task.assignee_user_id) || 0,
              normalizedDemandId,
              normalizeText(task.phase_key, 64).toUpperCase(),
            ],
          )

          if (Number(logUpdateResult?.affectedRows || 0) === 0) {
            await conn.query(
              `UPDATE work_logs
               SET ${logUpdateFields.join(', ')}, updated_at = NOW()
               WHERE task_source = 'WORKFLOW_AUTO'
                 AND user_id = ?
                 AND demand_id = ?
                 AND phase_key = ?
                 AND description LIKE ?
                 AND COALESCE(log_status, 'IN_PROGRESS') <> 'DONE'`,
              [
                ...logUpdateParams,
                toPositiveInt(task.assignee_user_id) || 0,
                normalizedDemandId,
                normalizeText(task.phase_key, 64).toUpperCase(),
                `%#${task.id}`,
              ],
            )
          }
        } catch (err) {
          if (err?.code !== 'ER_BAD_FIELD_ERROR') throw err
        }
      }

      await insertAction(conn, {
        instanceId: instance.id,
        instanceNodeId: task.instance_node_id || null,
        actionType: 'UPDATE_TASK_HOURS',
        operatorUserId: normalizedOperatorUserId,
        comment: normalizeText(comment, 500) || '更新任务工时信息',
        sourceType: 'TASK',
        sourceId: task.id,
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

  async cancelTaskByWorkLog({
    demandId,
    log = {},
    operatorUserId,
    comment = '',
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)
    const normalizedTaskSource = normalizeText(log?.task_source, 32).toUpperCase()
    const normalizedTaskId = resolveAutoWorkLogTaskId(log)
    const normalizedUserId = toPositiveInt(log?.user_id)

    if (!normalizedDemandId || !normalizedOperatorUserId) {
      return { triggered: false, reason: 'INVALID_INPUT' }
    }
    if (normalizedTaskSource !== 'WORKFLOW_AUTO') {
      return { triggered: false, reason: 'TASK_SOURCE_NOT_WORKFLOW_AUTO' }
    }
    if (!normalizedTaskId) {
      return { triggered: false, reason: 'TASK_ID_NOT_FOUND' }
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const instance = await findActiveDemandInstance(conn, normalizedDemandId, { forUpdate: true })
      if (!instance) {
        await conn.rollback()
        return { triggered: false, reason: 'WORKFLOW_INSTANCE_NOT_FOUND' }
      }

      const [taskRows] = await conn.query(
        `SELECT
           t.id,
           t.instance_id,
           t.instance_node_id,
           t.assignee_user_id,
           t.status,
           n.node_key
         FROM wf_process_tasks t
         LEFT JOIN wf_process_instance_nodes n ON n.id = t.instance_node_id
         WHERE t.id = ?
           AND t.instance_id = ?
         LIMIT 1
         FOR UPDATE`,
        [normalizedTaskId, instance.id],
      )
      const task = taskRows[0] || null
      if (!task) {
        await conn.rollback()
        return { triggered: false, reason: 'WORKFLOW_TASK_NOT_FOUND' }
      }
      if (
        normalizedUserId &&
        Number(task.assignee_user_id || 0) > 0 &&
        Number(task.assignee_user_id) !== Number(normalizedUserId)
      ) {
        await conn.rollback()
        return { triggered: false, reason: 'TASK_ASSIGNEE_MISMATCH' }
      }

      if (String(task.status || '').toUpperCase() !== TASK_STATUS.CANCELLED) {
        await conn.query(
          `UPDATE wf_process_tasks
           SET status = ?, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
           WHERE id = ?`,
          [TASK_STATUS.CANCELLED, task.id],
        )

        await insertAction(conn, {
          instanceId: instance.id,
          instanceNodeId: task.instance_node_id || null,
          actionType: 'CANCEL_TASK',
          fromNodeKey: task.node_key || null,
          toNodeKey: task.node_key || null,
          operatorUserId: normalizedOperatorUserId,
          targetUserId: toPositiveInt(task.assignee_user_id) || null,
          comment: normalizeText(comment, 500) || '删除工作记录后同步取消流程任务',
          sourceType: 'TASK',
          sourceId: task.id,
        })
      }

      await conn.commit()
      return {
        triggered: true,
        taskId: task.id,
        workflow: await this.getDemandWorkflowByInstanceId(instance.id),
      }
    } catch (err) {
      await conn.rollback()
      throw wrapWorkflowError(err)
    } finally {
      conn.release()
    }
  },

  async syncTaskHoursFromWorkLog({
    demandId,
    phaseKey,
    assigneeUserId,
    taskSource,
    personalEstimatedHours,
    actualHours,
    description = '',
    operatorUserId,
  } = {}) {
    const normalizedDemandId = normalizeText(demandId, 64).toUpperCase()
    const normalizedPhaseKey = normalizeText(phaseKey, 64).toUpperCase()
    const normalizedAssigneeUserId = toPositiveInt(assigneeUserId)
    const normalizedTaskSource = normalizeText(taskSource, 32).toUpperCase()
    const normalizedOperatorUserId = toPositiveInt(operatorUserId)
    const hasPersonalHoursInput = personalEstimatedHours !== undefined
    const hasActualHoursInput = actualHours !== undefined
    const normalizedPersonalHours = normalizeHours(personalEstimatedHours)
    const normalizedActualHours = normalizeHours(actualHours)
    const candidateTaskId = parseTaskIdFromAutoWorkLogDescription(description)

    if (normalizedTaskSource !== 'WORKFLOW_AUTO') {
      return { triggered: false, reason: 'TASK_SOURCE_NOT_WORKFLOW_AUTO' }
    }
    if (!normalizedDemandId || !normalizedPhaseKey || !normalizedAssigneeUserId) {
      return { triggered: false, reason: 'DEMAND_OR_PHASE_OR_ASSIGNEE_MISSING' }
    }
    if (!normalizedOperatorUserId) {
      return { triggered: false, reason: 'OPERATOR_INVALID' }
    }
    if (!hasPersonalHoursInput && !hasActualHoursInput) {
      return { triggered: false, reason: 'NO_FIELDS_TO_SYNC' }
    }

    if (
      (hasPersonalHoursInput && normalizedPersonalHours === undefined) ||
      (hasActualHoursInput && normalizedActualHours === undefined)
    ) {
      return { triggered: false, reason: 'INVALID_INPUT' }
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const instance = await findActiveDemandInstance(conn, normalizedDemandId, { forUpdate: true })
      if (!instance) {
        await conn.commit()
        return { triggered: false, reason: 'INSTANCE_NOT_FOUND' }
      }

      let targetTask = null

      if (candidateTaskId) {
        const [taskRows] = await conn.query(
          `SELECT
             t.id,
             t.instance_node_id
           FROM wf_process_tasks t
           INNER JOIN wf_process_instance_nodes n ON n.id = t.instance_node_id
           WHERE t.id = ?
             AND t.instance_id = ?
             AND t.assignee_user_id = ?
             AND n.phase_key = ?
           LIMIT 1
           FOR UPDATE`,
          [candidateTaskId, instance.id, normalizedAssigneeUserId, normalizedPhaseKey],
        )
        targetTask = taskRows[0] || null
      }

      if (!targetTask) {
        const [taskRows] = await conn.query(
          `SELECT
             t.id,
             t.instance_node_id
           FROM wf_process_tasks t
           INNER JOIN wf_process_instance_nodes n ON n.id = t.instance_node_id
           WHERE t.instance_id = ?
             AND t.assignee_user_id = ?
             AND n.phase_key = ?
             AND t.status IN (?, ?)
           ORDER BY t.id DESC
           LIMIT 2
           FOR UPDATE`,
          [instance.id, normalizedAssigneeUserId, normalizedPhaseKey, TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS],
        )
        if ((taskRows || []).length !== 1) {
          await conn.commit()
          return {
            triggered: false,
            reason: (taskRows || []).length === 0 ? 'TASK_NOT_FOUND' : 'TASK_NOT_UNIQUE',
          }
        }
        targetTask = taskRows[0]
      }

      const updateFields = []
      const updateParams = []

      if (hasPersonalHoursInput) {
        updateFields.push('personal_estimated_hours = ?')
        updateParams.push(normalizedPersonalHours)
      }
      if (hasActualHoursInput) {
        updateFields.push('actual_hours = ?')
        updateParams.push(normalizedActualHours)
      }

      if (updateFields.length === 0) {
        await conn.commit()
        return { triggered: false, reason: 'NO_FIELDS_TO_SYNC' }
      }

      await conn.query(
        `UPDATE wf_process_tasks
         SET ${updateFields.join(', ')}, updated_at = NOW()
         WHERE id = ?`,
        [...updateParams, targetTask.id],
      )

      await insertAction(conn, {
        instanceId: instance.id,
        instanceNodeId: targetTask.instance_node_id || null,
        actionType: 'SYNC_TASK_HOURS_FROM_WORKLOG',
        operatorUserId: normalizedOperatorUserId,
        comment: '工作台预估/实填已同步至流程任务',
        sourceType: 'WORK_LOG',
        sourceId: targetTask.id,
      })

      await conn.commit()
      return {
        triggered: true,
        instance_id: instance.id,
        task_id: Number(targetTask.id),
      }
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

      const instanceRows = await listInstanceNodesForUpdate(conn, instance.id)
      const activeCandidates = instanceRows.filter((row) => {
        if (row.status !== NODE_STATUS.IN_PROGRESS) return false
        const normalizedRowPhaseKey = normalizeText(row.phase_key, 64).toUpperCase()
        const normalizedRowNodeKey = normalizeText(row.node_key, 64).toUpperCase()
        return normalizedPhaseKey === normalizedRowPhaseKey || normalizedPhaseKey === normalizedRowNodeKey
      })

      if (activeCandidates.length === 0) {
        await conn.commit()
        return { triggered: false, reason: 'PHASE_NOT_ACTIVE_OR_NODE_MISMATCH' }
      }
      if (activeCandidates.length > 1) {
        await conn.commit()
        return {
          triggered: false,
          reason: 'MULTIPLE_ACTIVE_NODES_MATCHED',
        }
      }
      const currentNode = activeCandidates[0]

      const [openTaskRows] = await conn.query(
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

      if ((openTaskRows || []).length === 1) {
        const targetTaskId = Number(openTaskRows[0].id)
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
      }

      const [[taskSummaryRow]] = await conn.query(
        `SELECT
           SUM(CASE WHEN status <> ? THEN 1 ELSE 0 END) AS active_tasks,
           SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS done_tasks
         FROM wf_process_tasks
         WHERE instance_node_id = ?`,
        [TASK_STATUS.CANCELLED, TASK_STATUS.DONE, currentNode.id],
      )
      const activeTasks = Number(taskSummaryRow?.active_tasks || 0)
      const doneTasks = Number(taskSummaryRow?.done_tasks || 0)
      const relatedNodeKey = normalizeText(currentNode?.node_key, 64).toUpperCase()
      const relatedPhaseKey = normalizeText(currentNode?.phase_key, 64).toUpperCase()
      const fallbackPhaseKey = normalizedPhaseKey || relatedNodeKey || relatedPhaseKey
      const primaryPhaseKey = relatedNodeKey || relatedPhaseKey || fallbackPhaseKey
      const secondaryPhaseKey = relatedPhaseKey || relatedNodeKey || fallbackPhaseKey

      const [[manualLogSummaryRow]] = await conn.query(
        `SELECT
           COUNT(*) AS active_logs,
           SUM(CASE WHEN COALESCE(log_status, 'IN_PROGRESS') = ? THEN 1 ELSE 0 END) AS done_logs
         FROM work_logs
         WHERE demand_id = ?
           AND COALESCE(log_status, 'IN_PROGRESS') <> 'CANCELLED'
           AND COALESCE(task_source, 'SELF') <> 'WORKFLOW_AUTO'
           AND UPPER(TRIM(COALESCE(phase_key, ''))) IN (?, ?)`,
        [TASK_STATUS.DONE, normalizedDemandId, primaryPhaseKey, secondaryPhaseKey],
      )
      const activeManualLogs = Number(manualLogSummaryRow?.active_logs || 0)
      const doneManualLogs = Number(manualLogSummaryRow?.done_logs || 0)
      const activeChildTasks = activeTasks + activeManualLogs
      const doneChildTasks = doneTasks + doneManualLogs

      // 仅在“存在有效子任务(非 CANCELLED)”且“有效子任务均为 DONE”时，自动推进节点。
      if (activeChildTasks <= 0) {
        await conn.commit()
        return {
          triggered: true,
          node_completed: false,
          instance_id: instance.id,
          node_key: currentNode.node_key,
          reason: 'NODE_HAS_NO_ACTIVE_TASKS',
        }
      }
      if (doneChildTasks < activeChildTasks) {
        await conn.commit()
        return {
          triggered: true,
          node_completed: false,
          instance_id: instance.id,
          node_key: currentNode.node_key,
          reason: 'NODE_HAS_NON_DONE_TASKS',
        }
      }

      await submitNodeByGraph(conn, {
        instance,
        demandId: normalizedDemandId,
        nodeKey: currentNode.node_key,
        operatorUserId: normalizedOperatorUserId,
        comment: '工作台事项完成，自动推进流程节点',
        sourceType: 'WORK_LOG',
        sourceId: normalizedLogId || null,
        skipAssigneeCheck: false,
      })

      await conn.commit()
      return {
        triggered: true,
        node_completed: true,
        instance_id: instance.id,
        node_key: currentNode.node_key,
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
