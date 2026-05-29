export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { getRequestId, logger } from '@/libs/logger'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'
import { createAuditLog } from '@/libs/auditService'
import { createNotification } from '@/libs/notifications'
import {
  buildFormListWhereForRole,
  filterFormsForRole,
  getUserFormContext
} from '@/libs/formAccess'
import { canManageFormInWorkspace, resolveFormWorkspaceId } from '@/libs/formWorkspace'
import { canManageForms } from '@/libs/formPermissions'

// GET /api/forms - lista forms do workspace filtrado por cargo ou customRole
export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  try {
    const role = session.user.role
    let workspaceId = session.user.workspaceId
    let where = {}
    let ctx = {}

    if (isHighAdmin(role)) {
      const { searchParams } = new URL(req.url)
      const workspaceFilter = searchParams.get('workspaceId')
      if (workspaceFilter) workspaceId = workspaceFilter
      else workspaceId = (await resolveFormWorkspaceId(session)) || null
    } else if (role === 'admin') {
      workspaceId = session.user.workspaceId
    } else {
      ctx = await getUserFormContext(session.user.id)
      workspaceId = ctx.workspaceId
    }

    where = buildFormListWhereForRole(role, workspaceId, ctx)

    let forms = await prisma.form.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        workspaceId: true,
        webhookUrl: true,
        allowPublicLink: true,
        allowedCargos: true,
        allowedRoles: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { publicLinks: true } }
      }
    })

    forms = filterFormsForRole(forms, role, ctx)

    const response = NextResponse.json(forms)
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    logger.error('forms-list-error', { requestId, error: error.message })
    const response = NextResponse.json({ message: 'Erro ao listar formulários' }, { status: 500 })
    response.headers.set('x-request-id', requestId)
    return response
  }
}

// POST /api/forms - cria form (admin do workspace)
export async function POST(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (!canManageForms(session.user.role)) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  try {
    const body = await req.json()
    const { title, description, workspaceId, fields, webhookUrl, allowPublicLink, allowedCargos, allowedRoles } = body

    if (!title || !workspaceId || !fields || !webhookUrl) {
      const response = NextResponse.json({ message: 'Campos obrigatórios ausentes' }, { status: 400 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    if (!canManageFormInWorkspace(session, workspaceId)) {
      const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })

    if (!workspace) {
      const response = NextResponse.json({ message: 'Workspace não encontrado' }, { status: 404 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    const form = await prisma.form.create({
      data: {
        title,
        description,
        workspaceId,
        fields,
        webhookUrl,
        allowPublicLink: allowPublicLink ?? false,
        allowedCargos: allowedCargos ?? [],
        allowedRoles: allowedRoles ?? []
      }
    })

    await createNotification({
      type: 'form_created',
      title: 'Novo formulário',
      message: `${session.user.name || session.user.email} criou o formulário "${form.title}" em ${workspace.name}`,
      workspaceId,
      createdById: session.user.id
    })

    logger.info('form-create-success', { requestId, userId: session.user.id, formId: form.id })

    await createAuditLog({
      userId: session.user.id,
      tenantId: workspaceId,
      action: 'FORM_CREATE',
      entityType: 'form',
      entityId: form.id,
      after: { title, workspaceId },
      metadata: { requestId }
    })

    const response = NextResponse.json(form, { status: 201 })
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    logger.error('form-create-error', { requestId, error: error.message })
    const response = NextResponse.json({ message: 'Erro ao criar formulário' }, { status: 500 })
    response.headers.set('x-request-id', requestId)
    return response
  }
}
