import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'

// GET /api/apps/users - List users (high admins see all, others see own workspace)
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
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
      workspace: { select: { id: true, name: true } }
    },
    orderBy: { name: 'asc' }
  })

  return NextResponse.json(users)
}
