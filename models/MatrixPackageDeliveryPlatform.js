const pool = require('../utils/db')

const PLATFORM_DICT_KEY = 'matrix_package_delivery_platform'
const CHANNEL_DICT_KEY = 'matrix_package_delivery_channel'
const STATUS_DICT_KEY = 'matrix_package_delivery_status'
const MAX_PLATFORM_COUNT = 4
const PRODUCTION_COMPLETED_STATUS_CODES = ['DELIVERING', 'HOT_STANDBY', 'COLD_STANDBY']

function toPositiveInt(value) {
  const numeric = Number.parseInt(value, 10)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase()
}

function mapRow(row) {
  return {
    id: Number(row.id),
    package_id: Number(row.package_id),
    platform_code: row.platform_code || '',
    platform_name: row.platform_name || row.platform_code || '',
    platform_color: row.platform_color || 'default',
    channel_code: row.channel_code || '',
    channel_name: row.channel_name || row.channel_code || '',
    channel_color: row.channel_color || 'default',
    status_code: row.status_code || '',
    status_name: row.status_name || row.status_code || '',
    status_color: row.status_color || 'default',
    updated_by: row.updated_by ? Number(row.updated_by) : null,
    updated_by_name: row.updated_by_name || '',
    updated_at: row.updated_at || null,
  }
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    const err = new Error('投放平台配置必须为数组')
    err.statusCode = 400
    throw err
  }
  if (items.length > MAX_PLATFORM_COUNT) {
    const err = new Error(`最多配置 ${MAX_PLATFORM_COUNT} 个投放平台`)
    err.statusCode = 400
    throw err
  }

  const normalized = items.map((item) => ({
    platform_code: normalizeCode(item?.platform_code),
    channel_code: normalizeCode(item?.channel_code),
    status_code: normalizeCode(item?.status_code),
  }))
  const duplicateCodes = normalized
    .map((item) => item.platform_code)
    .filter((code, index, source) => code && source.indexOf(code) !== index)

  if (normalized.some((item) => !item.platform_code || !item.channel_code || !item.status_code)) {
    const err = new Error('投放平台、投放渠道和平台状态均为必填项')
    err.statusCode = 400
    throw err
  }
  if (duplicateCodes.length > 0) {
    const err = new Error('同一投放平台不能重复配置')
    err.statusCode = 400
    throw err
  }
  return normalized
}

async function validateCodes(connection, typeKey, codes, errorMessage) {
  const uniqueCodes = Array.from(new Set(codes))
  if (uniqueCodes.length === 0) return
  const [rows] = await connection.query(
    `SELECT item_code
     FROM config_dict_items
     WHERE type_key = ?
       AND enabled = 1
       AND item_code IN (${uniqueCodes.map(() => '?').join(', ')})`,
    [typeKey, ...uniqueCodes],
  )
  const validCodes = new Set(rows.map((row) => normalizeCode(row.item_code)))
  if (uniqueCodes.some((code) => !validCodes.has(code))) {
    const err = new Error(errorMessage)
    err.statusCode = 400
    throw err
  }
}

async function selectRows(connection, packageIds) {
  const ids = Array.from(new Set((packageIds || []).map(toPositiveInt).filter(Boolean)))
  if (ids.length === 0) return []
  const [rows] = await connection.query(
    `SELECT
       mdp.id,
       mdp.package_id,
       mdp.platform_code,
       platformDict.item_name AS platform_name,
       platformDict.color AS platform_color,
       mdp.channel_code,
       channelDict.item_name AS channel_name,
       channelDict.color AS channel_color,
       mdp.status_code,
       statusDict.item_name AS status_name,
       statusDict.color AS status_color,
       mdp.updated_by,
       COALESCE(NULLIF(updatedUser.real_name, ''), updatedUser.username) AS updated_by_name,
       DATE_FORMAT(mdp.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
     FROM matrix_package_delivery_platforms mdp
     LEFT JOIN config_dict_items platformDict
       ON platformDict.type_key = ?
      AND platformDict.item_code = mdp.platform_code
     LEFT JOIN config_dict_items channelDict
       ON channelDict.type_key = ?
      AND channelDict.item_code = mdp.channel_code
     LEFT JOIN config_dict_items statusDict
       ON statusDict.type_key = ?
      AND statusDict.item_code = mdp.status_code
     LEFT JOIN users updatedUser
       ON updatedUser.id = mdp.updated_by
     WHERE mdp.package_id IN (${ids.map(() => '?').join(', ')})
     ORDER BY COALESCE(platformDict.sort_order, 999), mdp.id`,
    [PLATFORM_DICT_KEY, CHANNEL_DICT_KEY, STATUS_DICT_KEY, ...ids],
  )
  return rows.map(mapRow)
}

