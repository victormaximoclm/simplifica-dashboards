export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { getRequestId, logger } from '@/libs/logger'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'
import { createAuditLog } from '@/libs/auditService'
import { canNonHighAdminAccessForm, getUserFormContext, isFormHighAdminOnly } from '@/libs/formAccess'
import { canGeneratePublicLinks } from '@/libs/formPermissions'

// GET /api/forms/[id]/links - lista links gerados
export async function GET(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  try {
    const { id } = await params
    const form = await prisma.form.findUnique({ where: { id } })

    if (!form) {
      const response = NextResponse.json({ message: 'Formulário não encontrado' }, { status: 404 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    const role = session.user.role

    if (!isHighAdmin(role)) {
      if (form.workspaceId !== session.user.workspaceId) {
        const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
        response.headers.set('x-request-id', requestId)
        return response
      }

      const ctx = role !== 'admin' ? await getUserFormContext(session.user.id) : {}
      if (!canNonHighAdminAccessForm(role, form, ctx)) {
        const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
        response.headers.set('x-request-id', requestId)
        return response
      }
    }

    const links = await prisma.formPublicLink.findMany({
      where: { formId: id },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const response = NextResponse.json(
      links.map(link => ({
        ...link,
        publicUrl: `${baseUrl}/f/${link.token}`
      }))
    )
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    logger.error('form-links-list-error', { requestId, error: error.message })
    const response = NextResponse.json({ message: 'Erro ao listar links' }, { status: 500 })
    response.headers.set('x-request-id', requestId)
    return response
  }
}

// POST /api/forms/[id]/links - gera link público temporário
export async function POST(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  try {
    const { id } = await params
    const body = await req.json()
    const { expiresInHours = 24 } = body

    const form = await prisma.form.findUnique({ where: { id } })

    if (!form) {
      const response = NextResponse.json({ message: 'Formulário não encontrado' }, { status: 404 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    if (!form.allowPublicLink) {
      const response = NextResponse.json({ message: 'Links públicos não habilitados' }, { status: 403 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    const role = session.user.role

    if (!canGeneratePublicLinks(role)) {
      const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    if (!isHighAdmin(role)) {
      if (form.workspaceId !== session.user.workspaceId) {
        const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
        response.headers.set('x-request-id', requestId)
        return response
      }
      if (isFormHighAdminOnly(form)) {
        const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
        response.headers.set('x-request-id', requestId)
        return response
      }
    }

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + expiresInHours)

    const publicLink = await prisma.formPublicLink.create({
      data: { formId: id, expiresAt }
    })

    await createAuditLog({
      userId: session.user.id,
      tenantId: form.workspaceId,
      action: 'FORM_LINK_CREATE',
      entityType: 'form',
      entityId: id,
      after: { linkId: publicLink.id, expiresAt },
      metadata: { requestId }
    })

    logger.info('form-link-create-success', { requestId, userId: session.user.id, linkId: publicLink.id })

    const response = NextResponse.json(
      {
        ...publicLink,
        publicUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/br/f/${publicLink.token}`
      },
      { status: 201 }
    )
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    logger.error('form-link-create-error', { requestId, error: error.message })
    const response = NextResponse.json({ message: 'Erro ao gerar link público' }, { status: 500 })
    response.headers.set('x-request-id', requestId)
    return response
  }
}
