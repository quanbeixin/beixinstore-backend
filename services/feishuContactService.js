const https = require('https')
const http = require('http')
const FeishuContact = require('../models/FeishuContact')

const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_PAGE_SIZE = 50
const DETAIL_ENRICH_CONCURRENCY = 8
const USER_BATCH_SIZE = 50

function normalizeText(value, maxLength = 0) {
  const text = String(value || '').trim()
  if (!text) return ''
  return maxLength > 0 ? text.slice(0, maxLength) : text
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  return fallback
}

function getConfig() {
  const appId = normalizeText(process.env.FEISHU_APP_ID || process.env.LARK_APP_ID, 128)
  const appSecret = normalizeText(process.env.FEISHU_APP_SECRET || process.env.LARK_APP_SECRET, 255)
  const baseUrl = normalizeText(process.env.FEISHU_BASE_URL, 255) || 'https://open.feishu.cn'
  const rootDepartmentId = normalizeText(process.env.FEISHU_ROOT_DEPARTMENT_ID, 191) || '0'
  const departmentIdType = normalizeText(process.env.FEISHU_DEPARTMENT_ID_TYPE, 64) || 'department_id'
  const userIdType = normalizeText(process.env.FEISHU_USER_ID_TYPE, 64) || 'open_id'
  const timeoutMs = Number(process.env.FEISHU_HTTP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)

  const missingKeys = []
  if (!appId) missingKeys.push('FEISHU_APP_ID')
  if (!appSecret) missingKeys.push('FEISHU_APP_SECRET')

  return {
    appId,
    appSecret,
    baseUrl,
    rootDepartmentId,
    departmentIdType,
    userIdType,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    configured: missingKeys.length === 0,
    missingKeys,
  }
}

function performJsonRequest(method, targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl)
    const transport = url.protocol === 'http:' ? http : https
    const body = options.body ? JSON.stringify(options.body) : ''
    const headers = {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    }

    const request = transport.request(
      {
        method,
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers,
        timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let payload = null
          try {
            payload = raw ? JSON.parse(raw) : {}
          } catch {
            payload = null
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            const err = new Error(
              payload?.msg ||
                payload?.message ||
                `飞书接口请求失败（HTTP ${response.statusCode || 500}）`,
            )
            err.status = response.statusCode || 500
            err.payload = payload
            err.raw = raw
            reject(err)
            return
          }

          resolve(payload || {})
        })
      },
    )

    request.on('error', reject)
    request.on('timeout', () => {
      request.destroy(new Error('请求飞书接口超时'))
    })

    if (body) {
      request.write(body)
    }

    request.end()
  })
}

function buildUrl(baseUrl, pathname, query = {}) {
  const url = new URL(pathname, baseUrl)
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      value.forEach((item) => {
        const normalized = String(item || '').trim()
        if (!normalized) return
        url.searchParams.append(key, normalized)
      })
      return
    }
    url.searchParams.set(key, String(value))
  })
  return url.toString()
}

function chunkArray(list = [], size = USER_BATCH_SIZE) {
  const chunks = []
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size))
  }
  return chunks
}

function getPrimaryDepartmentId(user = {}) {
  if (Array.isArray(user.orders) && user.orders.length > 0) {
    const firstOrder = user.orders.find((item) => normalizeText(item?.department_id))
    if (firstOrder?.department_id) return String(firstOrder.department_id)
  }

  const departmentIds = Array.isArray(user.department_ids) ? user.department_ids : []
  return departmentIds.length > 0 ? String(departmentIds[0]) : ''
}

function buildDepartmentNameList(departmentIds, departmentMap) {
  return departmentIds
    .map((departmentId) => departmentMap.get(String(departmentId))?.name || '')
    .filter(Boolean)
}

