export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { dashboardIncludes, getAuthorizedDashboard, stripDashboardSensitiveFields } from '@/libs/dashboardAccess'
import { getRequestId, logger } from '@/libs/logger'
import { isHighAdmin } from '@/utils/roleHelpers'
import { createNotification } from '@/libs/notifications'
import { prisma } from '@/libs/prisma'

function sanitizeDashboardTitle(value) {
  return String(value || 'Dashboard sem título')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 120)
}

function validateEmbedUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || '').trim())

    if (url.protocol !== 'https:' || url.hostname !== 'app.powerbi.com') {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

function parseIframe(iframeCode) {
  const srcMatch = iframeCode.match(/src\s*=\s*["']([^"']+)["']/i)
  const titleMatch = iframeCode.match(/title\s*=\s*["']([^"']+)["']/i)
  const embedUrl = srcMatch ? validateEmbedUrl(srcMatch[1]) : null

  return {
    embedUrl,
    title: sanitizeDashboardTitle(titleMatch ? titleMatch[1] : 'Dashboard sem título')
  }
}

// GET /api/apps/dashboards/:id
export async function GET(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedDashboard({ dashboardId: id, session })

  if (!access.ok) {
    logger.warn('dashboard-read-denied', { requestId, dashboardId: id, status: access.status })
    const response = NextResponse.json({ message: access.message }, { status: access.status })
    response.headers.set('x-request-id', requestId)
    return response
  }

  logger.debug('dashboard-read-success', { requestId, dashboardId: id, userId: session?.user?.id })

  const dashboardModule = await prisma.module.findUnique({ where: { key: 'dashboards' } })
  const permissions = dashboardModule
    ? await prisma.rolePermission.findMany({
        where: { moduleId: dashboardModule.id, action: 'view', resourceId: id },
        include: { customRole: { select: { id: true, name: true } } }
      })
    : []

  const dashboardWithPerms = { ...access.dashboard, permissions }
  const response = NextResponse.json(stripDashboardSensitiveFields(dashboardWithPerms))
  response.headers.set('x-request-id', requestId)
  return response
}

// PUT /api/apps/dashboards/:id (superAdmin only)
export async function PUT(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (!isHighAdmin(session.user.role)) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const body = await req.json()
  const { iframeCode, workspaceId, allowedRoleIds, title: customTitle } = body

  const existing = await prisma.dashboard.findUnique({ where: { id } })

  if (!existing) {
    const response = NextResponse.json({ message: 'Dashboard não encontrado' }, { status: 404 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const updateData = {}

  if (iframeCode) {
    const parsed = parseIframe(iframeCode)

    if (!parsed.embedUrl) {
      const response = NextResponse.json({ message: 'Não foi possível extrair a URL do iframe' }, { status: 400 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    updateData.iframeCode = iframeCode
    updateData.embedUrl = parsed.embedUrl
    updateData.title = sanitizeDashboardTitle(customTitle || parsed.title)
  } else if (customTitle) {
    updateData.title = sanitizeDashboardTitle(customTitle)
  }

  if (workspaceId) {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } })

    if (!ws) {
      const response = NextResponse.json({ message: 'Workspace não encontrado' }, { status: 404 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    updateData.workspaceId = workspaceId
  }

  // Update allowed roles if provided
  if (Array.isArray(allowedRoleIds)) {
    const dashboardModule = await prisma.module.findUnique({ where: { key: 'dashboards' } })

    // Remove permissões antigas deste dashboard
    await prisma.rolePermission.deleteMany({
      where: { moduleId: dashboardModule.id, resourceId: id, action: 'view' }
    })

    // Cria novas
    if (allowedRoleIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: allowedRoleIds.map(roleId => ({
          id: 'rp_' + Math.random().toString(36).slice(2, 10),
          customRoleId: roleId,
          moduleId: dashboardModule.id,
          action: 'view',
          resourceId: id
        })),
        skipDuplicates: true
      })
    }

    // Remove allowedRoles do updateData (não usa mais DashboardVisibility)
    delete updateData.allowedRoles
  }

  const dashboard = await prisma.dashboard.update({
    where: { id },
    data: updateData,
    include: dashboardIncludes
  })

  const editor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })

  await createNotification({
    type: 'dashboard_updated',
    title: 'Dashboard atualizado',
    message: `${session.user.name || session.user.email} atualizou o dashboard "${dashboard.title}"`,
    workspaceId: dashboard.workspaceId,
    dashboardId: dashboard.id,
    createdById: editor?.id
  })

  logger.info('dashboard-update-success', { requestId, dashboardId: dashboard.id, userId: session.user.id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: dashboard.workspaceId,
    action: 'DASHBOARD_UPDATE',
    resource: 'dashboard',
    resourceId: dashboard.id,
    before: { title: existing.title, workspaceId: existing.workspaceId },
    after: { title: dashboard.title, workspaceId: dashboard.workspaceId },
    metadata: { requestId },
    requestId
  })
  const response = NextResponse.json(stripDashboardSensitiveFields(dashboard))
  response.headers.set('x-request-id', requestId)
  return response
}

// DELETE /api/apps/dashboards/:id (superAdmin only)
export async function DELETE(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (!isHighAdmin(session.user.role)) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const existing = await prisma.dashboard.findUnique({ where: { id } })

  if (!existing) {
    const response = NextResponse.json({ message: 'Dashboard não encontrado' }, { status: 404 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  await prisma.dashboard.delete({ where: { id } })

  // Emit notification
  const deleter = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })

  await createNotification({
    type: 'dashboard_deleted',
    title: 'Dashboard removido',
    message: `${session.user.name || session.user.email} removeu o dashboard "${existing.title}"`,
    workspaceId: existing.workspaceId,
    createdById: deleter?.id
  })

  logger.info('dashboard-delete-success', { requestId, dashboardId: id, userId: session.user.id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: existing.workspaceId,
    action: 'DASHBOARD_DELETE',
    resource: 'dashboard',
    resourceId: id,
    before: { title: existing.title, workspaceId: existing.workspaceId },
    metadata: { requestId },
    requestId
  })
  const response = NextResponse.json({ message: 'Dashboard excluído' })
  response.headers.set('x-request-id', requestId)
  return response
}
