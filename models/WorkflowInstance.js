const pool = require('../utils/db')
const WorkflowTemplate = require('./WorkflowTemplate')
const WorkflowOperationLog = require('./WorkflowOperationLog')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function normalizeDemandId(value) {
  const id = String(value || '').trim().toUpperCase()
  return id || ''
}

function parseAllowReturnKeys(value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)
  }
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)
  } catch {
    return []
  }
}

const WorkflowInstance = {
  async getByDemandId(demandId) {
    const id = normalizeDemandId(demandId)
    if (!id) return null

    const [rows] = await pool.query(
      `SELECT
         i.*,
         t.template_name
       FROM pm_workflow_instances i
       LEFT JOIN pm_workflow_templates t ON t.id = i.template_id
       WHERE i.demand_id = ?
       LIMIT 1`,
      [id],
    )
    const instance = rows[0] || null
    if (!instance) return null

    const [nodes] = await pool.query(
      `SELECT
         id,
         instance_id,
         node_key,
         node_name_snapshot,
         sort_order,
         status,
         assignee_user_id,
         due_at,
         started_at,
         finished_at
       FROM pm_workflow_instance_nodes
       WHERE instance_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [instance.id],
    )

    const orderedNodes = [...nodes].sort((a, b) => {
      const orderDiff = Number(a?.sort_order || 0) - Number(b?.sort_order || 0)
      if (orderDiff !== 0) return orderDiff
      return String(a?.node_key || '').localeCompare(String(b?.node_key || ''))
    })
    const currentNodeKey = String(instance.current_node_key || '').toUpperCase()
    const currentNode = orderedNodes.find(
      (node) => String(node?.node_key || '').toUpperCase() === currentNodeKey,
    )
    const currentIndex = orderedNodes.findIndex(
      (node) => String(node?.node_key || '').toUpperCase() === currentNodeKey,
    )
    const nextNode = currentIndex >= 0 ? orderedNodes[currentIndex + 1] : null

    let allowedReturnKeys = []
    if (instance.template_id && currentNodeKey) {
      const templateNodes = await WorkflowTemplate.getNodes(instance.template_id)
      const currentTemplateNode = (templateNodes || []).find(
        (node) => String(node?.node_key || '').toUpperCase() === currentNodeKey,
      )
      allowedReturnKeys = parseAllowReturnKeys(currentTemplateNode?.allow_return_to_keys)
    }

    const allowedTransitionTargetKeys = []
    if (nextNode?.node_key) {
      allowedTransitionTargetKeys.push(String(nextNode.node_key).toUpperCase())
    }
    for (const key of allowedReturnKeys) {
      if (!allowedTransitionTargetKeys.includes(key)) {
        allowedTransitionTargetKeys.push(key)
      }
    }

    return {
      ...instance,
      nodes,
      current_node: currentNode || null,
      allowed_transition_target_keys: allowedTransitionTargetKeys,
    }
  },

  async createByDemand({ demandId, projectId, operatorUserId = null }) {
    const normalizedDemandId = normalizeDemandId(demandId)
    const normalizedProjectId = toPositiveInt(projectId)
    if (!normalizedDemandId || !normalizedProjectId) {
      throw new Error('demand_or_project_invalid')
    }

    const existing = await this.getByDemandId(normalizedDemandId)
    if (existing) return existing

    const templates = await WorkflowTemplate.listByProject(normalizedProjectId)
    const publishedTemplates = templates.filter((item) => String(item.status).toUpperCase() === 'PUBLISHED')
    const defaultTemplate =
      publishedTemplates.find((item) => Number(item.is_default) === 1) || publishedTemplates[0] || null
    if (!defaultTemplate) {
      const err = new Error('workflow_default_template_missing')
      err.code = 'WORKFLOW_DEFAULT_TEMPLATE_MISSING'
      throw err
    }

    const nodes = await WorkflowTemplate.getNodes(defaultTemplate.id)
    if (!Array.isArray(nodes) || nodes.length === 0) {
      const err = new Error('workflow_template_has_no_nodes')
      err.code = 'WORKFLOW_TEMPLATE_HAS_NO_NODES'
      throw err
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [instanceResult] = await conn.query(
        `INSERT INTO pm_workflow_instances (
           demand_id,
           project_id,
           template_id,
           template_version_no,
           current_node_key,
           status,
           started_at,
           created_by,
           updated_by
         ) VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', NOW(), ?, ?)`,
        [
          normalizedDemandId,
          normalizedProjectId,
          defaultTemplate.id,
          defaultTemplate.version_no,
          nodes[0].node_key,
          operatorUserId,
          operatorUserId,
        ],
      )

      const instanceId = Number(instanceResult.insertId)
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index]
        const status = index === 0 ? 'IN_PROGRESS' : 'PENDING'
        await conn.query(
          `INSERT INTO pm_workflow_instance_nodes (
             instance_id,
             node_key,
             node_name_snapshot,
             sort_order,
             status,
             created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
          [instanceId, node.node_key, node.node_name, node.sort_order, status],
        )
      }

      await conn.commit()
      return this.getByDemandId(normalizedDemandId)
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async transition({ demandId, toNodeKey, operatorUserId = null, comment = '' }) {
    const instance = await this.getByDemandId(demandId)
    if (!instance) {
      const err = new Error('workflow_instance_not_found')
      err.code = 'WORKFLOW_INSTANCE_NOT_FOUND'
      throw err
    }
    if (String(instance.status || '').toUpperCase() !== 'IN_PROGRESS') {
      const err = new Error('workflow_instance_not_in_progress')
      err.code = 'WORKFLOW_INSTANCE_NOT_IN_PROGRESS'
      throw err
    }

    const targetKey = String(toNodeKey || '').trim().toUpperCase()
    if (!targetKey) {
      const err = new Error('workflow_target_node_invalid')
      err.code = 'WORKFLOW_TARGET_NODE_INVALID'
      throw err
    }

    const nodes = Array.isArray(instance.nodes) ? instance.nodes : []
    const targetNode = nodes.find((node) => String(node.node_key || '').toUpperCase() === targetKey)
    if (!targetNode) {
      const err = new Error('workflow_target_node_not_found')
      err.code = 'WORKFLOW_TARGET_NODE_NOT_FOUND'
      throw err
    }

    const currentNode = nodes.find(
      (node) => String(node.node_key || '').toUpperCase() === String(instance.current_node_key || '').toUpperCase(),
    )
    if (!currentNode) {
      const err = new Error('workflow_current_node_not_found')
      err.code = 'WORKFLOW_CURRENT_NODE_NOT_FOUND'
      throw err
    }

    const currentKey = String(currentNode.node_key || '').toUpperCase()
    if (currentKey === targetKey) {
      const err = new Error('workflow_target_node_same_as_current')
      err.code = 'WORKFLOW_TARGET_NODE_SAME_AS_CURRENT'
      throw err
    }

    const allowedTargets = Array.isArray(instance.allowed_transition_target_keys)
      ? instance.allowed_transition_target_keys.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)
      : []

    const orderedNodes = [...nodes].sort((a, b) => {
      const orderDiff = Number(a?.sort_order || 0) - Number(b?.sort_order || 0)
      if (orderDiff !== 0) return orderDiff
      return String(a?.node_key || '').localeCompare(String(b?.node_key || ''))
    })
    const currentIndex = orderedNodes.findIndex(
      (node) => String(node?.node_key || '').toUpperCase() === currentKey,
    )
    const nextNode = currentIndex >= 0 ? orderedNodes[currentIndex + 1] : null

    const currentOrder = Number(currentNode.sort_order || 0)
    const targetOrder = Number(targetNode.sort_order || 0)
    const isForwardToNext =
      Boolean(nextNode) && String(nextNode?.node_key || '').toUpperCase() === targetKey
    const isReturn = targetOrder < currentOrder

    // Flow legality converges on template-derived allowed targets.
    if (allowedTargets.length > 0 && !allowedTargets.includes(targetKey)) {
      const err = new Error(isReturn ? 'workflow_return_not_allowed' : 'workflow_transition_invalid_direction')
      err.code = isReturn ? 'WORKFLOW_RETURN_NOT_ALLOWED' : 'WORKFLOW_TRANSITION_INVALID_DIRECTION'
      throw err
    }

    if (!isForwardToNext && !isReturn) {
      const err = new Error('workflow_transition_invalid_direction')
      err.code = 'WORKFLOW_TRANSITION_INVALID_DIRECTION'
      throw err
    }

    if (isReturn) {
      const templateNodes = await WorkflowTemplate.getNodes(instance.template_id)
      const currentTemplateNode = (templateNodes || []).find(
        (node) => String(node.node_key || '').toUpperCase() === currentKey,
      )
      const allowReturnToKeys = parseAllowReturnKeys(currentTemplateNode?.allow_return_to_keys)
      if (!allowReturnToKeys.includes(targetKey)) {
        const err = new Error('workflow_return_not_allowed')
        err.code = 'WORKFLOW_RETURN_NOT_ALLOWED'
        throw err
      }
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      if (isForwardToNext) {
        await conn.query(
          `UPDATE pm_workflow_instance_nodes
           SET status = 'DONE',
               finished_at = COALESCE(finished_at, NOW()),
               updated_at = NOW()
           WHERE instance_id = ?
             AND node_key = ?`,
          [instance.id, currentKey],
        )

        await conn.query(
          `UPDATE pm_workflow_instance_nodes
           SET status = 'IN_PROGRESS',
               started_at = COALESCE(started_at, NOW()),
               updated_at = NOW()
           WHERE instance_id = ?
             AND node_key = ?`,
          [instance.id, targetKey],
        )
      } else {
        await conn.query(
          `UPDATE pm_workflow_instance_nodes
           SET status = CASE
               WHEN node_key = ? THEN 'IN_PROGRESS'
               WHEN sort_order >= ? AND sort_order <= ? THEN 'PENDING'
               ELSE status
             END,
             finished_at = CASE
               WHEN sort_order >= ? AND sort_order <= ? THEN NULL
               ELSE finished_at
             END,
             updated_at = NOW()
           WHERE instance_id = ?`,
          [targetKey, targetOrder + 1, currentOrder, targetOrder + 1, currentOrder, instance.id],
        )
      }

      await conn.query(
        `UPDATE pm_workflow_instances
         SET current_node_key = ?,
             status = 'IN_PROGRESS',
             finished_at = NULL,
             updated_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [targetKey, operatorUserId, instance.id],
      )

      await conn.commit()

      await WorkflowOperationLog.create({
        projectId: instance.project_id,
        operatorUserId,
        entityType: 'INSTANCE',
        entityId: instance.id,
        action: isForwardToNext ? 'TRANSITION_FORWARD' : 'TRANSITION_RETURN',
        detail: comment || `transition_to_${targetKey}`,
      })

      return this.getByDemandId(demandId)
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },
}

module.exports = WorkflowInstance