function normalizeUserStatus(status = {}) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) return {}
  return {
    is_frozen: toBoolean(status.is_frozen, false),
    is_resigned: toBoolean(status.is_resigned, false),
    is_activated: toBoolean(status.is_activated, true),
    is_exited: toBoolean(status.is_exited, false),
    is_unjoin: toBoolean(status.is_unjoin, false),
  }
}

async function getTenantAccessToken(config) {
  const payload = await performJsonRequest(
    'POST',
    buildUrl(config.baseUrl, '/open-apis/auth/v3/tenant_access_token/internal'),
    {
      body: {
        app_id: config.appId,
        app_secret: config.appSecret,
      },
      timeoutMs: config.timeoutMs,
    },
  )

  if (Number(payload?.code || 0) !== 0 || !payload?.tenant_access_token) {
    const err = new Error(payload?.msg || '获取飞书 tenant_access_token 失败')
    err.payload = payload
    throw err
  }

  return {
    tenantAccessToken: payload.tenant_access_token,
    tenantKey: normalizeText(payload.tenant_key, 128),
  }
}

async function fetchPagedItems(config, token, pathname, query = {}) {
  const items = []
  let pageToken = ''
  let hasMore = true

  while (hasMore) {
    const response = await performJsonRequest(
      'GET',
      buildUrl(config.baseUrl, pathname, {
        ...query,
        page_size: query.page_size || DEFAULT_PAGE_SIZE,
        ...(pageToken ? { page_token: pageToken } : {}),
      }),
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeoutMs: config.timeoutMs,
      },
    )

    if (Number(response?.code || 0) !== 0) {
      const err = new Error(response?.msg || '飞书分页接口返回异常')
      err.payload = response
      throw err
    }

    const batchItems = Array.isArray(response?.data?.items) ? response.data.items : []
    items.push(...batchItems)
    hasMore = Boolean(response?.data?.has_more)
    pageToken = normalizeText(response?.data?.page_token)
    if (hasMore && !pageToken) {
      break
    }
  }

  return items
}

function normalizeDepartmentIdType(value, fallback = 'department_id') {
  const type = normalizeText(value, 64)
  if (type === 'open_department_id') return 'open_department_id'
  if (type === 'department_id') return 'department_id'
  return fallback
}

function buildDepartmentRefFromRecord(department = {}, preferredType = 'department_id') {
  const openDepartmentId = normalizeText(department?.open_department_id, 191)
  const internalDepartmentId = normalizeText(department?.department_id, 191)
  const normalizedPreferredType = normalizeDepartmentIdType(preferredType)

  if (normalizedPreferredType === 'open_department_id' && openDepartmentId) {
    return { id: openDepartmentId, id_type: 'open_department_id' }
  }

  if (normalizedPreferredType === 'department_id' && internalDepartmentId) {
    return { id: internalDepartmentId, id_type: 'department_id' }
  }

  if (internalDepartmentId) {
    return { id: internalDepartmentId, id_type: 'department_id' }
  }

  if (openDepartmentId) {
    return { id: openDepartmentId, id_type: 'open_department_id' }
  }

  return null
}

function setDepartmentMapEntry(departmentMap, department = {}) {
  const openDepartmentId = normalizeText(department?.open_department_id, 191)
  const internalDepartmentId = normalizeText(department?.department_id, 191)
  const name =
    normalizeText(department?.name, 191) ||
    normalizeText(department?.i18n_name?.zh_cn, 191) ||
    normalizeText(department?.i18n_name?.en_us, 191)

  const meta = {
    id: internalDepartmentId || openDepartmentId,
    name,
    leader_user_id: normalizeText(department?.leader_user_id, 191) || null,
    raw_payload: department,
  }

  if (internalDepartmentId) {
    departmentMap.set(internalDepartmentId, meta)
  }
  if (openDepartmentId) {
    departmentMap.set(openDepartmentId, meta)
  }
}

