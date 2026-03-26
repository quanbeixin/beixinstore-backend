const pool = require('../utils/db')

function toPositiveInt(value) {
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

const STATUS_SET = new Set(['DRAFT', 'PUBLISHED', 'DISABLED'])

function normalizeStatus(value, fallback = 'DRAFT') {
  const next = String(value || fallback).trim().toUpperCase()
  return STATUS_SET.has(next) ? next : fallback
}

const WorkflowTemplate = {
  async listByProject(projectId) {
    const id = toPositiveInt(projectId)
    if (!id) return []

    const [rows] = await pool.query(
      `SELECT
         id,
         project_id,
         template_name,
         version_no,
         status,
         is_default,
         created_by,
         updated_by,
         created_at,
         updated_at
       FROM pm_workflow_templates
       WHERE project_id = ?
       ORDER BY version_no DESC, id DESC`,
      [id],
    )
    return rows
  },

  async getById(id) {
    const templateId = toPositiveInt(id)
    if (!templateId) return null
    const [rows] = await pool.query(
      `SELECT
         id,
         project_id,
         template_name,
         version_no,
         status,
         is_default,
         created_by,
         updated_by,
         created_at,
         updated_at
       FROM pm_workflow_templates
       WHERE id = ?
       LIMIT 1`,
      [templateId],
    )
    return rows[0] || null
  },

  async getNodes(templateId) {
    const id = toPositiveInt(templateId)
    if (!id) return []
    const [rows] = await pool.query(
      `SELECT
         id,
         template_id,
         node_key,
         node_name,
         sort_order,
         is_required,
         allow_return_to_keys,
         created_at,
         updated_at
       FROM pm_workflow_template_nodes
       WHERE template_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [id],
    )
    return rows
  },

  async createDraft({ projectId, templateName, createdBy }) {
    const project_id = toPositiveInt(projectId)
    if (!project_id) {
      throw new Error('project_id_invalid')
    }

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      const [[row]] = await conn.query(
        `SELECT COALESCE(MAX(version_no), 0) AS max_version
         FROM pm_workflow_templates
         WHERE project_id = ?`,
        [project_id],
      )
      const nextVersion = Number(row?.max_version || 0) + 1

      const [result] = await conn.query(
        `INSERT INTO pm_workflow_templates (
           project_id,
           template_name,
           version_no,
           status,
           is_default,
           created_by,
           updated_by
         ) VALUES (?, ?, ?, 'DRAFT', 0, ?, ?)`,
        [project_id, String(templateName || '').trim() || `流程模板V${nextVersion}`, nextVersion, createdBy || null, createdBy || null],
      )

      await conn.commit()
      return Number(result.insertId)
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async replaceNodes(templateId, nodes = []) {
    const id = toPositiveInt(templateId)
    if (!id) throw new Error('template_id_invalid')

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      await conn.query('DELETE FROM pm_workflow_template_nodes WHERE template_id = ?', [id])
      for (const node of nodes) {
        await conn.query(
          `INSERT INTO pm_workflow_template_nodes (
             template_id,
             node_key,
             node_name,
             sort_order,
             is_required,
             allow_return_to_keys
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            id,
            String(node.node_key || '').trim().toUpperCase(),
            String(node.node_name || '').trim(),
            Number(node.sort_order || 0),
            Number(node.is_required ? 1 : 0),
            node.allow_return_to_keys ? JSON.stringify(node.allow_return_to_keys) : null,
          ],
        )
      }

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },

  async updateStatus(templateId, status, updatedBy = null) {
    const id = toPositiveInt(templateId)
    if (!id) throw new Error('template_id_invalid')
    const nextStatus = normalizeStatus(status, 'DRAFT')
    const [result] = await pool.query(
      `UPDATE pm_workflow_templates
       SET status = ?, updated_by = ?
       WHERE id = ?`,
      [nextStatus, updatedBy, id],
    )
    return Number(result.affectedRows || 0)
  },

  async setDefault(templateId, projectId, updatedBy = null) {
    const id = toPositiveInt(templateId)
    const project_id = toPositiveInt(projectId)
    if (!id || !project_id) throw new Error('template_or_project_invalid')

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()

      await conn.query(
        `UPDATE pm_workflow_templates
         SET is_default = 0, updated_by = ?
         WHERE project_id = ? AND is_default = 1`,
        [updatedBy, project_id],
      )

      await conn.query(
        `UPDATE pm_workflow_templates
         SET is_default = 1, status = 'PUBLISHED', updated_by = ?
         WHERE id = ? AND project_id = ?`,
        [updatedBy, id, project_id],
      )

      await conn.commit()
    } catch (err) {
      await conn.rollback()
      throw err
    } finally {
      conn.release()
    }
  },
}

module.exports = WorkflowTemplate
