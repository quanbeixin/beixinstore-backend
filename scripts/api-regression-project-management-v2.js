#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path')
const dotenv = require('dotenv')

const backendRoot = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

const pool = require('../utils/db')
const { generateToken } = require('../utils/jwt')

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.API_REGRESSION_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}/api`,
    username: process.env.API_REGRESSION_USERNAME || '',
    password: process.env.API_REGRESSION_PASSWORD || '',
    token: process.env.API_REGRESSION_TOKEN || '',
    timeoutMs: Number(process.env.API_REGRESSION_TIMEOUT_MS || 10000),
  }

  for (let i = 0; i < argv.length; i += 1) {
    const item = String(argv[i] || '').trim()
    if (!item) continue

    if (item === '--base-url') {
      args.baseUrl = String(argv[i + 1] || '').trim() || args.baseUrl
      i += 1
      continue
    }

    if (item === '--username') {
      args.username = String(argv[i + 1] || '').trim()
      i += 1
      continue
    }

    if (item === '--password') {
      args.password = String(argv[i + 1] || '').trim()
      i += 1
      continue
    }

    if (item === '--token') {
      args.token = String(argv[i + 1] || '').trim()
      i += 1
      continue
    }

    if (item === '--timeout-ms') {
      const timeoutNum = Number(argv[i + 1] || args.timeoutMs)
      args.timeoutMs = Number.isFinite(timeoutNum) && timeoutNum > 0 ? timeoutNum : args.timeoutMs
      i += 1
      continue
    }
  }

  return args
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '')
}

function buildUrl(baseUrl, pathName) {
  const normalizedBase = normalizeBaseUrl(baseUrl)
  const normalizedPath = String(pathName || '').trim()
  if (!normalizedBase) return normalizedPath
  if (!normalizedPath) return normalizedBase
  if (normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')) {
    return normalizedPath
  }
  return `${normalizedBase}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`
}

async function requestJson({ baseUrl, method = 'GET', pathName = '', token = '', body, timeoutMs = 10000 }) {
  const targetUrl = buildUrl(baseUrl, pathName)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const headers = {
    Accept: 'application/json',
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const startedAt = Date.now()
  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    const durationMs = Date.now() - startedAt
    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    return {
      ok: response.ok,
      status: response.status,
      duration_ms: durationMs,
      payload,
      url: targetUrl,
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    return {
      ok: false,
      status: 0,
      duration_ms: durationMs,
      payload: null,
      url: targetUrl,
      error: error?.message || String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function pickBestUserForToken() {
  let rows
  try {
    const queryResult = await pool.query(
      `SELECT
         u.id,
         u.username,
         COALESCE(NULLIF(u.role, ''), 'USER') AS role,
         MAX(CASE WHEN UPPER(COALESCE(r.role_key, '')) = 'SUPER_ADMIN' THEN 1 ELSE 0 END) AS is_super_admin_role,
         MAX(CASE WHEN UPPER(COALESCE(r.role_key, '')) = 'ADMIN' THEN 1 ELSE 0 END) AS is_admin_role
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id, u.username, u.role
       ORDER BY is_super_admin_role DESC, is_admin_role DESC, u.id ASC
       LIMIT 1`,
    )
    rows = queryResult[0] || []
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') {
      throw error
    }

    const queryResult = await pool.query(
      `SELECT
         u.id,
         u.username,
         'USER' AS role,
         MAX(CASE WHEN UPPER(COALESCE(r.role_key, '')) = 'SUPER_ADMIN' THEN 1 ELSE 0 END) AS is_super_admin_role,
         MAX(CASE WHEN UPPER(COALESCE(r.role_key, '')) = 'ADMIN' THEN 1 ELSE 0 END) AS is_admin_role
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id, u.username
       ORDER BY is_super_admin_role DESC, is_admin_role DESC, u.id ASC
       LIMIT 1`,
    )
    rows = queryResult[0] || []
  }

  if (!rows[0]) return null

  const row = rows[0]
  const normalizedRole = String(row.role || '').trim().toUpperCase()
  const roleForToken =
    normalizedRole ||
    (Number(row.is_super_admin_role) === 1 ? 'SUPER_ADMIN' : Number(row.is_admin_role) === 1 ? 'ADMIN' : 'USER')

  return {
    id: Number(row.id),
    username: String(row.username || ''),
    role: roleForToken,
  }
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== 'object') return { type: typeof payload }
  const data = payload.data
  const summary = {
    success: typeof payload.success === 'boolean' ? payload.success : null,
    has_data: data !== undefined,
  }

  if (Array.isArray(data)) {
    summary.data_type = 'array'
    summary.data_count = data.length
    return summary
  }

  if (data && typeof data === 'object') {
    summary.data_type = 'object'
    if (Array.isArray(data.list)) {
      summary.list_count = data.list.length
      summary.total = Number(data.total || 0)
    }
    return summary
  }

  summary.data_type = typeof data
  return summary
}

async function obtainToken(args) {
  if (args.token) {
    return {
      ok: true,
      mode: 'provided_token',
      token: args.token,
      detail: 'Using API_REGRESSION_TOKEN / --token',
    }
  }

  if (args.username && args.password) {
    const loginResult = await requestJson({
      baseUrl: args.baseUrl,
      method: 'POST',
      pathName: '/auth/login',
      body: {
        username: args.username,
        password: args.password,
      },
      timeoutMs: args.timeoutMs,
    })

    if (loginResult.ok && loginResult.payload?.success && loginResult.payload?.data?.token) {
      return {
        ok: true,
        mode: 'login',
        token: loginResult.payload.data.token,
        detail: `Login success for ${args.username}`,
      }
    }

    return {
      ok: false,
      mode: 'login',
      token: '',
      detail: loginResult.error || loginResult.payload?.message || 'Login failed',
      login_result: {
        status: loginResult.status,
        payload: loginResult.payload || null,
      },
    }
  }

  const pickedUser = await pickBestUserForToken()
  if (!pickedUser?.id || !pickedUser.username) {
    return {
      ok: false,
      mode: 'signed_token',
      token: '',
      detail: 'No available user found for signed-token mode',
    }
  }

  const signedToken = generateToken({
    id: pickedUser.id,
    username: pickedUser.username,
    role: pickedUser.role || 'USER',
  })

  return {
    ok: true,
    mode: 'signed_token',
    token: signedToken,
    detail: `Signed token for user#${pickedUser.id} (${pickedUser.username})`,
    user: pickedUser,
  }
}

