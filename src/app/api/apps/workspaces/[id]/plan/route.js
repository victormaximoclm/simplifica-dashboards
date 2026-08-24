import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'

export async function PATCH(req, { params }) {
  const session = await getServerSession(authOptions)

  if (!session || !isHighAdmin(session.user.role)) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { planId, extraUserSlots } = await req.json()

  if (!planId || typeof extraUserSlots !== 'number' || extraUserSlots < 0) {
    return NextResponse.json({ message: 'Dados inválidos' }, { status: 400 })
  }

  const workspace = await prisma.workspace.update({
    where: { id },
    data: { planId, extraUserSlots },
    include: { plan: true, _count: { select: { users: true } } }
  })

  return NextResponse.json(workspace)
}
