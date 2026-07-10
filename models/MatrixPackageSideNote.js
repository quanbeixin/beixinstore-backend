const pool = require('../utils/db')
const MatrixPackage = require('./MatrixPackage')

const NOTE_TYPES = ['DELIVERY', 'REQUIREMENT', 'DESIGN', 'OPERATION', 'FRONTEND', 'BACKEND', 'DEVOPS', 'DEVELOPMENT']

function normalizeNoteType(value) {
  const text = String(value || '').trim().toUpperCase()
  return NOTE_TYPES.includes(text) ? text : ''
}

function normalizeText(value, maxLength = 4000) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function stripTransientAttachmentFields(value) {
  if (Array.isArray(value)) {
    return value.map(stripTransientAttachmentFields)
  }
  if (!value || typeof value !== 'object') return value

  const nextValue = {}
  Object.entries(value).forEach(([key, nestedValue]) => {
    if (key === 'preview_url' || key === 'download_url') return
    nextValue[key] = stripTransientAttachmentFields(nestedValue)
  })
  return nextValue
}

function normalizeNoteContent(value) {
  const text = normalizeText(value, 60000)
  if (!text) return ''

  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return text
    return JSON.stringify(stripTransientAttachmentFields(parsed))
  } catch {
    return text
  }
}

function normalizeOptionalId(value) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function mapRow(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    package_id: Number(row.package_id),
    note_type: row.note_type || '',
    content: row.content || '',
    confirmed_content: row.confirmed_content || '',
    owner_user_id: row.owner_user_id ? Number(row.owner_user_id) : null,
    owner_name: row.owner_display_name || row.owner_name || '',
    is_confirmed: Number(row.is_confirmed || 0) === 1,
    confirmed_by: row.confirmed_by ? Number(row.confirmed_by) : null,
    confirmed_at: row.confirmed_at || null,
    created_by: row.created_by ? Number(row.created_by) : null,
    updated_by: row.updated_by ? Number(row.updated_by) : null,
    updated_by_name: row.updated_by_display_name || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }
}

const MatrixPackageSideNote = {
  NOTE_TYPES,

  async listByPackageId(packageId) {
    const matrixPackage = await MatrixPackage.getById(packageId)
    if (!matrixPackage) return null

    const [rows] = await pool.query(
      `SELECT
         mpn.id,
         mpn.package_id,
         mpn.note_type,
         mpn.content,
         mpn.confirmed_content,
         mpn.owner_user_id,
         mpn.owner_name,
         COALESCE(NULLIF(ownerUser.real_name, ''), ownerUser.username) AS owner_display_name,
         CASE
           WHEN COALESCE(TRIM(mpn.content), '') <> ''
            AND COALESCE(mpn.content, '') = COALESCE(mpn.confirmed_content, '')
           THEN 1
           ELSE 0
         END AS is_confirmed,
         mpn.confirmed_by,
         DATE_FORMAT(mpn.confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmed_at,
         mpn.created_by,
         mpn.updated_by,
         COALESCE(NULLIF(updatedUser.real_name, ''), updatedUser.username) AS updated_by_display_name,
         DATE_FORMAT(mpn.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(mpn.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM matrix_package_side_notes mpn
       LEFT JOIN users ownerUser
         ON ownerUser.id = mpn.owner_user_id
       LEFT JOIN users updatedUser
         ON updatedUser.id = mpn.updated_by
       WHERE mpn.package_id = ?
       ORDER BY FIELD(mpn.note_type, 'DELIVERY', 'REQUIREMENT', 'DESIGN', 'OPERATION', 'FRONTEND', 'BACKEND', 'DEVOPS', 'DEVELOPMENT'), mpn.id ASC`,
      [matrixPackage.id],
    )

    return rows.map(mapRow)
  },

  async saveBatch(packageId, notes = [], userId) {
    const matrixPackage = await MatrixPackage.getById(packageId)
    if (!matrixPackage) return null

    const normalizedNotes = Array.isArray(notes)
      ? notes
        .map((item) => ({
          note_type: normalizeNoteType(item?.note_type),
          content: normalizeNoteContent(item?.content),
          owner_user_id: normalizeOptionalId(item?.owner_user_id),
        }))
        .filter((item) => item.note_type)
      : []

    for (const note of normalizedNotes) {
      let ownerName = ''
      if (note.owner_user_id) {
        const [userRows] = await pool.query(
          `SELECT id, COALESCE(NULLIF(real_name, ''), username) AS display_name
           FROM users
           WHERE id = ?
           LIMIT 1`,
          [note.owner_user_id],
        )
        const ownerUser = userRows[0]
        if (!ownerUser) {
          const err = new Error('side_note_owner_invalid')
          err.statusCode = 400
          err.message = '侧信息负责人用户不存在'
          throw err
        }
        ownerName = ownerUser.display_name || `用户${note.owner_user_id}`
      }
      await pool.query(
        `INSERT INTO matrix_package_side_notes
         (package_id, note_type, content, owner_user_id, owner_name, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          content = VALUES(content),
          owner_user_id = VALUES(owner_user_id),
          owner_name = VALUES(owner_name),
          updated_by = VALUES(updated_by),
          updated_at = CURRENT_TIMESTAMP`,
        [matrixPackage.id, note.note_type, note.content, note.owner_user_id, ownerName, userId || null, userId || null],
      )
    }

    return this.listByPackageId(matrixPackage.id)
  },

  async confirm(packageId, noteType, userId) {
    const matrixPackage = await MatrixPackage.getById(packageId)
    if (!matrixPackage) return null

    const normalizedType = normalizeNoteType(noteType)
    if (!normalizedType) {
      const err = new Error('note_type_invalid')
      err.statusCode = 400
      err.message = '补充信息类型不合法'
      throw err
    }

    const [rows] = await pool.query(
      `SELECT id, content
       FROM matrix_package_side_notes
       WHERE package_id = ? AND note_type = ?
       LIMIT 1`,
      [matrixPackage.id, normalizedType],
    )
    const existing = rows[0]
    if (!existing || !String(existing.content || '').trim()) {
      const err = new Error('note_content_required')
      err.statusCode = 400
      err.message = '请先填写补充信息后再确认'
      throw err
    }

    await pool.query(
      `UPDATE matrix_package_side_notes
       SET confirmed_content = content,
           confirmed_by = ?,
           confirmed_at = NOW(),
           updated_by = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE package_id = ? AND note_type = ?`,
      [userId || null, userId || null, matrixPackage.id, normalizedType],
    )

    return this.listByPackageId(matrixPackage.id)
  },
}

module.exports = MatrixPackageSideNote