const MatrixPackageDeliveryPlatform = {
  async getGlobalOverview() {
    const statusPlaceholders = PRODUCTION_COMPLETED_STATUS_CODES.map(() => '?').join(', ')
    const [[totalRows], [platformRows]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS production_completed_total
         FROM matrix_packages
         WHERE deleted_at IS NULL
           AND status_code IN (${statusPlaceholders})`,
        PRODUCTION_COMPLETED_STATUS_CODES,
      ),
      pool.query(
        `SELECT
           platformDict.item_code AS platform_code,
           platformDict.item_name AS platform_name,
           platformDict.color AS platform_color,
           COUNT(DISTINCT CASE WHEN mp.id IS NOT NULL AND mdp.status_code = 'ACTIVE' THEN mdp.package_id END) AS active_count,
           COUNT(DISTINCT CASE WHEN mp.id IS NOT NULL AND mdp.status_code = 'STOPPED' THEN mdp.package_id END) AS stopped_count,
           COUNT(DISTINCT CASE WHEN mp.id IS NOT NULL AND mdp.status_code = 'BANNED' THEN mdp.package_id END) AS banned_count
         FROM config_dict_items platformDict
         LEFT JOIN matrix_package_delivery_platforms mdp
           ON mdp.platform_code = platformDict.item_code
         LEFT JOIN matrix_packages mp
           ON mp.id = mdp.package_id
          AND mp.deleted_at IS NULL
          AND mp.status_code IN (${statusPlaceholders})
         WHERE platformDict.type_key = ?
           AND platformDict.enabled = 1
         GROUP BY
           platformDict.item_code,
           platformDict.item_name,
           platformDict.color,
           platformDict.sort_order,
           platformDict.id
         ORDER BY platformDict.sort_order, platformDict.id`,
        [...PRODUCTION_COMPLETED_STATUS_CODES, PLATFORM_DICT_KEY],
      ),
    ])

    const productionCompletedTotal = Number(totalRows?.[0]?.production_completed_total || 0)
    return {
      production_completed_total: productionCompletedTotal,
      items: (platformRows || []).map((row) => {
        const activeCount = Number(row.active_count || 0)
        const stoppedCount = Number(row.stopped_count || 0)
        const bannedCount = Number(row.banned_count || 0)
        return {
          platform_code: row.platform_code || '',
          platform_name: row.platform_name || row.platform_code || '',
          platform_color: row.platform_color || 'default',
          active_count: activeCount,
          available_count: Math.max(0, productionCompletedTotal - activeCount - stoppedCount - bannedCount),
          banned_count: bannedCount,
        }
      }),
    }
  },

  async listByPackageId(packageId) {
    return selectRows(pool, [packageId])
  },

  async listByPackageIds(packageIds) {
    const rows = await selectRows(pool, packageIds)
    const grouped = new Map()
    rows.forEach((row) => {
      if (!grouped.has(row.package_id)) grouped.set(row.package_id, [])
      grouped.get(row.package_id).push(row)
    })
    return grouped
  },

  async replaceByPackageId(packageIdValue, itemsValue, userIdValue) {
    const packageId = toPositiveInt(packageIdValue)
    const userId = toPositiveInt(userIdValue)
    if (!packageId) {
      const err = new Error('矩阵包ID不合法')
      err.statusCode = 400
      throw err
    }
    const items = normalizeItems(itemsValue)
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const [packageRows] = await connection.query(
        `SELECT id, status_code
         FROM matrix_packages
         WHERE id = ? AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [packageId],
      )
      const matrixPackage = packageRows[0]
      if (!matrixPackage) {
        const err = new Error('矩阵包不存在')
        err.statusCode = 404
        throw err
      }
      if (normalizeCode(matrixPackage.status_code) !== 'DELIVERING') {
        const err = new Error('只有运营中的矩阵包可以编辑投放平台信息概览')
        err.statusCode = 400
        throw err
      }

      await validateCodes(connection, PLATFORM_DICT_KEY, items.map((item) => item.platform_code), '投放平台不合法')
      await validateCodes(connection, CHANNEL_DICT_KEY, items.map((item) => item.channel_code), '投放渠道不合法')
      await validateCodes(connection, STATUS_DICT_KEY, items.map((item) => item.status_code), '平台状态不合法')

      const [existingRows] = await connection.query(
        `SELECT id, platform_code, channel_code, status_code
         FROM matrix_package_delivery_platforms
         WHERE package_id = ?
         FOR UPDATE`,
        [packageId],
      )
      const existingByPlatform = new Map(existingRows.map((row) => [normalizeCode(row.platform_code), row]))
      const nextPlatformCodes = new Set(items.map((item) => item.platform_code))
      const removedIds = existingRows
        .filter((row) => !nextPlatformCodes.has(normalizeCode(row.platform_code)))
        .map((row) => Number(row.id))
        .filter(Boolean)

      if (removedIds.length > 0) {
        await connection.query(
          `DELETE FROM matrix_package_delivery_platforms
           WHERE package_id = ? AND id IN (${removedIds.map(() => '?').join(', ')})`,
          [packageId, ...removedIds],
        )
      }

      for (const item of items) {
        const existing = existingByPlatform.get(item.platform_code)
        if (!existing) {
          await connection.query(
            `INSERT INTO matrix_package_delivery_platforms
             (package_id, platform_code, channel_code, status_code, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [packageId, item.platform_code, item.channel_code, item.status_code, userId, userId],
          )
          continue
        }
        if (
          normalizeCode(existing.channel_code) !== item.channel_code ||
          normalizeCode(existing.status_code) !== item.status_code
        ) {
          await connection.query(
            `UPDATE matrix_package_delivery_platforms
             SET channel_code = ?, status_code = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [item.channel_code, item.status_code, userId, existing.id],
          )
        }
      }

      await connection.commit()
      return this.listByPackageId(packageId)
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  },
}

module.exports = MatrixPackageDeliveryPlatform
