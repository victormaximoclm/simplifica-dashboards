export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'

/**
 * GET /api/auth/session-status — usado pelo cliente (área logada) para detectar inativação/remoção sem esperar expirar o JWT.
 * Resposta: { ok: true } | { ok: false, reason: 'inactive' | 'removed' }
 */
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, reason: 'unauthenticated' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { status: true }
  })

  if (!user) {
    return NextResponse.json({ ok: false, reason: 'removed' })
  }

  if (user.status === 'inactive') {
    return NextResponse.json({ ok: false, reason: 'inactive' })
  }

  return NextResponse.json({ ok: true })
}
