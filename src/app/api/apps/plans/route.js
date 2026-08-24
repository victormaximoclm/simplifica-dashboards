import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session || !isHighAdmin(session.user.role)) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const plans = await prisma.plan.findMany({ orderBy: { maxUsers: 'asc' } })
  return NextResponse.json(plans)
}
