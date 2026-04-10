const jwt = require('jsonwebtoken')

function normalizeText(value, maxLength = 2000) {
  if (value === undefined || value === null) return ''
  return String(value).trim().slice(0, maxLength)
}

function getTokenSecret() {
  return normalizeText(process.env.JWT_SECRET, 512)
}

function getTicketExpiresInSec() {
  const raw = Number(process.env.NOTIFICATION_LOGIN_TICKET_EXPIRES_SEC || 600)
  if (!Number.isFinite(raw) || raw <= 0) return 600
  return Math.max(60, Math.min(Math.floor(raw), 3600))
}

function signNotificationLoginToken({ userId, targetPath = '' }) {
  const secret = getTokenSecret()
  const normalizedUserId = Number(userId)
  if (!secret || !Number.isInteger(normalizedUserId) || normalizedUserId <= 0) return ''

  const payload = {
    typ: 'notify_login',
    uid: normalizedUserId,
    target_path: normalizeText(targetPath, 2000) || '',
  }

  try {
    return jwt.sign(payload, secret, {
      expiresIn: getTicketExpiresInSec(),
    })
  } catch {
    return ''
  }
}

function verifyNotificationLoginToken(token) {
  const secret = getTokenSecret()
  const normalizedToken = normalizeText(token, 4000)
  if (!secret || !normalizedToken) {
    return { ok: false, code: 'MISSING_TOKEN' }
  }

  try {
    const decoded = jwt.verify(normalizedToken, secret)
    const userId = Number(decoded?.uid || 0)
    if (!Number.isInteger(userId) || userId <= 0) {
      return { ok: false, code: 'INVALID_PAYLOAD' }
    }
    if (String(decoded?.typ || '') !== 'notify_login') {
      return { ok: false, code: 'INVALID_TOKEN_TYPE' }
    }

    return {
      ok: true,
      userId,
      targetPath: normalizeText(decoded?.target_path, 2000) || '',
    }
  } catch (error) {
    const tokenExpired = error?.name === 'TokenExpiredError'
    return {
      ok: false,
      code: tokenExpired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    }
  }
}

module.exports = {
  signNotificationLoginToken,
  verifyNotificationLoginToken,
}

