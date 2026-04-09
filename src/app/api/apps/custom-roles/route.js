export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { createCustomRoleSchema, parseBody } from '@/libs/validations'

// GET /api/apps/custom-roles - List all custom roles (global)
export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  const roles = await prisma.customRole.findMany({
    include: {
      _count: { select: { users: true, dashboardVisibility: true } }
    },
    orderBy: { name: 'asc' }
  })

  return jsonWithRequestId(roles, { requestId })
}

// POST /api/apps/custom-roles - Create custom role (superAdmin only)
export async function POST(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (session.user.role !== 'superAdmin' && session.user.role !== 'subAdmin') {
    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const parsed = parseBody(createCustomRoleSchema, await req.json())

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const { name } = parsed.data

  // Check for duplicate name
  const existing = await prisma.customRole.findUnique({
    where: { name: name.trim() }
  })

  if (existing) {
    return jsonWithRequestId({ message: 'Já existe um cargo com esse nome' }, { status: 409, requestId })
  }

  const role = await prisma.customRole.create({
    data: { name: name.trim() },
    include: {
      _count: { select: { users: true, dashboardVisibility: true } }
    }
  })

  logger.info('custom-role-create-success', { requestId, userId: session.user.id, customRoleId: role.id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: null,
    action: 'CUSTOM_ROLE_CREATE',
    resource: 'custom_role',
    resourceId: role.id,
    after: { name: role.name },
    metadata: { requestId },
    requestId
  })
  return jsonWithRequestId(role, { status: 201, requestId })
}
