export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { isHighAdmin } from '@/utils/roleHelpers'

const ACCESS_ACTIONS = ['USER_LOGIN', 'DASHBOARD_VIEW', 'EMBED_ACCESS_BLOCKED']

export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  if (!isHighAdmin(session.user.role)) return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get('pageSize') || 20)))
  const tenantId = searchParams.get('tenantId') || undefined
  const userId = searchParams.get('userId') || undefined
  const q = searchParams.get('q') || undefined
  const from = searchParams.get('from') || undefined
  const to = searchParams.get('to') || undefined

  const createdAt =
    from || to
      ? {
          ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
          ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {})
        }
      : undefined

  const where = {
    action: { in: ACCESS_ACTIONS },
    ...(tenantId ? { tenantId } : {}),
    ...(userId ? { userId } : {}),
    ...(createdAt ? { createdAt } : {}),
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
        user: { select: { id: true, name: true, email: true } },
        tenant: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.auditLog.count({ where })
  ])

  const dashboardIds = [...new Set(rows.filter(r => r.entityType === 'dashboard' && r.entityId).map(r => r.entityId))]
  const userEntityIds = [...new Set(rows.filter(r => r.entityType === 'user' && r.entityId).map(r => r.entityId))]
  const workspaceEntityIds = [...new Set(rows.filter(r => r.entityType === 'workspace' && r.entityId).map(r => r.entityId))]

  const [dashboards, users, workspaces] = await Promise.all([
    dashboardIds.length
      ? prisma.dashboard.findMany({ where: { id: { in: dashboardIds } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    userEntityIds.length
      ? prisma.user.findMany({ where: { id: { in: userEntityIds } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([]),
    workspaceEntityIds.length
      ? prisma.workspace.findMany({ where: { id: { in: workspaceEntityIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ])

  const dashboardById = new Map(dashboards.map(d => [d.id, d.title]))
  const userById = new Map(users.map(u => [u.id, u.name || u.email || u.id]))
  const workspaceById = new Map(workspaces.map(w => [w.id, w.name]))

  const items = rows.map(r => {
    let resourceLabel = null
    if (r.entityType === 'dashboard' && r.entityId) resourceLabel = dashboardById.get(r.entityId) || null
    if (r.entityType === 'user' && r.entityId) resourceLabel = userById.get(r.entityId) || null
    if (r.entityType === 'workspace' && r.entityId) resourceLabel = workspaceById.get(r.entityId) || null

    return { ...r, resourceLabel }
  })

  logger.debug('audit-access-list', { requestId, userId: session.user.id, total })

  return jsonWithRequestId(
    {
      items,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
    },
    { requestId }
  )
}