async function fetchDepartmentChildren(config, token, departmentRef) {
  return fetchPagedItems(
    config,
    token,
    `/open-apis/contact/v3/departments/${encodeURIComponent(String(departmentRef.id))}/children`,
    {
      department_id_type: normalizeDepartmentIdType(departmentRef.id_type, config.departmentIdType),
      user_id_type: config.userIdType,
      fetch_child: false,
    },
  )
}

async function fetchDepartmentUsers(config, token, departmentRef) {
  return fetchPagedItems(config, token, '/open-apis/contact/v3/users/find_by_department', {
    department_id: departmentRef.id,
    department_id_type: normalizeDepartmentIdType(departmentRef.id_type, config.departmentIdType),
    user_id_type: config.userIdType,
  })
}

async function fetchUserDetail(config, token, userRef) {
  const userId = normalizeText(userRef?.id, 191)
  if (!userId) return null

  const response = await performJsonRequest(
    'GET',
    buildUrl(config.baseUrl, `/open-apis/contact/v3/users/${encodeURIComponent(userId)}`, {
      user_id_type: normalizeText(userRef?.id_type, 64) || config.userIdType,
      department_id_type: config.departmentIdType,
    }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeoutMs: config.timeoutMs,
    },
  )

  if (Number(response?.code || 0) !== 0) {
    const err = new Error(response?.msg || '飞书用户详情接口返回异常')
    err.payload = response
    throw err
  }

  return response?.data?.user || null
}

async function fetchUsersBatch(config, token, userIds = [], userIdType = 'open_id') {
  const normalizedIds = [...new Set(userIds.map((item) => normalizeText(item, 191)).filter(Boolean))]
  if (normalizedIds.length === 0) return []

  const response = await performJsonRequest(
    'GET',
    buildUrl(config.baseUrl, '/open-apis/contact/v3/users/batch', {
      user_ids: normalizedIds,
      user_id_type: normalizeText(userIdType, 64) || 'open_id',
      department_id_type: config.departmentIdType,
    }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeoutMs: config.timeoutMs,
    },
  )

  if (Number(response?.code || 0) !== 0) {
    const err = new Error(response?.msg || '飞书批量获取用户信息接口返回异常')
    err.payload = response
    throw err
  }

  return Array.isArray(response?.data?.items) ? response.data.items : []
}

function mergeUserRecord(summaryUser = {}, detailUser = {}) {
  const summaryDepartmentIds = Array.isArray(summaryUser.department_ids)
    ? summaryUser.department_ids.map((item) => String(item)).filter(Boolean)
    : []
  const detailDepartmentIds = Array.isArray(detailUser.department_ids)
    ? detailUser.department_ids.map((item) => String(item)).filter(Boolean)
    : []

  return {
    ...summaryUser,
    ...detailUser,
    department_ids: Array.from(new Set([...summaryDepartmentIds, ...detailDepartmentIds])),
    raw_payload: {
      summary: summaryUser,
      detail: detailUser,
    },
  }
}

