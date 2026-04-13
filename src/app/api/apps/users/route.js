export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getRequestId, logger } from '@/libs/logger'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'

// GET /api/apps/users - List users (high admins see all, others see own workspace)
export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    logger.warn('users-list-unauthorized', { requestId })
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const where = isHighAdmin(session.user.role) ? {} : { workspaceId: session.user.workspaceId }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      status: true,
      lastLoginAt: true,
      lastActivityAt: true,
      workspace: { select: { id: true, name: true } }
    },
    orderBy: { name: 'asc' }
  })

  logger.debug('users-list-success', { requestId, userId: session.user.id, count: users.length })
  const response = NextResponse.json(users)
  response.headers.set('x-request-id', requestId)
  return response
}
