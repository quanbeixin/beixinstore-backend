const pool = require('../utils/db')

const SOURCE_AUTO_T = 'AUTO_T'
const DERIVED_NODE_OFFSETS = {
  BACKEND_SCRIPT: -1,
  OPERATION_MATERIAL: -2,
  DESIGN_PRODUCTION: -2,
}
const DERIVED_SIDE_NOTE_OFFSETS = {
  DESIGN: -2,
  OPERATION: -2,
  DEVOPS: -2,
  FRONTEND: -1,
  DELIVERY: -1,
  BACKEND: -1,
  ADVERTISING: 0,
}

function normalizeText(value, maxLength = 255) {
  const text = String(value || '').trim()
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function toPositiveInt(value) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

function parseScheduleDate(value) {
  const text = normalizeText(value, 32)
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2})(?::(\d{2})(?::(\d{2}))?)?)?/)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] || 0),
    minute: Number(match[5] || 0),
    second: Number(match[6] || 0),
  }
}

function addDays(parts, dayOffset) {
  if (!parts) return null
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset, parts.hour, parts.minute, parts.second))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  }
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDate(parts) {
  if (!parts) return null
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

function formatDateTime(parts) {
  if (!parts) return null
  return `${formatDate(parts)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`
}

async function upsertProductionNodeAutoDate(conn, packageId, nodeCode, expectedDeliveryDate, operatorUserId = null, { force = false } = {}) {
  await conn.query(
    `INSERT INTO matrix_package_production_nodes
       (package_id, node_code, status_code, expected_delivery_date, expected_delivery_date_source, updated_by)
     VALUES (?, ?, 'NOT_STARTED', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       expected_delivery_date = CASE
         WHEN ? = 1 OR expected_delivery_date IS NULL OR expected_delivery_date_source = ? THEN VALUES(expected_delivery_date)
         ELSE expected_delivery_date
       END,
       expected_delivery_date_source = CASE
         WHEN ? = 1 OR expected_delivery_date IS NULL OR expected_delivery_date_source = ? THEN VALUES(expected_delivery_date_source)
         ELSE expected_delivery_date_source
       END,
       updated_by = CASE
         WHEN ? = 1 OR expected_delivery_date IS NULL OR expected_delivery_date_source = ? THEN VALUES(updated_by)
         ELSE updated_by
       END,
       updated_at = CASE
         WHEN ? = 1 OR expected_delivery_date IS NULL OR expected_delivery_date_source = ? THEN CURRENT_TIMESTAMP
         ELSE updated_at
       END`,
    [
      packageId,
      nodeCode,
      expectedDeliveryDate,
      SOURCE_AUTO_T,
      operatorUserId || null,
      force ? 1 : 0,
      SOURCE_AUTO_T,
      force ? 1 : 0,
      SOURCE_AUTO_T,
      force ? 1 : 0,
      SOURCE_AUTO_T,
      force ? 1 : 0,
      SOURCE_AUTO_T,
    ],
  )
}

async function upsertSideNoteAutoDate(conn, packageId, noteType, expectedDeliveryDate, operatorUserId = null, { force = false } = {}) {
  await conn.query(
    `INSERT INTO matrix_package_side_notes
       (package_id, note_type, content, expected_delivery_date, expected_delivery_date_source, created_by, updated_by)
     VALUES (?, ?, '', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       expected_delivery_date = CASE
         WHEN ? = 1 OR expected_delivery_date IS NULL OR expected_delivery_date_source = ? THEN VALUES(expected_delivery_date)
         ELSE expected_delivery_date
       END,
       expected_delivery_date_source = CASE
         WHEN ? = 1 OR expected_delivery_date IS NULL OR expected_delivery_date_source = ? THEN VALUES(expected_delivery_date_source)
         ELSE expected_delivery_date_source
       END,
       updated_by = CASE
         WHEN ? = 1 OR expected_delivery_date IS NULL OR expected_delivery_date_source = ? THEN VALUES(updated_by)
         ELSE updated_by
       END,
       updated_at = CASE
         WHEN ? = 1 OR expected_delivery_date IS NULL OR expected_delivery_date_source = ? THEN CURRENT_TIMESTAMP
         ELSE updated_at
       END`,
    [
      packageId,
      noteType,
      expectedDeliveryDate,
      SOURCE_AUTO_T,
      operatorUserId || null,
      operatorUserId || null,
      force ? 1 : 0,
      SOURCE_AUTO_T,
      force ? 1 : 0,
      SOURCE_AUTO_T,
      force ? 1 : 0,
      SOURCE_AUTO_T,
      force ? 1 : 0,
      SOURCE_AUTO_T,
    ],
  )
}

async function syncFromFrontendBuildT({ packageId, frontendBuildAt, operatorUserId = null } = {}) {
  const normalizedPackageId = toPositiveInt(packageId)
  const tParts = parseScheduleDate(frontendBuildAt)
  if (!normalizedPackageId || !tParts) {
    return {
      synced: false,
      reason: 'INVALID_PACKAGE_OR_T',
    }
  }

  const tDateTime = formatDateTime(tParts)
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    await conn.query(
      `UPDATE matrix_packages
       SET expected_cold_ready_date = ?,
           expected_cold_ready_date_source = ?,
           side_check_deadline_at = CASE
             WHEN side_check_deadline_at IS NULL OR side_check_deadline_source = ? THEN ?
             ELSE side_check_deadline_at
           END,
           side_check_deadline_source = CASE
             WHEN side_check_deadline_at IS NULL OR side_check_deadline_source = ? THEN ?
             ELSE side_check_deadline_source
           END,
           updated_by = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND deleted_at IS NULL`,
      [
        tDateTime,
        SOURCE_AUTO_T,
        SOURCE_AUTO_T,
        formatDateTime(addDays(tParts, -1)),
        SOURCE_AUTO_T,
        SOURCE_AUTO_T,
        operatorUserId || null,
        normalizedPackageId,
      ],
    )

    await upsertProductionNodeAutoDate(conn, normalizedPackageId, 'FRONTEND_BUILD', tDateTime, operatorUserId, { force: true })

    for (const [nodeCode, offset] of Object.entries(DERIVED_NODE_OFFSETS)) {
      await upsertProductionNodeAutoDate(
        conn,
        normalizedPackageId,
        nodeCode,
        formatDateTime(addDays(tParts, offset)),
        operatorUserId,
      )
    }

    for (const [noteType, offset] of Object.entries(DERIVED_SIDE_NOTE_OFFSETS)) {
      await upsertSideNoteAutoDate(
        conn,
        normalizedPackageId,
        noteType,
        formatDateTime(addDays(tParts, offset)),
        operatorUserId,
      )
    }

    const [[packageRow]] = await conn.query(
      `SELECT linked_demand_id
       FROM matrix_packages
       WHERE id = ?
         AND deleted_at IS NULL
       LIMIT 1`,
      [normalizedPackageId],
    )
    const demandId = normalizeText(packageRow?.linked_demand_id, 64)
    const expectedReleaseDate = formatDate(addDays(tParts, 2))
    if (demandId && expectedReleaseDate) {
      await conn.query(
        `UPDATE work_demands
         SET expected_release_date = ?,
             expected_release_date_source = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND (expected_release_date IS NULL OR expected_release_date_source = ?)`,
        [expectedReleaseDate, SOURCE_AUTO_T, demandId, SOURCE_AUTO_T],
      )
    }

    await conn.commit()
    return {
      synced: true,
      package_id: normalizedPackageId,
      frontend_build_at: tDateTime,
      expected_production_date: tDateTime,
      expected_release_date: expectedReleaseDate,
    }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

module.exports = {
  SOURCE_AUTO_T,
  syncFromFrontendBuildT,
}
