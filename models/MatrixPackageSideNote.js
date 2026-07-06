const pool = require('../utils/db')
const MatrixPackage = require('./MatrixPackage')

const NOTE_TYPES = ['DELIVERY', 'REQUIREMENT', 'OPERATION', 'FRONTEND', 'BACKEND', 'DEVOPS', 'DEVELOPMENT']

function normalizeNoteType(value) {
  const text = String(value || '').trim().toUpperCase()
  return NOTE_TYPES.includes(text) ? text : ''
}

function normalizeText(value, maxLength = 4000) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function mapRow(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    package_id: Number(row.package_id),
    note_type: row.note_type || '',
    content: row.content || '',
    confirmed_content: row.confirmed_content || '',
    is_confirmed: Number(row.is_confirmed || 0) === 1,
    confirmed_by: row.confirmed_by ? Number(row.confirmed_by) : null,
    confirmed_at: row.confirmed_at || null,
    created_by: row.created_by ? Number(row.created_by) : null,
    updated_by: row.updated_by ? Number(row.updated_by) : null,
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
         id,
         package_id,
         note_type,
         content,
         confirmed_content,
         CASE
           WHEN COALESCE(TRIM(content), '') <> ''
            AND COALESCE(content, '') = COALESCE(confirmed_content, '')
           THEN 1
           ELSE 0
         END AS is_confirmed,
         confirmed_by,
         DATE_FORMAT(confirmed_at, '%Y-%m-%d %H:%i:%s') AS confirmed_at,
         created_by,
         updated_by,
         DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
         DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM matrix_package_side_notes
       WHERE package_id = ?
       ORDER BY FIELD(note_type, 'DELIVERY', 'REQUIREMENT', 'OPERATION', 'FRONTEND', 'BACKEND', 'DEVOPS', 'DEVELOPMENT'), id ASC`,
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
          content: normalizeText(item?.content),
        }))
        .filter((item) => item.note_type)
      : []

    for (const note of normalizedNotes) {
      await pool.query(
        `INSERT INTO matrix_package_side_notes
         (package_id, note_type, content, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          content = VALUES(content),
          updated_by = VALUES(updated_by),
          updated_at = CURRENT_TIMESTAMP`,
        [matrixPackage.id, note.note_type, note.content, userId || null, userId || null],
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
