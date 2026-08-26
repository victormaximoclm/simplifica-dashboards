import { prisma } from '@/libs/prisma'
import { isHighAdmin, canAccessWorkspace } from '@/utils/roleHelpers'
import { workspaceAccessInclude } from '@/libs/workspaceAccess'

export const dashboardIncludes = {
  workspace: { select: { id: true, name: true } },
  allowedRoles: {
    include: { customRole: { select: { id: true, name: true } } }
  }
}
export function stripDashboardSensitiveFields(dashboard) {
  if (!dashboard) return dashboard

  const { embedUrl: _embedUrl, iframeCode: _iframeCode, ...safeDashboard } = dashboard

  return safeDashboard
}

export async function getAuthorizedDashboard({ dashboardId, session }) {
  if (!session) {
    return { ok: false, status: 401, message: 'Não autorizado' }
  }

  const dashboard = await prisma.dashboard.findUnique({
    where: { id: dashboardId },
    include: dashboardIncludes
  })

  if (!dashboard) {
    return { ok: false, status: 404, message: 'Dashboard não encontrado' }
  }

  if (isHighAdmin(session.user.role)) {
    // highAdmin só acessa dashboards de workspaces aos quais tem acesso (respeita isPrivate/guests)
    const workspace = await prisma.workspace.findUnique({
      where: { id: dashboard.workspaceId },
      select: { id: true, isPrivate: true, ...workspaceAccessInclude }
    })

    if (!workspace || !canAccessWorkspace(session.user, workspace)) {
      return { ok: false, status: 403, message: 'Acesso negado' }
    }

    return { ok: true, dashboard }
  }

  if (dashboard.workspaceId !== session.user.workspaceId) {
    return { ok: false, status: 403, message: 'Acesso negado' }
  }

  if (session.user.role === 'admin') {
    return { ok: true, dashboard }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { customRoleId: true }
  })

  if (!user?.customRoleId) {
    return { ok: false, status: 403, message: 'Acesso negado' }
  }

  const dashboardModule = await prisma.module.findUnique({ where: { key: 'dashboards' } })

  const hasAccess = await prisma.rolePermission.findFirst({
    where: {
      customRoleId: user.customRoleId,
      moduleId: dashboardModule.id,
      action: 'view',
      resourceId: dashboardId
    }
  })

  if (!hasAccess) {
    return { ok: false, status: 403, message: 'Acesso negado' }
  }

  return { ok: true, dashboard }
}
