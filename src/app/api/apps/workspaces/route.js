import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, logger } from '@/libs/logger'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'
import { createWorkspaceSchema, parseBody } from '@/libs/validations'

// GET /api/apps/workspaces - List workspaces
export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  // Only high admins can list all workspaces
  if (!isHighAdmin(session.user.role)) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const workspaces = await prisma.workspace.findMany({
    include: {
      _count: {
        select: { users: true }
      }
    },
    orderBy: { name: 'asc' }
  })

  logger.debug('workspaces-list-success', { requestId, userId: session.user.id, count: workspaces.length })
  const response = NextResponse.json(workspaces)
  response.headers.set('x-request-id', requestId)
  return response
}

// POST /api/apps/workspaces - Create workspace
export async function POST(req) {
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

  const parsed = parseBody(createWorkspaceSchema, await req.json())

  if (!parsed.success) {
    const response = NextResponse.json({ message: parsed.message }, { status: 400 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { name } = parsed.data

  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  // Check if slug already exists
  const existing = await prisma.workspace.findUnique({ where: { slug } })

  if (existing) {
    const response = NextResponse.json({ message: 'Já existe um espaço de trabalho com esse nome' }, { status: 409 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const workspace = await prisma.workspace.create({
    data: { name: name.trim(), slug }
  })

  logger.info('workspace-create-success', { requestId, userId: session.user.id, workspaceId: workspace.id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: workspace.id,
    action: 'WORKSPACE_CREATE',
    resource: 'workspace',
    resourceId: workspace.id,
    after: { name: workspace.name, slug: workspace.slug },
    metadata: { requestId },
    requestId
  })
  const response = NextResponse.json(workspace, { status: 201 })
  response.headers.set('x-request-id', requestId)
  return response
}
