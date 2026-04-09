export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { trackServerError } from '@/libs/errorTracking'
import { getRequestId, jsonWithRequestId } from '@/libs/logger'

export async function POST(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions).catch(() => null)
  const payload = await req.json().catch(() => ({}))

  await trackServerError({
    source: payload.source || 'frontend',
    level: payload.level || 'error',
    message: payload.message || 'frontend-error',
    stack: payload.stack || null,
    path: payload.path || null,
    method: payload.method || null,
    requestId: payload.requestId || requestId,
    userId: session?.user?.id || null,
    tenantId: session?.user?.workspaceId || null,
    metadata: {
      userAgent: req.headers.get('user-agent') || null,
      ...(payload.metadata || {})
    }
  })

  return jsonWithRequestId({ ok: true }, { requestId })
}
