export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { getRequestId } from '@/libs/logger'
import { isClickUpWorkspaceConfigured } from '@/app/constants/integration'
import { getWorkspaceIntegration } from '@/libs/workspaceIntegrations'

export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const workspaceId = session.user.workspaceId

  if (!workspaceId) {
    const response = NextResponse.json({ message: 'Usuário não pertence a nenhum workspace' }, { status: 400 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  // Busca integração do workspace para obter clientId e redirectUri
  const integration = await getWorkspaceIntegration(workspaceId, 'clickup')

  if (!isClickUpWorkspaceConfigured(integration)) {
    const response = NextResponse.json(
      { message: 'Workspace não possui integração ClickUp configurada ou ativa' },
      { status: 400 }
    )
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { clientId } = integration.configJson
  const redirectUri = process.env.CLICKUP_REDIRECT_URI

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri
  })

  const response = NextResponse.redirect(`https://app.clickup.com/api?${params.toString()}`)
  response.headers.set('x-request-id', requestId)
  return response
}
