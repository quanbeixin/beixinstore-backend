const pool = require('../utils/db')
const MatrixPackage = require('./MatrixPackage')

const NOTE_TYPES = ['DELIVERY', 'REQUIREMENT', 'DESIGN', 'OPERATION', 'FRONTEND', 'BACKEND', 'DEVOPS', 'ADVERTISING', 'DEVELOPMENT']

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
  const text = normalizeText(value, 1000000)
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

function normalizeOptionalDate(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}$/.test(text)) return `${text}:00:00`
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(text)) return `${text}:00`
  return /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(text) ? text : null
}

async function resolveOwnerName(ownerUserId) {
  if (!ownerUserId) return ''
  const [userRows] = await pool.query(
    `SELECT id, COALESCE(NULLIF(real_name, ''), username) AS display_name
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [ownerUserId],
  )
  const ownerUser = userRows[0]
  if (!ownerUser) {
    const err = new Error('side_note_owner_invalid')
    err.statusCode = 400
    err.message = '侧信息负责人用户不存在'
    throw err
  }
  return ownerUser.display_name || `用户${ownerUserId}`
}

function normalizeScheduleSource(value, fallback = '') {
  const text = String(value || '').trim().toUpperCase()
  if (text === 'AUTO_T' || text === 'MANUAL') return text
  return fallback
}

function parseJsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  const text = String(value || '').trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function hasMeaningfulContent(value) {
  const text = String(value || '').trim()
  if (!text) return false
  const parsed = parseJsonObject(text)
  if (!parsed) return true
  return Object.values(parsed).some((item) => hasMeaningfulFieldValue(item))
}

function hasMeaningfulFieldValue(value) {
  if (value === false || value === true || Number.isFinite(value)) return true
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulFieldValue(item))
  if (value && typeof value === 'object') {
    if (value.object_key || value.object_url || value.file_name || value.download_url || value.preview_url) return true
    return Object.values(value).some((item) => hasMeaningfulFieldValue(item))
  }
  return Boolean(String(value || '').trim())
}

function mergeJsonContentPreservingExisting(nextContent, existingContent) {
  const nextParsed = parseJsonObject(nextContent)
  const existingParsed = parseJsonObject(existingContent)
  if (!nextParsed || !existingParsed) return nextContent

  const merged = { ...nextParsed }
  Object.entries(existingParsed).forEach(([key, existingValue]) => {
    if (
      hasMeaningfulFieldValue(existingValue) &&
      !hasMeaningfulFieldValue(nextParsed[key])
    ) {
      merged[key] = existingValue
    }
  })
  return JSON.stringify(stripTransientAttachmentFields(merged))
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
    expected_delivery_date: row.expected_delivery_date || null,
    expected_delivery_date_source: row.expected_delivery_date_source || '',
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
         DATE_FORMAT(mpn.expected_delivery_date, '%Y-%m-%d %H:%i:%s') AS expected_delivery_date,
         mpn.expected_delivery_date_source,
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
       ORDER BY FIELD(mpn.note_type, 'DELIVERY', 'REQUIREMENT', 'DESIGN', 'OPERATION', 'FRONTEND', 'BACKEND', 'DEVOPS', 'ADVERTISING', 'DEVELOPMENT'), mpn.id ASC`,
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
          expected_delivery_date: Object.prototype.hasOwnProperty.call(item || {}, 'expected_delivery_date')
            ? normalizeOptionalDate(item?.expected_delivery_date)
            : undefined,
          expected_delivery_date_source: normalizeScheduleSource(item?.expected_delivery_date_source),
        }))
        .filter((item) => item.note_type)
      : []

    const [existingRows] = await pool.query(
      `SELECT note_type, content
       FROM matrix_package_side_notes
       WHERE package_id = ?`,
      [matrixPackage.id],
    )
    const existingContentMap = new Map(
      (existingRows || []).map((row) => [row.note_type, String(row.content || '').trim()]),
    )

    for (const note of normalizedNotes) {
      const existingContent = existingContentMap.get(note.note_type) || ''
      if (!hasMeaningfulContent(note.content) && hasMeaningfulContent(existingContent)) {
        note.content = existingContent
      } else if (hasMeaningfulContent(existingContent)) {
        note.content = mergeJsonContentPreservingExisting(note.content, existingContent)
      }

      const ownerName = await resolveOwnerName(note.owner_user_id)
      await pool.query(
        `INSERT INTO matrix_package_side_notes
         (package_id, note_type, content, owner_user_id, owner_name, expected_delivery_date, expected_delivery_date_source, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          content = VALUES(content),
          owner_user_id = VALUES(owner_user_id),
          owner_name = VALUES(owner_name),
          expected_delivery_date = CASE
            WHEN ? = 1 THEN VALUES(expected_delivery_date)
            ELSE expected_delivery_date
          END,
          expected_delivery_date_source = CASE
            WHEN ? = 1 THEN VALUES(expected_delivery_date_source)
            ELSE expected_delivery_date_source
          END,
          updated_by = VALUES(updated_by),
          updated_at = CURRENT_TIMESTAMP`,
        [
          matrixPackage.id,
          note.note_type,
          note.content,
          note.owner_user_id,
          ownerName,
          note.expected_delivery_date === undefined ? null : note.expected_delivery_date,
          note.expected_delivery_date === undefined
            ? null
            : (note.expected_delivery_date ? (note.expected_delivery_date_source || 'MANUAL') : null),
          userId || null,
          userId || null,
          note.expected_delivery_date !== undefined ? 1 : 0,
          note.expected_delivery_date !== undefined ? 1 : 0,
        ],
      )
    }

    return this.listByPackageId(matrixPackage.id)
  },

  async patchFields(packageId, noteType, payload = {}, userId) {
    const matrixPackage = await MatrixPackage.getById(packageId)
    if (!matrixPackage) return null

    const normalizedType = normalizeNoteType(noteType)
    if (!normalizedType) {
      const err = new Error('note_type_invalid')
      err.statusCode = 400
      err.message = '补充信息类型不合法'
      throw err
    }

    const hasFields = payload && Object.prototype.hasOwnProperty.call(payload, 'fields')
    const fields = hasFields && payload.fields && typeof payload.fields === 'object' && !Array.isArray(payload.fields)
      ? payload.fields
      : null
    const hasOwner = Object.prototype.hasOwnProperty.call(payload || {}, 'owner_user_id')
    const hasExpectedDate = Object.prototype.hasOwnProperty.call(payload || {}, 'expected_delivery_date')
    const hasExpectedDateSource = Object.prototype.hasOwnProperty.call(payload || {}, 'expected_delivery_date_source')

    if (!fields && !hasOwner && !hasExpectedDate && !hasExpectedDateSource) {
      const err = new Error('side_note_patch_empty')
      err.statusCode = 400
      err.message = '请提供需要保存的字段'
      throw err
    }

    const [rows] = await pool.query(
      `SELECT content, owner_user_id, owner_name, expected_delivery_date, expected_delivery_date_source
       FROM matrix_package_side_notes
       WHERE package_id = ? AND note_type = ?
       LIMIT 1`,
      [matrixPackage.id, normalizedType],
    )
    const existing = rows[0] || {}
    const existingContent = parseJsonObject(existing.content) || {}
    const nextContent = fields ? { ...existingContent, ...stripTransientAttachmentFields(fields) } : existingContent
    const normalizedContent = fields
      ? normalizeNoteContent(JSON.stringify(nextContent))
      : normalizeNoteContent(existing.content || '')

    const ownerUserId = hasOwner ? normalizeOptionalId(payload.owner_user_id) : normalizeOptionalId(existing.owner_user_id)
    const ownerName = hasOwner ? await resolveOwnerName(ownerUserId) : (existing.owner_name || '')
    const expectedDeliveryDate = hasExpectedDate
      ? normalizeOptionalDate(payload.expected_delivery_date)
      : (existing.expected_delivery_date || null)
    const expectedDeliveryDateSource = hasExpectedDate
      ? (expectedDeliveryDate ? normalizeScheduleSource(payload.expected_delivery_date_source, 'MANUAL') : null)
      : (hasExpectedDateSource
        ? normalizeScheduleSource(payload.expected_delivery_date_source)
        : (existing.expected_delivery_date_source || null))

    await pool.query(
      `INSERT INTO matrix_package_side_notes
       (package_id, note_type, content, owner_user_id, owner_name, expected_delivery_date, expected_delivery_date_source, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        content = VALUES(content),
        owner_user_id = VALUES(owner_user_id),
        owner_name = VALUES(owner_name),
        expected_delivery_date = VALUES(expected_delivery_date),
        expected_delivery_date_source = VALUES(expected_delivery_date_source),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP`,
      [
        matrixPackage.id,
        normalizedType,
        normalizedContent,
        ownerUserId,
        ownerName,
        expectedDeliveryDate,
        expectedDeliveryDateSource,
        userId || null,
        userId || null,
      ],
    )

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
