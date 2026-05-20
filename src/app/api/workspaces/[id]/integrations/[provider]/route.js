export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, logger } from '@/libs/logger'
import { isHighAdmin } from '@/utils/roleHelpers'
import { createNotification } from '@/libs/notifications'
import { prisma } from '@/libs/prisma'
import { sanitizeWorkspaceIntegration } from '@/app/constants/integration'
import { getWorkspaceIntegration, upsertWorkspaceIntegration } from '@/libs/workspaceIntegrations'
import { authOptions } from '@/libs/auth'

export async function GET(req, { params }) {
  console.log('GET integration route called')
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  try {
    const { id, provider } = await params

    if (!isHighAdmin(session.user.role) && session.user.workspaceId !== id) {
      const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    const integration = await getWorkspaceIntegration(id, provider)
    const payload = isHighAdmin(session.user.role) ? integration : sanitizeWorkspaceIntegration(integration)

    const response = NextResponse.json(payload)
    response.headers.set('x-request-id', getRequestId(req))
    return response
  } catch (error) {
    console.error(error)
    const response = NextResponse.json(
      {
        error: 'Failed to fetch integration'
      },
      {
        status: 500
      }
    )

    response.headers.set('x-request-id', getRequestId(req))

    return response
  }
}

//PUT
export async function PUT(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (!isHighAdmin(session.user.role)) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  try {
    const { id, provider } = await params
    console.log({ id, provider })
    if (!id || !provider) {
      return NextResponse.json({ error: 'Missing id or provider' }, { status: 400 })
    }

    const body = await req.json()

    const integration = await upsertWorkspaceIntegration(id, provider, body)

    const workspace = await prisma.workspace.findUnique({ where: { id } })
    const creator = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })

    await createNotification({
      type: 'integration_upsert',
      title: 'Integração atualizada',
      message: `${session.user.name || session.user.email} configurou integração em "${workspace.name}"`,
      workspaceId: id,
      createdById: creator?.id
    })

    logger.info('integration-create-success', {
      requestId,
      userId: session.user.id,
      workspaceId: id
    })
    await createAuditLog({
      userId: session.user.id,
      tenantId: id,
      action: 'INTEGRATION_UPSERT',
      resource: 'integration',
      resourceId: integration.id,
      metadata: { requestId },
      requestId
    })

    const response = NextResponse.json(integration)
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    console.error(error)

    const response = NextResponse.json(
      {
        error: 'Failed to save integration'
      },
      {
        status: 500
      }
    )

    response.headers.set('x-request-id', getRequestId(req))

    return response
  }
}
