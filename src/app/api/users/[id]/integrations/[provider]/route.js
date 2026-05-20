export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { getRequestId, logger } from '@/libs/logger'
import { isHighAdmin } from '@/utils/roleHelpers'
import { getUserIntegration, deleteUserIntegration } from '@/libs/userIntegrations'
import { createAuditLog } from '@/libs/auditService'
import { createNotification } from '@/libs/notifications'

function providerLabel(provider) {
  return provider === 'clickup' ? 'ClickUp' : provider
}

// GET /api/users/[id]/integrations/[provider]
// Retorna os dados da integração do usuário
// Próprio usuário ou HighAdmin podem acessar
export async function GET(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { id, provider } = await params

  if (!isHighAdmin(session.user.role) && session.user.id !== id) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  try {
    const integration = await getUserIntegration(id, provider)

    if (!integration) {
      const response = NextResponse.json({ message: 'Integração não encontrada' }, { status: 404 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    // Remove o token da resposta por segurança
    const { token, ...safeIntegration } = integration

    const response = NextResponse.json(safeIntegration)
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    logger.error('user-integration-get-error', { requestId, error: error.message })
    const response = NextResponse.json({ message: 'Erro ao buscar integração' }, { status: 500 })
    response.headers.set('x-request-id', requestId)
    return response
  }
}

// DELETE /api/users/[id]/integrations/[provider]
// Desvincula a conta do provedor do usuário
// Próprio usuário ou HighAdmin podem deletar
export async function DELETE(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { id, provider } = await params
  const label = providerLabel(provider)

  if (!isHighAdmin(session.user.role) && session.user.id !== id) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  try {
    const existing = await getUserIntegration(id, provider)

    if (!existing) {
      const response = NextResponse.json({ message: 'Integração não encontrada' }, { status: 404 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    await deleteUserIntegration(id, provider)

    await createNotification({
      type: 'integration_disconnected',
      title: `${label} desconectado`,
      message: `${session.user.name || session.user.email} desvinculou sua conta ${label}`,
      workspaceId: session.user.workspaceId,
      createdById: session.user.id
    })

    logger.info(`${provider}-integration-disconnected`, {
      requestId,
      userId: id,
      disconnectedBy: session.user.id
    })

    await createAuditLog({
      userId: session.user.id,
      tenantId: session.user.workspaceId,
      action: `${provider.toUpperCase()}_INTEGRATION_DISCONNECT`,
      entityType: 'userIntegration',
      before: { accountEmail: existing.accountEmail },
      metadata: { requestId }
    })

    const response = NextResponse.json({ message: 'Integração desvinculada com sucesso' })
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    logger.error(`${provider}-integration-delete-error`, { requestId, error: error.message })
    const response = NextResponse.json({ message: 'Erro ao desvincular integração' }, { status: 500 })
    response.headers.set('x-request-id', requestId)
    return response
  }
}