async function enrichUsersWithDetails(config, token, users = []) {
  if (!Array.isArray(users) || users.length === 0) {
    return {
      users: [],
      enrichedCount: 0,
      detailFailureCount: 0,
    }
  }

  const userIndexMap = new Map()
  users.forEach((user, index) => {
    const openId = normalizeText(user?.open_id, 191)
    if (openId) {
      userIndexMap.set(openId, index)
    }
  })

  const enrichedUsers = users.map((user) => mergeUserRecord(user, {}))
  let enrichedCount = 0
  let detailFailureCount = 0
  const unresolvedIndexes = new Set(users.map((_, index) => index))

  const openIds = users.map((user) => normalizeText(user?.open_id, 191)).filter(Boolean)
  const openIdChunks = chunkArray(openIds, USER_BATCH_SIZE)

  for (const chunk of openIdChunks) {
    try {
      const detailUsers = await fetchUsersBatch(config, token, chunk, 'open_id')
      detailUsers.forEach((detailUser) => {
        const openId = normalizeText(detailUser?.open_id, 191)
        const index = userIndexMap.get(openId)
        if (!Number.isInteger(index)) return
        enrichedUsers[index] = mergeUserRecord(users[index], detailUser)
        unresolvedIndexes.delete(index)
        enrichedCount += 1
      })
    } catch (error) {
      console.warn('[FeishuSync] 批量获取用户信息失败，准备回退单用户详情:', error?.message || error)
      break
    }
  }

  async function worker(indexes = []) {
    for (const index of indexes) {
      const user = users[index] || {}
      const refs = []
      const openId = normalizeText(user.open_id, 191)
      const userId = normalizeText(user.user_id, 191)
      if (openId) refs.push({ id: openId, id_type: 'open_id' })
      if (userId) refs.push({ id: userId, id_type: 'user_id' })

      let detailUser = null
      for (const ref of refs) {
        try {
          detailUser = await fetchUserDetail(config, token, ref)
          if (detailUser) break
        } catch (error) {
          console.warn(`[FeishuSync] 获取用户详情失败: ${ref.id_type}:${ref.id}`, error?.message || error)
        }
      }

      if (detailUser) {
        enrichedUsers[index] = mergeUserRecord(users[index], detailUser)
        enrichedCount += 1
      } else {
        detailFailureCount += 1
      }
    }
  }

  const fallbackIndexes = Array.from(unresolvedIndexes)
  const fallbackChunks = chunkArray(
    fallbackIndexes,
    Math.max(1, Math.ceil(fallbackIndexes.length / DETAIL_ENRICH_CONCURRENCY)),
  ).filter((chunk) => chunk.length > 0)

  await Promise.all(fallbackChunks.map((chunk) => worker(chunk)))

  return {
    users: enrichedUsers,
    enrichedCount,
    detailFailureCount,
  }
}

async function collectDirectorySnapshot(config, token) {
  const queue = [
    {
      id: config.rootDepartmentId,
      id_type: normalizeDepartmentIdType(config.departmentIdType, 'department_id'),
    },
  ]
  const visitedDepartmentIds = new Set()
  const departmentMap = new Map()
  const userMap = new Map()

  while (queue.length > 0) {
    const currentDepartment = queue.shift() || {}
    const departmentId = String(currentDepartment.id || '').trim()
    const departmentIdType = normalizeDepartmentIdType(currentDepartment.id_type, config.departmentIdType)
    const visitedKey = `${departmentIdType}:${departmentId}`
    if (!departmentId || visitedDepartmentIds.has(visitedKey)) continue
    visitedDepartmentIds.add(visitedKey)

    const [departmentUsers, childDepartments] = await Promise.all([
      fetchDepartmentUsers(config, token, { id: departmentId, id_type: departmentIdType }),
      fetchDepartmentChildren(config, token, { id: departmentId, id_type: departmentIdType }),
    ])

    childDepartments.forEach((department) => {
      setDepartmentMapEntry(departmentMap, department)
      const nextDepartmentRef = buildDepartmentRefFromRecord(department, departmentIdType)
      if (nextDepartmentRef?.id) {
        queue.push(nextDepartmentRef)
      }
    })

    departmentUsers.forEach((user) => {
      const openId = normalizeText(user?.open_id, 191)
      const fallbackUserId = normalizeText(user?.user_id, 191)
      const key = openId || fallbackUserId
      if (!key) return

      const nextDepartmentIds = Array.isArray(user?.department_ids)
        ? user.department_ids.map((item) => String(item)).filter(Boolean)
        : []
      const existing = userMap.get(key)

      if (!existing) {
        userMap.set(key, {
          ...user,
          department_ids: nextDepartmentIds,
        })
        return
      }

      const mergedDepartmentIds = Array.from(
        new Set([...(Array.isArray(existing.department_ids) ? existing.department_ids : []), ...nextDepartmentIds]),
      )

      userMap.set(key, {
        ...existing,
        ...user,
        department_ids: mergedDepartmentIds,
      })
    })
  }

  return {
    users: Array.from(userMap.values()),
    departments: Array.from(departmentMap.values()),
    departmentMap,
  }
}

