export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getAuthorizedDashboard } from '@/libs/dashboardAccess'
import {
  EMBED_TOKEN_COOKIE,
  createEmbedToken,
  isSameOriginReferer,
  setEmbedSecurityHeaders
} from '@/libs/embedSecurity'
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
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  const ipRate = embedIpLimiter.check(req)
  const userRate = embedUserLimiter.check(req, `user:${session.user.id}`)

  if (!ipRate.success || !userRate.success) {
    console.warn('[embed-rate-limit]', {
      dashboardId: id,
      userId: session.user.id,
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    })
    return NextResponse.json({ message: 'Muitas requisições' }, { status: 429 })
  }

  if (!isSameOriginReferer(req) || !req.headers.get('cookie')) {
    console.warn('[embed-invalid-access]', {
      dashboardId: id,
      userId: session.user.id,
      referer: req.headers.get('referer') || null
    })
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const access = await getAuthorizedDashboard({ dashboardId: id, session })

  if (!access.ok) {
    return NextResponse.json({ message: access.message }, { status: access.status })
  }

  const targetUrl = buildPowerBiTarget(access.dashboard.embedUrl)
  if (!targetUrl) {
    return NextResponse.json({ message: 'Origem do dashboard não permitida' }, { status: 400 })
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

  setEmbedSecurityHeaders(response)

  console.info('[embed-access]', {
    dashboardId: id,
    userId: session.user.id,
    status: 302
  })

  return response
}
