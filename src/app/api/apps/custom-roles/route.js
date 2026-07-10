export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { createCustomRoleSchema, parseBody } from '@/libs/validations'

// GET /api/apps/custom-roles - List all custom roles (workspace)
export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  if (!session) return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })

  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId') || session.user.workspaceId

  if (!workspaceId) return jsonWithRequestId({ message: 'Workspace é obrigatório' }, { status: 400, requestId })

  const roles = await prisma.customRole.findMany({
    where: { workspaceId },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { users: true } },
      permissions: {
        include: { module: { select: { key: true } } }
      }
    }
  })

  const rolesWithCounts = roles.map(role => {
    const moduleCounts = {}
    role.permissions.forEach(p => {
      const key = p.module.key
      moduleCounts[key] = (moduleCounts[key] || 0) + 1
    })
    return { ...role, moduleCounts }
  })
  return jsonWithRequestId(rolesWithCounts, { requestId })
}

// POST /api/apps/custom-roles - Create custom role (superAdmin only)
export async function POST(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  if (!session) return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  if (session.user.role !== 'superAdmin' && session.user.role !== 'subAdmin')
    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })

  const parsed = parseBody(createCustomRoleSchema, await req.json())
  if (!parsed.success) return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })

  const { name, workspaceId } = parsed.data

  const existing = await prisma.customRole.findFirst({
    where: { workspaceId, name: name.trim() }
  })
  if (existing)
    return jsonWithRequestId(
      { message: 'Já existe um cargo com esse nome neste workspace' },
      { status: 409, requestId }
    )

  const role = await prisma.customRole.create({
    data: { name: name.trim(), workspaceId },
    include: { _count: { select: { users: true, dashboardVisibility: true } } }
  })

  await createAuditLog({
    userId: session.user.id,
    tenantId: workspaceId,
    action: 'CUSTOM_ROLE_CREATE',
    resource: 'custom_role',
    resourceId: role.id,
    after: { name: role.name, workspaceId },
    metadata: { requestId },
    requestId
  })
  return jsonWithRequestId(role, { status: 201, requestId })
}
