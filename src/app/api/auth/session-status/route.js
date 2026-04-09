export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getRequestId, jsonWithRequestId } from '@/libs/logger'
import { prisma } from '@/libs/prisma'

/**
 * GET /api/auth/session-status — usado pelo cliente (área logada) para detectar inativação/remoção sem esperar expirar o JWT.
 * Resposta: { ok: true } | { ok: false, reason: 'inactive' | 'removed' }
 */
export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return jsonWithRequestId({ ok: false, reason: 'unauthenticated' }, { status: 401, requestId })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { status: true }
  })

  if (!user) {
    return jsonWithRequestId({ ok: false, reason: 'removed' }, { requestId })
  }

  if (user.status === 'inactive') {
    return jsonWithRequestId({ ok: false, reason: 'inactive' }, { requestId })
  }

  return jsonWithRequestId({ ok: true }, { requestId })
}
