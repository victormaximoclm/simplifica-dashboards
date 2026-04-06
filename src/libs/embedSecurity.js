import crypto from 'crypto'

export const EMBED_TOKEN_COOKIE = 'pbi_et'
const TOKEN_TTL_SECONDS = 5 * 60

const toBase64Url = input => Buffer.from(input).toString('base64url')
const fromBase64Url = input => Buffer.from(input, 'base64url').toString('utf8')

function getEmbedSecret() {
  return process.env.EMBED_PROXY_SECRET || process.env.NEXTAUTH_SECRET || ''
}

function sign(data) {
  const secret = getEmbedSecret()

  if (!secret) {
    throw new Error('Missing EMBED_PROXY_SECRET or NEXTAUTH_SECRET')
  }

  return crypto.createHmac('sha256', secret).update(data).digest('base64url')
}

export function createEmbedToken({ userId, dashboardId }) {
  const payload = {
    userId,
    dashboardId,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  }
  const payloadBase64 = toBase64Url(JSON.stringify(payload))
  const signature = sign(payloadBase64)

  return `${payloadBase64}.${signature}`
}

export function verifyEmbedToken(token) {
  if (!token || !token.includes('.')) return null

  const [payloadBase64, providedSignature] = token.split('.')
  const expectedSignature = sign(payloadBase64)

  if (providedSignature !== expectedSignature) return null

  try {
    const payload = JSON.parse(fromBase64Url(payloadBase64))

    if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

export function isSameOriginReferer(req) {
  const referer = req.headers.get('referer')
  if (!referer) return false

  try {
    const refererUrl = new URL(referer)
    const reqHost = req.headers.get('host')

    return Boolean(reqHost) && refererUrl.host === reqHost
  } catch {
    return false
  }
}

export function setEmbedSecurityHeaders(response) {
  response.headers.set('Content-Security-Policy', "frame-ancestors 'self'")
  response.headers.set('X-Frame-Options', 'SAMEORIGIN')
  response.headers.set('X-Content-Type-Options', 'nosniff')
}
