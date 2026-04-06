export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'
import { apiLimiter } from '@/libs/rateLimit'
import { isHighAdmin } from '@/utils/roleHelpers'

export async function GET(req, { params }) {
  const { id } = await params

  const { success } = apiLimiter.check(req)
  if (!success) return NextResponse.json({ message: 'Muitas requisições' }, { status: 429 })

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })

  const dashboard = await prisma.dashboard.findUnique({ where: { id }, include: { allowedRoles: true } })
  if (!dashboard) return NextResponse.json({ message: 'Dashboard não encontrado' }, { status: 404 })

  // Authorization (must match /api/apps/dashboards/:id)
  if (!isHighAdmin(session.user.role)) {
    // Must be in same workspace
    if (dashboard.workspaceId !== session.user.workspaceId) {
      return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    }

    // Admin sees all dashboards in their workspace
    if (session.user.role !== 'admin') {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { customRoleId: true }
      })

      const hasAccess = user?.customRoleId && dashboard.allowedRoles.some(ar => ar.customRoleId === user.customRoleId)

      if (!hasAccess) {
        return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
      }
    }
  } else {
    // Optional hardening: if UI is scoped by activeWorkspaceId cookie, enforce it here too
    try {
      const activeWorkspaceId = req.cookies?.get?.('activeWorkspaceId')?.value
      if (activeWorkspaceId && dashboard.workspaceId !== activeWorkspaceId) {
        return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
      }
    } catch {
      // ignore cookie parsing issues
    }
  }

  try {
    const tenantId = process.env.POWERBI_TENANT_ID
    const clientId = process.env.POWERBI_CLIENT_ID
    const clientSecret = process.env.POWERBI_CLIENT_SECRET
    const scope = process.env.POWERBI_SCOPE

    if (!tenantId || !clientId || !clientSecret || !scope) {
      console.error('[embed-token] missing POWERBI_* env vars')
      return NextResponse.json({ message: 'Power BI não configurado' }, { status: 500 })
    }

    // 1. Autenticar no Azure AD
    const aadRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope
      })
    })
    const aadToken = await aadRes.json()
    if (!aadToken.access_token) throw new Error('Falha ao autenticar no Azure AD')

    const authHeader = { Authorization: `Bearer ${aadToken.access_token}` }

    // 2. Buscar embedUrl do report
    const reportRes = await fetch(
      `https://api.powerbi.com/v1.0/myorg/groups/${dashboard.pbWorkspaceId}/reports/${dashboard.reportId}`,
      { headers: authHeader }
    )
    const reportData = await reportRes.json()
    if (!reportData.embedUrl) throw new Error('Report não encontrado ou sem permissão')

    // 3. Gerar Embed Token
    const tokenRes = await fetch(
      `https://api.powerbi.com/v1.0/myorg/groups/${dashboard.pbWorkspaceId}/reports/${dashboard.reportId}/GenerateToken`,
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessLevel: 'View' })
      }
    )
    const tokenData = await tokenRes.json()
    if (!tokenData.token) throw new Error('Falha ao gerar embed token')

    const res = NextResponse.json({
      embedToken: tokenData.token,
      embedUrl: reportData.embedUrl,
      reportId: dashboard.reportId
    })
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (error) {
    console.error('[embed-token]', error.message)
    return NextResponse.json({ message: 'Erro ao gerar token de embed' }, { status: 500 })
  }
}
