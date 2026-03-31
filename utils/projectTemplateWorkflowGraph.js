const SYSTEM_NODE_TYPES = {
  PARALLEL_SPLIT: 'PARALLEL_SPLIT',
  PARALLEL_JOIN: 'PARALLEL_JOIN',
}
const TRUE_LIKE_VALUES = new Set(['1', 'true', 'yes', 'y', 'on'])

function normalizeText(value, maxLen = 255) {
  return String(value || '').trim().slice(0, maxLen)
}

function normalizeNodeKey(value, fallback = '') {
  return String(value || fallback || '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase()
    .slice(0, 64)
}

function normalizeNodeType(value, fallback = 'TASK') {
  const type = String(value || fallback || 'TASK').trim().toUpperCase()
  return type || 'TASK'
}

function normalizeParticipantRoles(values) {
  const list = Array.isArray(values)
    ? values
    : values && typeof values === 'object'
      ? []
      : typeof values === 'string'
        ? values.split(',')
        : []

  return Array.from(
    new Set(
      list
        .map((item) =>
          String(item || '')
            .trim()
            .replace(/\s+/g, '_')
            .toUpperCase()
            .slice(0, 64),
        )
        .filter(Boolean),
    ),
  )
}

function normalizeSortOrder(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizeOwnerEstimateRequired(value, fallback = true) {
  if (value === undefined || value === null || value === '') return Boolean(fallback)
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (TRUE_LIKE_VALUES.has(normalized)) return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false
  return Boolean(fallback)
}

function parseConfig(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  if (typeof raw !== 'string') return null

  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (err) {
    return null
  }
}

function normalizeLegacyNodes(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => {
      const nodeKey = normalizeNodeKey(row?.node_key || row?.key || `NODE_${index + 1}`)
      return {
        node_key: nodeKey,
        node_name: normalizeText(row?.node_name || row?.name || row?.title || nodeKey, 128) || nodeKey,
        node_type: normalizeNodeType(row?.node_type || row?.type || 'TASK'),
        phase_key: normalizeText(row?.phase_key || row?.phaseKey || '', 64) || null,
        sort_order: normalizeSortOrder(row?.sort_order, (index + 1) * 10),
        branch_key: normalizeText(row?.branch_key || row?.branchKey || '', 64) || null,
        parallel_group_key:
          normalizeText(
            row?.parallel_group_key ||
              row?.parallelGroupKey ||
              row?.meta?.parallel_group_key ||
              row?.meta?.parallelGroupKey ||
              '',
            64,
          ) || null,
        join_rule: normalizeText(row?.join_rule || row?.joinRule || '', 32).toUpperCase() || null,
        description: normalizeText(row?.description || row?.meta?.description || '', 1000) || '',
        participant_roles: normalizeParticipantRoles(
          row?.participant_roles || row?.participantRoles || row?.meta?.participant_roles || row?.meta?.participantRoles,
        ),
        owner_estimate_required: normalizeOwnerEstimateRequired(
          row?.owner_estimate_required ?? row?.ownerEstimateRequired ?? row?.meta?.owner_estimate_required ?? row?.meta?.ownerEstimateRequired,
          true,
        ),
      }
    })
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
}

function buildSequentialEdges(nodes) {
  const list = Array.isArray(nodes) ? nodes : []
  const edges = []
  for (let index = 0; index < list.length - 1; index += 1) {
    edges.push({
      from: list[index].node_key,
      to: list[index + 1].node_key,
    })
  }
  return edges
}

function normalizeV2Nodes(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => {
      const nodeKey = normalizeNodeKey(row?.node_key || row?.key || `NODE_${index + 1}`)
      return {
        node_key: nodeKey,
        node_name: normalizeText(row?.node_name || row?.name || row?.title || nodeKey, 128) || nodeKey,
        node_type: normalizeNodeType(row?.node_type || row?.type || 'TASK'),
        phase_key: normalizeText(row?.phase_key || row?.phaseKey || '', 64) || null,
        sort_order: normalizeSortOrder(row?.sort_order ?? row?.order, (index + 1) * 10),
        branch_key: normalizeText(row?.branch_key || row?.branchKey || '', 64) || null,
        parallel_group_key:
          normalizeText(
            row?.parallel_group_key ||
              row?.parallelGroupKey ||
              row?.meta?.parallel_group_key ||
              row?.meta?.parallelGroupKey ||
              '',
            64,
          ) || null,
        join_rule: normalizeText(row?.join_rule || row?.joinRule || 'ALL', 32).toUpperCase() || null,
        description: normalizeText(row?.description || row?.meta?.description || '', 1000) || '',
        participant_roles: normalizeParticipantRoles(
          row?.participant_roles || row?.participantRoles || row?.meta?.participant_roles || row?.meta?.participantRoles,
        ),
        owner_estimate_required: normalizeOwnerEstimateRequired(
          row?.owner_estimate_required ?? row?.ownerEstimateRequired ?? row?.meta?.owner_estimate_required ?? row?.meta?.ownerEstimateRequired,
          true,
        ),
      }
    })
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
}

function normalizeEdges(rows, nodes) {
  const normalizedNodes = Array.isArray(nodes) ? nodes : []
  const keySet = new Set(normalizedNodes.map((item) => item.node_key))
  const list = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      from: normalizeNodeKey(row?.from),
      to: normalizeNodeKey(row?.to),
    }))
    .filter((row) => row.from && row.to && keySet.has(row.from) && keySet.has(row.to))

  if (list.length > 0) return list
  return buildSequentialEdges(normalizedNodes)
}