async function runChecks(args, token) {
  const checks = []
  let firstTemplateId = null
  let firstDemandId = null
  let firstTaskId = null

  const push = async (name, req, options = {}) => {
    const expectedStatuses = Array.isArray(options.expectedStatuses)
      ? options.expectedStatuses
          .map((item) => Number(item))
          .filter((item) => Number.isInteger(item) && item >= 100 && item <= 599)
      : null
    const expectPayloadSuccess = options.expectPayloadSuccess !== false

    const result = await requestJson({
      baseUrl: args.baseUrl,
      token,
      timeoutMs: args.timeoutMs,
      ...req,
    })

    const statusMatched = expectedStatuses && expectedStatuses.length > 0
      ? expectedStatuses.includes(Number(result.status))
      : result.ok
    const payloadSuccessMatched = expectPayloadSuccess
      ? result.payload?.success !== false
      : true

    checks.push({
      name,
      ok: statusMatched && payloadSuccessMatched,
      status: result.status,
      duration_ms: result.duration_ms,
      url: result.url,
      error: result.error || null,
      payload_summary: summarizePayload(result.payload),
      payload_message: result.payload?.message || '',
    })

    return result
  }

  await push('ping.public', { method: 'GET', pathName: '/ping', token: '' })
  await push('auth.access', { method: 'GET', pathName: '/auth/access' })

  const templateList = await push('work.project_templates.list', {
    method: 'GET',
    pathName: '/work/project-templates?page=1&pageSize=5',
  })
  firstTemplateId = Number(templateList.payload?.data?.list?.[0]?.id || 0) || null
  if (firstTemplateId) {
    await push('work.project_templates.detail', {
      method: 'GET',
      pathName: `/work/project-templates/${firstTemplateId}`,
    })
  }

  await push('work.notification_configs.list', {
    method: 'GET',
    pathName: '/work/notification-configs',
  })

  const demandList = await push('work.demands.list', {
    method: 'GET',
    pathName: '/work/demands?page=1&pageSize=5',
  })
  firstDemandId = String(demandList.payload?.data?.list?.[0]?.id || '').trim() || null

  if (firstDemandId) {
    await push('work.demands.detail', {
      method: 'GET',
      pathName: `/work/demands/${encodeURIComponent(firstDemandId)}`,
    })
    await push('work.demands.members', {
      method: 'GET',
      pathName: `/work/demands/${encodeURIComponent(firstDemandId)}/members`,
    })

    const workflowDetail = await push('work.demands.workflow.detail', {
      method: 'GET',
      pathName: `/work/demands/${encodeURIComponent(firstDemandId)}/workflow`,
    })
    firstTaskId = Number(workflowDetail?.payload?.data?.tasks?.[0]?.id || 0) || null

    await push(
      'work.workflow.current.reject.validation',
      {
        method: 'POST',
        pathName: `/work/demands/${encodeURIComponent(firstDemandId)}/workflow/current/reject`,
        body: {},
      },
      {
        expectedStatuses: [400],
        expectPayloadSuccess: false,
      },
    )

    await push(
      'work.workflow.current.force_complete.route',
      {
        method: 'POST',
        pathName: `/work/demands/${encodeURIComponent(firstDemandId)}/workflow/current/force-complete`,
        body: {},
      },
      {
        expectedStatuses: [200, 400, 403, 500],
        expectPayloadSuccess: false,
      },
    )

    await push(
      'work.workflow.task_collaborators.route.validation',
      {
        method: 'POST',
        pathName: `/work/demands/${encodeURIComponent(firstDemandId)}/workflow/tasks/0/collaborators`,
        body: {},
      },
      {
        expectedStatuses: [400],
        expectPayloadSuccess: false,
      },
    )

    if (firstTaskId) {
      await push(
        'work.workflow.task_collaborators.list',
        {
          method: 'GET',
          pathName: `/work/demands/${encodeURIComponent(firstDemandId)}/workflow/tasks/${firstTaskId}/collaborators`,
        },
      )

      await push(
        'work.workflow.task_collaborators.add.validation',
        {
          method: 'POST',
          pathName: `/work/demands/${encodeURIComponent(firstDemandId)}/workflow/tasks/${firstTaskId}/collaborators`,
          body: {},
        },
        {
          expectedStatuses: [400],
          expectPayloadSuccess: false,
        },
      )
    }
  }

  await push('work.archive_demands.list', {
    method: 'GET',
    pathName: '/work/archive/demands?page=1&pageSize=3',
  })

  await push(
    'work.archive_demands.restore.invalid_id',
    {
      method: 'POST',
      pathName: '/work/archive/demands/INVALID_ID/restore',
      body: {},
    },
    {
      expectedStatuses: [400, 404],
      expectPayloadSuccess: false,
    },
  )

  return {
    checks,
    context: {
      template_id: firstTemplateId,
      demand_id: firstDemandId,
      task_id: firstTaskId,
    },
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const auth = await obtainToken(args)
  if (!auth.ok || !auth.token) {
    console.log(
      JSON.stringify(
        {
          summary: {
            success: false,
            failed_stage: 'auth',
            checked_at: new Date().toISOString(),
          },
          auth,
        },
        null,
        2,
      ),
    )
    process.exitCode = 1
    return
  }

  const { checks, context } = await runChecks(args, auth.token)
  const failed = checks.filter((item) => !item.ok)

  console.log(
    JSON.stringify(
      {
        summary: {
          success: failed.length === 0,
          check_count: checks.length,
          failed_count: failed.length,
          failed_checks: failed.map((item) => item.name),
          checked_at: new Date().toISOString(),
        },
        auth: {
          mode: auth.mode,
          detail: auth.detail,
          user: auth.user || null,
        },
        context,
        checks,
      },
      null,
      2,
    ),
  )

  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          summary: {
            success: false,
            failed_stage: 'runtime',
            checked_at: new Date().toISOString(),
          },
          error: error?.message || String(error),
        },
        null,
        2,
      ),
    )
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await pool.end()
    } catch {
      // ignore close errors
    }
  })
