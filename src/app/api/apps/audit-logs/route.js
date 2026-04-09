export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { isHighAdmin } from '@/utils/roleHelpers'

const AUDIT_ACTIONS_ALLOWED = [
  'USER_LOGIN',
  'DASHBOARD_CREATE',
  'DASHBOARD_UPDATE',
  'DASHBOARD_DELETE',
  'DASHBOARD_VIEW',
  'EMBED_ACCESS'
]

export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (!isHighAdmin(session.user.role)) {
    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get('pageSize') || 20)))
  const action = searchParams.get('action') || undefined
  const entityType = searchParams.get('entityType') || undefined
  const tenantId = searchParams.get('tenantId') || undefined
  const q = searchParams.get('q') || undefined

  const where = {
    action: action || { in: AUDIT_ACTIONS_ALLOWED },
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(tenantId ? { tenantId } : {}),
    ...(q
      ? {
          OR: [{ entityId: { contains: q, mode: 'insensitive' } }, { action: { contains: q, mode: 'insensitive' } }]
        }
      : {})
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        tenant: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.auditLog.count({ where })
  ])

  logger.debug('audit-log-list-success', {
    requestId,
    userId: session.user.id,
    page,
    pageSize,
    total
  })

  return jsonWithRequestId(
    {
      items: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
      }
    },
    { requestId }
  )
}
