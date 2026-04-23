#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path')
const dotenv = require('dotenv')

const backendRoot = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

const pool = require('../utils/db')
const {
  filterTemplateGraphByParticipantRoles,
  isSystemNodeType,
  normalizeNodeKey,
  normalizeParticipantRoles,
  normalizeTemplateGraph,
} = require('../utils/projectTemplateWorkflowGraph')

const APPLY = process.argv.includes('--apply') || String(process.env.APPLY || '').trim() === 'true'
const ACTIVE_INSTANCE_STATUSES = ['NOT_STARTED', 'IN_PROGRESS']
const CLOSED_NODE_STATUSES = new Set(['DONE', 'CANCELLED', 'CANCELED'])

function parseJsonValue(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function buildTemplateRoleMap(nodeConfig, participantRolesRaw) {
  const participantRoles = normalizeParticipantRoles(parseJsonValue(participantRolesRaw, []))
  const graph =
    participantRoles.length > 0
      ? filterTemplateGraphByParticipantRoles(nodeConfig, participantRoles)
      : normalizeTemplateGraph(nodeConfig)

  const roleMap = new Map()
  ;(Array.isArray(graph?.nodes) ? graph.nodes : []).forEach((node) => {
    const nodeKey = normalizeNodeKey(node?.node_key || node?.key || '')
    if (!nodeKey || isSystemNodeType(node?.node_type)) return
    const nodeRoles = normalizeParticipantRoles(node?.participant_roles || node?.participantRoles || [])
    if (nodeRoles.length > 0) {
      roleMap.set(nodeKey, nodeRoles)
    }
  })
  return roleMap
}

async function loadActiveDemandInstances() {
  const [rows] = await pool.query(
    `SELECT
       i.id AS instance_id,
       i.biz_id AS demand_id,
       d.template_id,
       d.participant_roles_json,
       pt.node_config
     FROM wf_process_instances i
     INNER JOIN work_demands d ON d.id = i.biz_id
     LEFT JOIN project_templates pt ON pt.id = d.template_id
     WHERE i.biz_type = 'DEMAND'
       AND i.status IN (?, ?)
       AND pt.node_config IS NOT NULL
     ORDER BY i.id ASC`,
    ACTIVE_INSTANCE_STATUSES,
  )
  return rows
}

async function loadOpenInstanceNodes(instanceId) {
  const [rows] = await pool.query(
    `SELECT id, node_key, node_name_snapshot, status, remark
     FROM wf_process_instance_nodes
     WHERE instance_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [instanceId],
  )
  return rows
}

async function backfill() {
  const instances = await loadActiveDemandInstances()
  const conn = await pool.getConnection()
  const samples = []
  let scannedNodeCount = 0
  let changedNodeCount = 0

  try {
    await conn.beginTransaction()

    for (const instance of instances) {
      const templateRoleMap = buildTemplateRoleMap(instance.node_config, instance.participant_roles_json)
      if (templateRoleMap.size === 0) continue

      const nodes = await loadOpenInstanceNodes(instance.instance_id)
      for (const node of nodes) {
        const nodeStatus = String(node.status || '').trim().toUpperCase()
        if (CLOSED_NODE_STATUSES.has(nodeStatus)) continue

        scannedNodeCount += 1
        const nodeKey = normalizeNodeKey(node.node_key)
        if (!nodeKey) continue

        const templateRoles = normalizeParticipantRoles(templateRoleMap.get(nodeKey))
        if (templateRoles.length === 0) continue

        const currentRemark = parseJsonValue(node.remark, {})
        const nextRemark =
          currentRemark && typeof currentRemark === 'object' && !Array.isArray(currentRemark)
            ? { ...currentRemark }
            : {}
        const currentRoles = normalizeParticipantRoles(nextRemark.participant_roles || nextRemark.participantRoles || [])
        if (currentRoles.length > 0) continue

        nextRemark.participant_roles = templateRoles
        delete nextRemark.participantRoles

        if (APPLY) {
          await conn.query(
            `UPDATE wf_process_instance_nodes
             SET remark = ?, updated_at = updated_at
             WHERE id = ?`,
            [JSON.stringify(nextRemark), node.id],
          )
        }

        changedNodeCount += 1
        if (samples.length < 20) {
          samples.push({
            demand_id: instance.demand_id,
            instance_id: instance.instance_id,
            node_key: nodeKey,
            node_name: node.node_name_snapshot,
            participant_roles: templateRoles,
          })
        }
      }
    }

    if (APPLY) {
      await conn.commit()
    } else {
      await conn.rollback()
    }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }

  return {
    apply: APPLY,
    instance_count: instances.length,
    scanned_open_node_count: scannedNodeCount,
    changed_node_count: changedNodeCount,
    samples,
  }
}

backfill()
  .then((result) => {
    console.log(JSON.stringify({ success: true, ...result }, null, 2))
    process.exit(0)
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error)
    process.exit(1)
  })
