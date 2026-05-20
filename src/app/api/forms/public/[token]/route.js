export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { getPublicLinkInactiveReason } from '@/libs/formlinkservice'

// GET /api/forms/public/[token] - acessa form via token público (sem auth)
export async function GET(req, { params }) {
  const requestId = getRequestId(req)

  try {
    const { token } = await params

    const publicLink = await prisma.formPublicLink.findUnique({
      where: { token },
      include: {
        form: {
          include: { workspace: true }
        }
      }
    })

    if (!publicLink) {
      const response = NextResponse.json({ message: 'Link inválido' }, { status: 404 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    const inactiveReason = getPublicLinkInactiveReason(publicLink)

    if (inactiveReason === 'used') {
      const response = NextResponse.json({ message: 'Link já utilizado' }, { status: 403 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    if (inactiveReason === 'expired') {
      const response = NextResponse.json({ message: 'Link expirado' }, { status: 403 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    const { form } = publicLink

    const response = NextResponse.json({
      id: form.id,
      title: form.title,
      description: form.description,
      fields: form.fields,
      workspaceId: form.workspaceId,
      workspaceName: form.workspace.name,
      token,
      expiresAt: publicLink.expiresAt
    })
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    logger.error('form-public-get-error', { requestId, error: error.message })
    const response = NextResponse.json({ message: 'Erro ao buscar formulário' }, { status: 500 })
    response.headers.set('x-request-id', requestId)
    return response
  }
}