function normalizeTemplateGraph(rawConfig) {
  const config = parseConfig(rawConfig)
  if (!config) {
    return {
      schema_version: 2,
      entry_node_key: null,
      nodes: [],
      edges: [],
    }
  }

  if (config.schema_version === 2 || Array.isArray(config.nodes) || Array.isArray(config.edges)) {
    const nodes = normalizeV2Nodes(config.nodes)
    const edges = normalizeEdges(config.edges, nodes)
    return {
      schema_version: 2,
      entry_node_key: normalizeNodeKey(config.entry_node_key || nodes[0]?.node_key || ''),
      nodes,
      edges,
    }
  }

  const legacyRows = Array.isArray(config) ? config : Array.isArray(config.nodes) ? config.nodes : Object.entries(config || {}).map(([nodeKey, row], index) => ({
    node_key: nodeKey,
    ...(row && typeof row === 'object' ? row : {}),
    sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : (index + 1) * 10,
  }))
  const nodes = normalizeLegacyNodes(legacyRows)
  return {
    schema_version: 2,
    entry_node_key: nodes[0]?.node_key || null,
    nodes,
    edges: buildSequentialEdges(nodes),
  }
}

function filterTemplateGraphByParticipantRoles(templateGraph, participantRoles = []) {
  const normalizedGraph = normalizeTemplateGraph(templateGraph)
  const normalizedDemandRoles = normalizeParticipantRoles(participantRoles)
  const demandRoleSet = new Set(normalizedDemandRoles)
  const allNodes = Array.isArray(normalizedGraph.nodes) ? normalizedGraph.nodes : []
  const allEdges = Array.isArray(normalizedGraph.edges) ? normalizedGraph.edges : []
  const keptNodes = allNodes.filter((node) => {
    const nodeRoles = normalizeParticipantRoles(node?.participant_roles)
    if (nodeRoles.length === 0) return true
    return nodeRoles.some((role) => demandRoleSet.has(role))
  })

  if (keptNodes.length === allNodes.length) {
    return normalizedGraph
  }

  const keptKeySet = new Set(keptNodes.map((node) => node.node_key))
  const outgoingMap = new Map()
  const incomingMap = new Map()
  allEdges.forEach((edge) => {
    if (!outgoingMap.has(edge.from)) outgoingMap.set(edge.from, [])
    if (!incomingMap.has(edge.to)) incomingMap.set(edge.to, [])
    outgoingMap.get(edge.from).push(edge.to)
    incomingMap.get(edge.to).push(edge.from)
  })

  const nextEdgeKeySet = new Set()
  const nextEdges = []
  const addEdge = (from, to) => {
    if (!from || !to || from === to) return
    const edgeKey = `${from}__${to}`
    if (nextEdgeKeySet.has(edgeKey)) return
    nextEdgeKeySet.add(edgeKey)
    nextEdges.push({ from, to })
  }

  keptNodes.forEach((node) => {
    const queue = [...(outgoingMap.get(node.node_key) || [])]
    const visited = new Set()

    while (queue.length > 0) {
      const currentKey = queue.shift()
      if (!currentKey || visited.has(currentKey)) continue
      visited.add(currentKey)

      if (keptKeySet.has(currentKey)) {
        addEdge(node.node_key, currentKey)
        continue
      }

      queue.push(...(outgoingMap.get(currentKey) || []))
    }
  })

  const entryNodeKey =
    keptNodes.find((node) => {
      const queue = [...(incomingMap.get(node.node_key) || [])]
      const visited = new Set()

      while (queue.length > 0) {
        const currentKey = queue.shift()
        if (!currentKey || visited.has(currentKey)) continue
        visited.add(currentKey)
        if (keptKeySet.has(currentKey)) return false
        queue.push(...(incomingMap.get(currentKey) || []))
      }
      return true
    })?.node_key || keptNodes[0]?.node_key || null

  return normalizeTemplateGraph({
    schema_version: normalizedGraph.schema_version || 2,
    entry_node_key: entryNodeKey,
    nodes: keptNodes,
    edges: nextEdges,
  })
}

function buildGraphMaps(templateGraph) {
  const nodes = Array.isArray(templateGraph?.nodes) ? templateGraph.nodes : []
  const edges = Array.isArray(templateGraph?.edges) ? templateGraph.edges : []
  const nodeMap = new Map(nodes.map((item) => [item.node_key, item]))
  const outgoingMap = new Map()
  const incomingMap = new Map()

  edges.forEach((edge) => {
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) return
    if (!outgoingMap.has(edge.from)) outgoingMap.set(edge.from, [])
    if (!incomingMap.has(edge.to)) incomingMap.set(edge.to, [])
    outgoingMap.get(edge.from).push(edge.to)
    incomingMap.get(edge.to).push(edge.from)
  })

  return {
    nodeMap,
    outgoingMap,
    incomingMap,
  }
}

function isSystemNodeType(nodeType) {
  const type = normalizeNodeType(nodeType, '')
  return type === SYSTEM_NODE_TYPES.PARALLEL_SPLIT || type === SYSTEM_NODE_TYPES.PARALLEL_JOIN
}

module.exports = {
  SYSTEM_NODE_TYPES,
  normalizeTemplateGraph,
  filterTemplateGraphByParticipantRoles,
  buildGraphMaps,
  isSystemNodeType,
  normalizeNodeKey,
  normalizeNodeType,
  normalizeParticipantRoles,
}
