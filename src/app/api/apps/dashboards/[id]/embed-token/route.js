export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'

export async function GET(req, { params }) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })

  const dashboard = await prisma.dashboard.findUnique({
    where: { id }
  })
  if (!dashboard) return NextResponse.json({ message: 'Dashboard não encontrado' }, { status: 404 })

  try {
    // 1. Autenticar no Azure AD
    const aadRes = await fetch(`https://login.microsoftonline.com/${process.env.POWERBI_TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.POWERBI_CLIENT_ID,
        client_secret: process.env.POWERBI_CLIENT_SECRET,
        scope: process.env.POWERBI_SCOPE
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

    return NextResponse.json({
      embedToken: tokenData.token,
      embedUrl: reportData.embedUrl,
      reportId: dashboard.reportId
    })
  } catch (error) {
    console.error('[embed-token]', error.message)
    return NextResponse.json({ message: 'Erro ao gerar token de embed' }, { status: 500 })
  }
}
