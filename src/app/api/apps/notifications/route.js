import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'

// GET /api/apps/notifications - List notifications filtered by role
export async function GET(req) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100)

  const userRole = session.user.role
  const userWorkspaceId = session.user.workspaceId

  // Determine user ID for read status
  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  })

  if (!currentUser) {
    return NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 })
  }

  let where = {}

  if (isHighAdmin(userRole)) {
    // Super Admin / Sub Admin: see ALL notifications from ALL workspaces
    where = {}
  } else if (userRole === 'admin') {
    // Admin: see all types from their workspace EXCEPT pending status (high admin only)
    where = {
      workspaceId: userWorkspaceId,
      type: { not: 'user_status_pending' }
    }
  } else {
    // Regular user: only dashboard_created from their workspace
    where = {
      workspaceId: userWorkspaceId,
      type: { in: ['dashboard_created', 'dashboard_deleted'] }
    }
  }

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

// PATCH /api/apps/notifications - Mark notifications as read
export async function PATCH(req) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const { notificationIds, readAll } = body

  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true }
  })

  if (!currentUser) {
    return NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 })
  }

  let ids = notificationIds || []

  if (readAll) {
    // Get all unread notification IDs for this user
    const userRole = session.user.role
    const userWorkspaceId = session.user.workspaceId

    let where = {}

    if (isHighAdmin(userRole)) {
      where = {}
    } else if (userRole === 'admin') {
      where = { workspaceId: userWorkspaceId }
    } else {
      where = {
        workspaceId: userWorkspaceId,
        type: { in: ['dashboard_created', 'dashboard_deleted'] }
      }
    }

    const allNotifications = await prisma.notification.findMany({
      where,
      select: { id: true }
    })

    ids = allNotifications.map(n => n.id)
  }

  if (ids.length === 0) {
    return NextResponse.json({ message: 'OK' })
  }

  // Upsert read records (skip existing)
  await prisma.notificationRead.createMany({
    data: ids.map(notificationId => ({
      notificationId,
      userId: currentUser.id
    })),
    skipDuplicates: true
  })

  return NextResponse.json({ message: 'OK' })
}
