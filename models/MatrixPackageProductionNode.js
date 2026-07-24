const pool = require('../utils/db')
const MatrixPackage = require('./MatrixPackage')
const MatrixPackageSideNote = require('./MatrixPackageSideNote')

const NODE_DEFINITIONS = [
  {
    node_code: 'OPERATION_MATERIAL',
    node_name: '运营物料信息提供',
    owner_side: '运营',
    sort_order: 10,
    depends_on: [],
  },
  {
    node_code: 'DESIGN_PRODUCTION',
    node_name: '前端空包构建上传',
    owner_side: '前端',
    sort_order: 20,
    depends_on: [],
  },
  {
    node_code: 'BACKEND_SCRIPT',
    node_name: '后端脚本',
    owner_side: '后端',
    sort_order: 30,
    depends_on: [],
  },
]

const NODE_CODES = NODE_DEFINITIONS.map((item) => item.node_code)
const STATUS_CODES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']

function normalizeNodeCode(value) {
  const text = String(value || '').trim().toUpperCase()
  return NODE_CODES.includes(text) ? text : ''
}

function normalizeStatusCode(value) {
  const text = String(value || '').trim().toUpperCase()
  return STATUS_CODES.includes(text) ? text : ''
}

function normalizeText(value, maxLength = 1000) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function normalizeOptionalId(value) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null
}

function normalizeOptionalDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}$/.test(text)) return `${text}:00:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(text)) return `${text}:00`
  return /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(text) ? text : null
}

function parseStructuredContent(content) {
  const text = String(content || '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id ? Number(row.id) : null,
    package_id: Number(row.package_id),
    node_code: row.node_code || '',
    status_code: row.status_code || 'NOT_STARTED',
    block_reason: row.block_reason || '',
    owner_user_id: row.owner_user_id ? Number(row.owner_user_id) : null,
    owner_name: row.owner_name || '',
    expected_delivery_date: row.expected_delivery_date || null,
    started_by: row.started_by ? Number(row.started_by) : null,
    started_at: row.started_at || null,
    completed_by: row.completed_by ? Number(row.completed_by) : null,
    completed_at: row.completed_at || null,
    updated_by: row.updated_by ? Number(row.updated_by) : null,
    updated_at: row.updated_at || null,
  }
}

function mergeDefinition(definition, row, packageId) {
  const mapped = mapRow(row) || {
    id: null,
    package_id: Number(packageId),
    node_code: definition.node_code,
    status_code: 'NOT_STARTED',
    block_reason: '',
    started_by: null,
    started_at: null,
    completed_by: null,
    completed_at: null,
    updated_by: null,
    updated_at: null,
  }
  return {
    ...mapped,
    node_name: definition.node_name,
    owner_side: definition.owner_side,
    sort_order: definition.sort_order,
    depends_on: definition.depends_on,
  }
}

const MatrixPackageProductionNode = {
  NODE_DEFINITIONS,
  STATUS_CODES,

  async listByPackageId(packageId) {
    const matrixPackage = await MatrixPackage.getById(packageId)
    if (!matrixPackage) return null

    const [rows] = await pool.query(
      `SELECT
         id,
         package_id,
         node_code,
         status_code,
         block_reason,
         owner_user_id,
         owner_name,
         DATE_FORMAT(expected_delivery_date, '%Y-%m-%d %H:%i:%s') AS expected_delivery_date,
         started_by,
         DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s') AS started_at,
         completed_by,
         DATE_FORMAT(completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
         updated_by,
         DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM matrix_package_production_nodes
       WHERE package_id = ? AND node_code IN (?)
       ORDER BY FIELD(node_code, 'OPERATION_MATERIAL', 'DESIGN_PRODUCTION', 'BACKEND_SCRIPT')`,
      [matrixPackage.id, NODE_CODES],
    )
    const rowMap = new Map(rows.map((row) => [row.node_code, row]))
    return NODE_DEFINITIONS.map((definition) => mergeDefinition(definition, rowMap.get(definition.node_code), matrixPackage.id))
  },

  async updateStatus(packageId, nodeCode, payload = {}, userId) {
    const matrixPackage = await MatrixPackage.getById(packageId)
    if (!matrixPackage) return null

    const normalizedNodeCode = normalizeNodeCode(nodeCode)
    if (!normalizedNodeCode) {
      const err = new Error('production_node_invalid')
      err.statusCode = 400
      err.message = '生产节点不合法'
      throw err
    }

    const statusCode = normalizeStatusCode(payload?.status_code)
    if (!statusCode) {
      const err = new Error('production_node_status_invalid')
      err.statusCode = 400
      err.message = '节点状态不合法'
      throw err
    }

    if (statusCode === 'COMPLETED') {
      const definition = NODE_DEFINITIONS.find((item) => item.node_code === normalizedNodeCode)
      if (definition?.depends_on?.length) {
        const [dependencyRows] = await pool.query(
          `SELECT node_code, status_code
           FROM matrix_package_production_nodes
           WHERE package_id = ? AND node_code IN (?)`,
          [matrixPackage.id, definition.depends_on],
        )
        const completed = new Set(
          dependencyRows
            .filter((row) => row.status_code === 'COMPLETED')
            .map((row) => row.node_code),
        )
        const missing = definition.depends_on.filter((code) => !completed.has(code))
        if (missing.length) {
          const err = new Error('production_node_dependency_incomplete')
          err.statusCode = 400
          err.message = '前置节点未完成，暂不能标记完成'
          throw err
        }
      }

      if (normalizedNodeCode === 'OPERATION_MATERIAL') {
        const notes = await MatrixPackageSideNote.listByPackageId(matrixPackage.id)
        const operationNote = Array.isArray(notes)
          ? notes.find((item) => item.note_type === 'OPERATION')
          : null
        const operationContent = parseStructuredContent(operationNote?.content || operationNote?.confirmed_content || '')
        const requiredFields = [
          { key: 'materialUrl', label: '运营提供物料地址链接' },
          { key: 'appName', label: '应用名称' },
          { key: 'shortDescription', label: '简短说明' },
          { key: 'fullDescription', label: '完整说明' },
        ]
        const missingFields = requiredFields
          .filter((field) => !String(operationContent[field.key] || '').trim())
          .map((field) => field.label)
        if (missingFields.length) {
          const err = new Error('production_node_required_operation_fields_missing')
          err.statusCode = 400
          err.message = `请先补充：${missingFields.join('、')}`
          throw err
        }
      }
    }

    const blockReason = statusCode === 'BLOCKED' ? normalizeText(payload?.block_reason, 1000) : ''
    const ownerUserId = Object.prototype.hasOwnProperty.call(payload, 'owner_user_id')
      ? normalizeOptionalId(payload?.owner_user_id)
      : undefined
    const expectedDeliveryDate = Object.prototype.hasOwnProperty.call(payload, 'expected_delivery_date')
      ? normalizeOptionalDate(payload?.expected_delivery_date)
      : undefined
    let ownerName = undefined

    if (ownerUserId !== undefined) {
      if (!ownerUserId) {
        ownerName = ''
      } else {
        const [userRows] = await pool.query(
          `SELECT id, COALESCE(NULLIF(real_name, ''), username) AS display_name
           FROM users
           WHERE id = ?
           LIMIT 1`,
          [ownerUserId],
        )
        const ownerUser = userRows[0]
        if (!ownerUser) {
          const err = new Error('production_node_owner_invalid')
          err.statusCode = 400
          err.message = '负责人用户不存在'
          throw err
        }
        ownerName = ownerUser.display_name || `用户${ownerUserId}`
      }
    }

    await pool.query(
      `INSERT INTO matrix_package_production_nodes
       (package_id, node_code, status_code, block_reason, owner_user_id, owner_name, expected_delivery_date, started_by, started_at, completed_by, completed_at, updated_by)
       VALUES (
         ?, ?, ?, ?, ?, ?, ?,
         CASE WHEN ? IN ('IN_PROGRESS', 'COMPLETED') THEN ? ELSE NULL END,
         CASE WHEN ? IN ('IN_PROGRESS', 'COMPLETED') THEN NOW() ELSE NULL END,
         CASE WHEN ? = 'COMPLETED' THEN ? ELSE NULL END,
         CASE WHEN ? = 'COMPLETED' THEN NOW() ELSE NULL END,
         ?
       )
       ON DUPLICATE KEY UPDATE
         status_code = VALUES(status_code),
         block_reason = VALUES(block_reason),
         owner_user_id = CASE
           WHEN ? = 1 THEN VALUES(owner_user_id)
           ELSE owner_user_id
         END,
         owner_name = CASE
           WHEN ? = 1 AND VALUES(owner_user_id) IS NULL THEN ''
           WHEN VALUES(owner_name) <> '' THEN VALUES(owner_name)
           ELSE owner_name
         END,
         expected_delivery_date = CASE
           WHEN ? = 1 THEN VALUES(expected_delivery_date)
           ELSE expected_delivery_date
         END,
         started_by = CASE
           WHEN VALUES(status_code) IN ('IN_PROGRESS', 'COMPLETED') AND started_at IS NULL THEN VALUES(started_by)
           ELSE started_by
         END,
         started_at = CASE
           WHEN VALUES(status_code) IN ('IN_PROGRESS', 'COMPLETED') AND started_at IS NULL THEN NOW()
           ELSE started_at
         END,
         completed_by = CASE
           WHEN VALUES(status_code) = 'COMPLETED' THEN VALUES(completed_by)
           WHEN VALUES(status_code) <> 'COMPLETED' THEN NULL
           ELSE completed_by
         END,
         completed_at = CASE
           WHEN VALUES(status_code) = 'COMPLETED' THEN NOW()
           WHEN VALUES(status_code) <> 'COMPLETED' THEN NULL
           ELSE completed_at
         END,
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [
        matrixPackage.id,
        normalizedNodeCode,
        statusCode,
        blockReason,
        ownerUserId || null,
        ownerName || '',
        expectedDeliveryDate,
        statusCode,
        userId || null,
        statusCode,
        statusCode,
        userId || null,
        statusCode,
        userId || null,
        ownerUserId !== undefined ? 1 : 0,
        ownerUserId === null ? 1 : 0,
        expectedDeliveryDate !== undefined ? 1 : 0,
      ],
    )

    return this.listByPackageId(matrixPackage.id)
  },
}

module.exports = MatrixPackageProductionNode
