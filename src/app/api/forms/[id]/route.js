export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { getRequestId, logger } from '@/libs/logger'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'
import { createAuditLog } from '@/libs/auditService'
import { createNotification } from '@/libs/notifications'
import { canNonHighAdminAccessForm, getUserFormContext } from '@/libs/formAccess'
import { canManageFormInWorkspace } from '@/libs/formWorkspace'
import { canManageForms } from '@/libs/formPermissions'

// GET /api/forms/[id]
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

    const form = await prisma.form.findUnique({
      where: { id },
      include: { workspace: true, publicLinks: { orderBy: { createdAt: 'desc' }, take: 10 } }
    })

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

      if (role !== 'admin') {
        const formsModule = await prisma.module.findUnique({ where: { key: 'forms' } })
        if (!formsModule || !ctx.customRoleId) {
          const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
          response.headers.set('x-request-id', requestId)
          return response
        }
        const perm = await prisma.rolePermission.findFirst({
          where: { customRoleId: ctx.customRoleId, moduleId: formsModule.id, action: 'view', resourceId: id }
        })
        if (!perm) {
          const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
          response.headers.set('x-request-id', requestId)
          return response
        }
      }
    }

    const response = NextResponse.json(form)
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    logger.error('form-get-error', { requestId, error: error.message })
    const response = NextResponse.json({ message: 'Erro ao buscar formulário' }, { status: 500 })
    response.headers.set('x-request-id', requestId)
    return response
  }
}

// PUT /api/forms/[id]
export async function PUT(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session || !canManageForms(session.user.role)) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  try {
    const { id } = await params
    const body = await req.json()
    const {
      title,
      description,
      fields,
      webhookUrl,
      allowPublicLink,
      allowedCargos,
      allowedRoles,
      pagination,
      refreshOnSubmit
    } = body

    const form = await prisma.form.findUnique({ where: { id } })

    if (!form) {
      const response = NextResponse.json({ message: 'Formulário não encontrado' }, { status: 404 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    if (!canManageFormInWorkspace(session, form.workspaceId)) {
      const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    const updated = await prisma.form.update({
      where: { id },
      data: {
        title,
        description,
        fields,
        webhookUrl,
        allowPublicLink,
        allowedCargos: allowedCargos ?? [],
        allowedRoles: allowedRoles ?? [],
        pagination: pagination ?? { enabled: false, perPage: 10 },
        refreshOnSubmit: refreshOnSubmit
      }
    })

    // Sincroniza RolePermission
    if (Array.isArray(allowedRoles)) {
      const formsModule = await prisma.module.findUnique({ where: { key: 'forms' } })
      if (formsModule) {
        await prisma.rolePermission.deleteMany({
          where: { moduleId: formsModule.id, resourceId: id, action: 'view' }
        })
        if (allowedRoles.length > 0) {
          await prisma.rolePermission.createMany({
            data: allowedRoles.map(roleId => ({
              id: 'rp_' + Math.random().toString(36).slice(2, 10),
              customRoleId: roleId,
              moduleId: formsModule.id,
              action: 'view',
              resourceId: id
            })),
            skipDuplicates: true
          })
        }
      }
    }

    await createAuditLog({
      userId: session.user.id,
      tenantId: form.workspaceId,
      action: 'FORM_UPDATE',
      entityType: 'form',
      entityId: id,
      before: { title: form.title },
      after: { title },
      metadata: { requestId }
    })

    const response = NextResponse.json(updated)
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    logger.error('form-update-error', { requestId, error: error.message })
    const response = NextResponse.json({ message: 'Erro ao atualizar formulário' }, { status: 500 })
    response.headers.set('x-request-id', requestId)
    return response
  }
}

// DELETE /api/forms/[id]
export async function DELETE(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session || !canManageForms(session.user.role)) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
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

    if (!canManageFormInWorkspace(session, form.workspaceId)) {
      const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    await prisma.rolePermission.deleteMany({
      where: { resourceId: id }
    })

    await prisma.form.delete({ where: { id } })

    await createNotification({
      type: 'form_deleted',
      title: 'Formulário deletado',
      message: `${session.user.name || session.user.email} deletou o formulário "${form.title}"`,
      workspaceId: form.workspaceId,
      createdById: session.user.id
    })

    await createAuditLog({
      userId: session.user.id,
      tenantId: form.workspaceId,
      action: 'FORM_DELETE',
      entityType: 'form',
      entityId: id,
      before: { title: form.title },
      metadata: { requestId }
    })

    const response = NextResponse.json({ message: 'Formulário deletado' })
    response.headers.set('x-request-id', requestId)
    return response
  } catch (error) {
    logger.error('form-delete-error', { requestId, error: error.message })
    const response = NextResponse.json({ message: 'Erro ao deletar formulário' }, { status: 500 })
    response.headers.set('x-request-id', requestId)
    return response
  }
}