function buildSnapshotRecords(users, departmentMap) {
  return users.map((user) => {
    const normalizedStatus = normalizeUserStatus(user.status)
    const departmentIds = Array.isArray(user.department_ids)
      ? [...new Set(user.department_ids.map((item) => String(item)).filter(Boolean))]
      : []
    const primaryDepartmentId = getPrimaryDepartmentId(user)
    const avatar = user.avatar && typeof user.avatar === 'object' ? user.avatar : {}

    return {
      open_id: normalizeText(user.open_id, 191),
      union_id: normalizeText(user.union_id, 191),
      feishu_user_id: normalizeText(user.user_id, 191),
      name: normalizeText(user.name, 128),
      en_name: normalizeText(user.en_name, 128),
      nickname: normalizeText(user.nickname, 128),
      mobile: normalizeText(user.mobile, 64),
      email: normalizeText(user.email, 191),
      enterprise_email: normalizeText(user.enterprise_email, 191),
      employee_no: normalizeText(user.employee_no, 64),
      avatar_url:
        normalizeText(avatar.avatar_origin, 500) ||
        normalizeText(avatar.avatar_240, 500) ||
        normalizeText(avatar.avatar_72, 500),
      department_ids: departmentIds,
      department_names: buildDepartmentNameList(departmentIds, departmentMap),
      primary_department_id: primaryDepartmentId,
      primary_department_name: departmentMap.get(primaryDepartmentId)?.name || '',
      leader_user_id: normalizeText(user.leader_user_id, 191),
      job_title: normalizeText(user.job_title, 191),
      city: normalizeText(user.city, 128),
      country: normalizeText(user.country, 64),
      work_station: normalizeText(user.work_station, 191),
      is_resigned: normalizedStatus.is_resigned || normalizedStatus.is_exited ? 1 : 0,
      is_active:
        normalizedStatus.is_resigned || normalizedStatus.is_exited
          ? 0
          : normalizedStatus.is_activated
            ? 1
            : 0,
      status: normalizedStatus,
      raw_payload: user,
    }
  })
}

const feishuContactService = {
  getConfigStatus() {
    const config = getConfig()
    return {
      configured: config.configured,
      missing_keys: config.missingKeys,
      app_id: config.appId || null,
      root_department_id: config.rootDepartmentId,
      department_id_type: config.departmentIdType,
      user_id_type: config.userIdType,
    }
  },

  async syncContacts() {
    const config = getConfig()
    if (!config.configured) {
      const err = new Error(`请先配置 ${config.missingKeys.join('、')}`)
      err.code = 'FEISHU_CONFIG_MISSING'
      throw err
    }

    const { tenantAccessToken, tenantKey } = await getTenantAccessToken(config)
    const { users, departments, departmentMap } = await collectDirectorySnapshot(
      config,
      tenantAccessToken,
    )
    const {
      users: enrichedUsers,
      enrichedCount,
      detailFailureCount,
    } = await enrichUsersWithDetails(config, tenantAccessToken, users)
    const syncedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const syncBatchId = `FS${Date.now()}`
    const records = buildSnapshotRecords(enrichedUsers, departmentMap).filter((record) => record.open_id)

    await FeishuContact.upsertSnapshots(records, {
      appId: config.appId,
      tenantKey,
      syncBatchId,
      syncedAt,
    })

    const summary = await FeishuContact.getSummary()
    return {
      sync_batch_id: syncBatchId,
      synced_at: syncedAt,
      synced_user_total: records.length,
      scanned_department_total: departments.length,
      detail_enriched_total: enrichedCount,
      detail_failed_total: detailFailureCount,
      summary,
    }
  },
}

module.exports = feishuContactService
