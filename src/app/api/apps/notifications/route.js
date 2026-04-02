export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'
import { dismissNotificationSchema, markReadSchema, parseBody } from '@/libs/validations'

/** Tipos visíveis para Admin: convite, remoção de usuário, dashboard criado/removido (não vê mudanças de cargo/status de usuário). */
const ADMIN_NOTIFICATION_TYPES = ['user_invited', 'user_deleted', 'dashboard_created', 'dashboard_deleted']

const NOTIFICATION_MAX_AGE_DAYS = 14

/**
 * Filtro base de visibilidade por perfil (sem janela de 14 dias nem exclusão de dismissed).
 * - superAdmin / subAdmin: sem restrição — veem todas as notificações de todos os workspaces.
 * - admin: apenas notificações do próprio workspaceId da sessão; só tipos administrativos definidos.
 * - user: apenas workspace do usuário; só tipo dashboard_updated; exige dashboardId e que o cargo do usuário
 *   esteja em DashboardVisibility (join implícito via relação dashboard.allowedRoles).
 */
async function buildNotificationAccessWhere(session, currentUserDbId) {
  const role = session.user.role
  const sessionWorkspaceId = session.user.workspaceId

  if (isHighAdmin(role)) {
    return {}
  }

  if (role === 'admin') {
    if (!sessionWorkspaceId) {
      return { id: { in: [] } }
    }

    return {
      workspaceId: sessionWorkspaceId,
      type: { in: ADMIN_NOTIFICATION_TYPES }
    }
  }

  if (role === 'user') {
    const u = await prisma.user.findUnique({
      where: { id: currentUserDbId },
      select: { workspaceId: true, customRoleId: true }
    })

    if (!u?.workspaceId || !u.customRoleId) {
      return { id: { in: [] } }
    }

    return {
      workspaceId: u.workspaceId,
      type: 'dashboard_updated',
      dashboardId: { not: null },
      dashboard: {
        allowedRoles: {
          some: { customRoleId: u.customRoleId }
        }
      }
    }
  }

  return { id: { in: [] } }
}

function buildListWhere(accessWhere, currentUserDbId) {
  const expiryDate = new Date()

  expiryDate.setDate(expiryDate.getDate() - NOTIFICATION_MAX_AGE_DAYS)

  return {
    AND: [
      accessWhere,
      { createdAt: { gte: expiryDate } },
      { dismissedBy: { none: { userId: currentUserDbId } } }
    ]
  }
}

// GET /api/apps/notifications — lista já filtrada no servidor; mesma forma de resposta de antes
export async function GET(req) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100)

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  })

  if (!currentUser) {
    return NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 })
  }

  const accessWhere = await buildNotificationAccessWhere(session, currentUser.id)
  const where = buildListWhere(accessWhere, currentUser.id)

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      workspace: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, image: true } },
      readBy: {
        where: { userId: currentUser.id },
        select: { id: true }
      }
    }
  })

  const result = notifications.map(n => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    workspace: n.workspace,
    createdBy: n.createdBy,
    read: n.readBy.length > 0,
    createdAt: n.createdAt
  }))

  return NextResponse.json(result)
}

// PATCH — marcar como lida(s); só IDs que o usuário tem permissão para ver
export async function PATCH(req) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  const parsed = parseBody(markReadSchema, await req.json())

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.message }, { status: 400 })
  }

  const { notificationIds, readAll } = parsed.data

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  })

  if (!currentUser) {
    return NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 })
  }

  const accessWhere = await buildNotificationAccessWhere(session, currentUser.id)

  const expiryDate = new Date()

  expiryDate.setDate(expiryDate.getDate() - NOTIFICATION_MAX_AGE_DAYS)

  let ids = []

  if (readAll) {
    const whereReadAll = {
      AND: [
        accessWhere,
        { createdAt: { gte: expiryDate } },
        { dismissedBy: { none: { userId: currentUser.id } } }
      ]
    }

    const allNotifications = await prisma.notification.findMany({
      where: whereReadAll,
      select: { id: true }
    })

    ids = allNotifications.map(n => n.id)
  } else {
    ids = notificationIds || []

    if (ids.length === 0) {
      return NextResponse.json({ message: 'OK' })
    }

    const allowed = await prisma.notification.findMany({
      where: {
        AND: [
          accessWhere,
          { id: { in: ids } },
          { createdAt: { gte: expiryDate } },
          { dismissedBy: { none: { userId: currentUser.id } } }
        ]
      },
      select: { id: true }
    })

    const allowedSet = new Set(allowed.map(a => a.id))

    if (ids.some(i => !allowedSet.has(i))) {
      return NextResponse.json(
        { message: 'Uma ou mais notificações não existem ou você não tem permissão para alterá-las.' },
        { status: 403 }
      )
    }
  }

  if (ids.length === 0) {
    return NextResponse.json({ message: 'OK' })
  }

  await prisma.notificationRead.createMany({
    data: ids.map(notificationId => ({
      notificationId,
      userId: currentUser.id
    })),
    skipDuplicates: true
  })

  return NextResponse.json({ message: 'OK' })
}

// DELETE — ocultar para o usuário; só se a notificação estiver no escopo de visibilidade
export async function DELETE(req) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  const parsed = parseBody(dismissNotificationSchema, await req.json())

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.message }, { status: 400 })
  }

  const { id } = parsed.data

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  })

  if (!currentUser) {
    return NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 })
  }

  const accessWhere = await buildNotificationAccessWhere(session, currentUser.id)

  const expiryDate = new Date()

  expiryDate.setDate(expiryDate.getDate() - NOTIFICATION_MAX_AGE_DAYS)

  const notification = await prisma.notification.findFirst({
    where: {
      AND: [
        accessWhere,
        { id },
        { createdAt: { gte: expiryDate } },
        { dismissedBy: { none: { userId: currentUser.id } } }
      ]
    },
    select: { id: true }
  })

  if (!notification) {
    return NextResponse.json({ message: 'Notificação não encontrada' }, { status: 404 })
  }

  await prisma.notificationDismiss
    .create({
      data: {
        notificationId: id,
        userId: currentUser.id
      }
    })
    .catch(() => {})

  return NextResponse.json({ message: 'Notificação ocultada' })
}
