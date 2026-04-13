export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { touchUserActivity } from '@/libs/activity'
import { getRequestId, jsonWithRequestId } from '@/libs/logger'

export async function POST(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  await touchUserActivity(session.user.id, 1)

  return jsonWithRequestId({ ok: true }, { requestId })
}
