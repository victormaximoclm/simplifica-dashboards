export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createDedupedAuditLog } from '@/libs/auditService'
import { getAuthorizedDashboard } from '@/libs/dashboardAccess'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'

export async function POST(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  const body = await req.json().catch(() => ({}))
  const dashboardId = body?.dashboardId

  if (!dashboardId) {
    return jsonWithRequestId({ message: 'dashboardId é obrigatório' }, { status: 400, requestId })
  }

  const access = await getAuthorizedDashboard({ dashboardId, session })
  if (!access.ok) {
    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const result = await createDedupedAuditLog({
    userId: session.user.id,
    tenantId: access.dashboard.workspaceId,
    action: 'DASHBOARD_VIEW',
    resource: 'dashboard',
    resourceId: dashboardId,
    metadata: { requestId, source: 'dashboard-view-page' },
    requestId,
    dedupeWindowMinutes: 15
  })

  if (result.created) {
    logger.info('audit-dashboard-view', {
      requestId,
      userId: session.user.id,
      dashboardId
    })
  }

  return jsonWithRequestId({ ok: true, deduped: result.deduped }, { requestId })
}
