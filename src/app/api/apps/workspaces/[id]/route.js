import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, logger } from '@/libs/logger'
import { canAccessWorkspace, canManageWorkspaceSettings } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'
import { createWorkspaceSchema, parseBody } from '@/libs/validations'
import { withCreatorOnPrivateGuestList, workspaceAccessInclude } from '@/libs/workspaceAccess'

const guestInclude = {
  guests: {
    include: { user: { select: { id: true, name: true, email: true } } }
  }
}

// GET /api/apps/workspaces/[id] - Get single workspace
export async function GET(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { id } = await params

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      users: { select: { id: true, name: true, email: true, role: true, image: true } },
      ...guestInclude
    }
  })

  if (!workspace) {
    const response = NextResponse.json({ message: 'Espaço de trabalho não encontrado' }, { status: 404 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (!canAccessWorkspace(session.user, workspace)) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const response = NextResponse.json(workspace)
  response.headers.set('x-request-id', requestId)
  return response
}

// PUT /api/apps/workspaces/[id] - Update workspace
export async function PUT(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { id } = await params

  const currentWorkspace = await prisma.workspace.findUnique({
    where: { id },
    include: workspaceAccessInclude
  })

  if (!currentWorkspace) {
    const response = NextResponse.json({ message: 'Espaço de trabalho não encontrado' }, { status: 404 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (!canManageWorkspaceSettings(session.user, currentWorkspace)) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const parsed = parseBody(createWorkspaceSchema, await req.json())

  if (!parsed.success) {
    const response = NextResponse.json({ message: parsed.message }, { status: 400 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { name, isPrivate, guests } = parsed.data

  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  // Check slug conflict with other workspaces
  const existing = await prisma.workspace.findFirst({
    where: { slug, NOT: { id } }
  })

  if (existing) {
    const response = NextResponse.json({ message: 'Já existe um espaço de trabalho com esse nome' }, { status: 409 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const guestList = withCreatorOnPrivateGuestList(!!isPrivate, guests, session.user.id, session.user.role)

  const workspace = await prisma.workspace.update({
    where: { id },
    data: {
      name: name?.trim(),
      isPrivate: !!isPrivate,
      guests: {
        deleteMany: {},
        create: guestList.map(g => ({ userId: g.userId, permission: g.permission }))
      }
    },
    include: guestInclude
  })

  logger.info('workspace-update-success', { requestId, userId: session.user.id, workspaceId: workspace.id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: workspace.id,
    action: 'WORKSPACE_UPDATE',
    resource: 'workspace',
    resourceId: workspace.id,
    before: {
      id: currentWorkspace.id,
      name: currentWorkspace.name,
      slug: currentWorkspace.slug,
      isPrivate: currentWorkspace.isPrivate
    },
    after: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      isPrivate: workspace.isPrivate
    },
    metadata: { requestId },
    requestId
  })
  const response = NextResponse.json(workspace)
  response.headers.set('x-request-id', requestId)
  return response
}

// DELETE /api/apps/workspaces/[id] - Delete workspace
export async function DELETE(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { id } = await params

  // Get workspace info for the response
  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      _count: {
        select: { users: true, dashboards: true }
      },
      ...workspaceAccessInclude
    }
  })

  if (!workspace) {
    const response = NextResponse.json({ message: 'Espaço de trabalho não encontrado' }, { status: 404 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (!canManageWorkspaceSettings(session.user, workspace)) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  // Cascade: delete all related users, dashboards, notifications, convites
  await prisma.workspace.delete({ where: { id } })

  logger.info('workspace-delete-success', { requestId, userId: session.user.id, workspaceId: id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: id,
    action: 'WORKSPACE_DELETE',
    resource: 'workspace',
    resourceId: id,
    before: {
      id: workspace.id,
      name: workspace.name,
      users: workspace._count.users,
      dashboards: workspace._count.dashboards
    },
    metadata: { requestId },
    requestId
  })
  const response = NextResponse.json({
    message: `Espaço "${workspace.name}" excluído com ${workspace._count.users} usuário(s) e ${workspace._count.dashboards} dashboard(s).`
  })
  response.headers.set('x-request-id', requestId)
  return response
}
