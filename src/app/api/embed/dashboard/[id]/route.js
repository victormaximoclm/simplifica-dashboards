export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getAuthorizedDashboard } from '@/libs/dashboardAccess'
import {
  EMBED_TOKEN_COOKIE,
  createEmbedToken,
  isSameOriginReferer,
  setEmbedSecurityHeaders
} from '@/libs/embedSecurity'
import { applyRateLimitHeaders, getRequestId, logger } from '@/libs/logger'
import { createRateLimit } from '@/libs/rateLimit'

const embedIpLimiter = createRateLimit({ interval: 60_000, limit: 60 })
const embedUserLimiter = createRateLimit({ interval: 60_000, limit: 120 })

function buildPowerBiTarget(embedUrl) {
  const url = new URL(embedUrl)
  const allowedHosts = new Set(['app.powerbi.com'])

  if (!allowedHosts.has(url.hostname)) return null

  return url.toString()
}

export async function GET(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    await createAuditLog({
      action: 'EMBED_ACCESS_BLOCKED',
      resource: 'dashboard',
      resourceId: id,
      metadata: {
        requestId,
        reason: 'NO_SESSION',
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        referer: req.headers.get('referer') || null
      },
      requestId
    })
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const ipRate = await embedIpLimiter.check(req)
  const userRate = await embedUserLimiter.check(req, `user:${session.user.id}`)

  if (!ipRate.success || !userRate.success) {
    logger.warn('embed-rate-limit', {
      requestId,
      dashboardId: id,
      userId: session.user.id,
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    })
    const response = NextResponse.json({ message: 'Muitas requisições' }, { status: 429 })
    response.headers.set('x-request-id', requestId)
    return applyRateLimitHeaders(response, ipRate.success ? userRate : ipRate)
  }

  if (!isSameOriginReferer(req) || !req.headers.get('cookie')) {
    logger.warn('embed-invalid-access', {
      requestId,
      dashboardId: id,
      userId: session.user.id,
      referer: req.headers.get('referer') || null
    })
    await createAuditLog({
      userId: session.user.id,
      tenantId: session.user.workspaceId || null,
      action: 'EMBED_ACCESS_BLOCKED',
      resource: 'dashboard',
      resourceId: id,
      metadata: {
        requestId,
        reason: 'INVALID_REFERER_OR_COOKIE',
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        referer: req.headers.get('referer') || null
      },
      requestId
    })
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return applyRateLimitHeaders(response, ipRate.success ? userRate : ipRate)
  }

  const access = await getAuthorizedDashboard({ dashboardId: id, session })

  if (!access.ok) {
    const response = NextResponse.json({ message: access.message }, { status: access.status })
    response.headers.set('x-request-id', requestId)
    return applyRateLimitHeaders(response, ipRate.success ? userRate : ipRate)
  }

  const targetUrl = buildPowerBiTarget(access.dashboard.embedUrl)
  if (!targetUrl) {
    const response = NextResponse.json({ message: 'Origem do dashboard não permitida' }, { status: 400 })
    response.headers.set('x-request-id', requestId)
    return applyRateLimitHeaders(response, ipRate.success ? userRate : ipRate)
  }

  const internalToken = createEmbedToken({
    userId: session.user.id,
    dashboardId: id
  })

  const response = NextResponse.redirect(targetUrl, 302)

  response.cookies.set({
    name: EMBED_TOKEN_COOKIE,
    value: internalToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/embed/dashboard',
    maxAge: 5 * 60
  })
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  response.headers.set('x-request-id', requestId)

  setEmbedSecurityHeaders(response)

  logger.debug('embed-access', {
    requestId,
    dashboardId: id,
    userId: session.user.id,
    status: 302
  })

  return applyRateLimitHeaders(response, ipRate.success ? userRate : ipRate)
}
