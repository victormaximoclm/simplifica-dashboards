export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { dashboardIncludes, stripDashboardSensitiveFields } from '@/libs/dashboardAccess'
import { getRequestId, logger } from '@/libs/logger'
import { isHighAdmin } from '@/utils/roleHelpers'
import { createNotification } from '@/libs/notifications'
import { prisma } from '@/libs/prisma'
import { createDashboardSchema, parseBody } from '@/libs/validations'

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

// GET /api/apps/dashboards - List dashboards for current user
export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    logger.warn('dashboards-list-unauthorized', { requestId })
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { searchParams } = new URL(req.url)
  const workspaceFilter = searchParams.get('workspaceId')
  const userRole = session.user.role

  let where = {}

  if (isHighAdmin(userRole)) {
    // High admins see all dashboards, optionally filtered by workspace
    if (workspaceFilter) {
      where.workspaceId = workspaceFilter
    }
  } else if (userRole === 'admin') {
    // Admin sees all dashboards in their workspace
    where.workspaceId = session.user.workspaceId
  } else {
    where.workspaceId = session.user.workspaceId

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { customRoleId: true }
    })

    if (!user?.customRoleId) {
      const response = NextResponse.json([])
      response.headers.set('x-request-id', requestId)
      return response
    }

    const dashboardModule = await prisma.module.findUnique({ where: { key: 'dashboards' } })

    const permissions = await prisma.rolePermission.findMany({
      where: { customRoleId: user.customRoleId, moduleId: dashboardModule.id, action: 'view' },
      select: { resourceId: true }
    })

    const allowedDashboardIds = permissions.map(p => p.resourceId).filter(Boolean)

    if (allowedDashboardIds.length === 0) {
      const response = NextResponse.json([])
      response.headers.set('x-request-id', requestId)
      return response
    }

    where.id = { in: allowedDashboardIds }
  }

  const dashboards = await prisma.dashboard.findMany({
    where,
    include: dashboardIncludes,
    orderBy: { createdAt: 'desc' }
  })

  logger.debug('dashboards-list-success', { requestId, userId: session.user.id, count: dashboards.length })
  const response = NextResponse.json(dashboards.map(stripDashboardSensitiveFields))
  response.headers.set('x-request-id', requestId)
  return response
}

// POST /api/apps/dashboards - Create dashboard (superAdmin only)
export async function POST(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    logger.warn('dashboard-create-unauthorized', { requestId })
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (!isHighAdmin(session.user.role)) {
    logger.warn('dashboard-create-forbidden', { requestId, userId: session.user.id, role: session.user.role })
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const parsed = parseBody(createDashboardSchema, await req.json())

  if (!parsed.success) {
    const response = NextResponse.json({ message: parsed.message }, { status: 400 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { iframeCode, workspaceId, allowedRoleIds, title: customTitle } = parsed.data

  // Validate workspace exists
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })

  if (!workspace) {
    const response = NextResponse.json({ message: 'Workspace não encontrado' }, { status: 404 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const iframeParsed = parseIframe(iframeCode)

  if (!iframeParsed.embedUrl) {
    const response = NextResponse.json(
      { message: 'Não foi possível extrair a URL do iframe. Verifique o código colado.' },
      { status: 400 }
    )
    response.headers.set('x-request-id', requestId)
    return response
  }

  const dashboard = await prisma.dashboard.create({
    data: {
      title: sanitizeDashboardTitle(customTitle || iframeParsed.title),
      embedUrl: iframeParsed.embedUrl,
      iframeCode,
      workspaceId
    },
    include: dashboardIncludes
  })

  if (allowedRoleIds?.length) {
    const dashboardModule = await prisma.module.findUnique({ where: { key: 'dashboards' } })
    await prisma.rolePermission.createMany({
      data: allowedRoleIds.map(roleId => ({
        id: 'rp_' + Math.random().toString(36).slice(2, 10),
        customRoleId: roleId,
        moduleId: dashboardModule.id,
        action: 'view',
        resourceId: dashboard.id
      })),
      skipDuplicates: true
    })
  }

  // Emit notification
  const creator = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })

  await createNotification({
    type: 'dashboard_created',
    title: 'Novo dashboard',
    message: `${session.user.name || session.user.email} adicionou o dashboard "${dashboard.title}" em ${workspace.name}`,
    workspaceId,
    createdById: creator?.id
  })

  logger.info('dashboard-create-success', {
    requestId,
    userId: session.user.id,
    dashboardId: dashboard.id,
    workspaceId
  })
  await createAuditLog({
    userId: session.user.id,
    tenantId: dashboard.workspaceId,
    action: 'DASHBOARD_CREATE',
    resource: 'dashboard',
    resourceId: dashboard.id,
    after: {
      title: dashboard.title,
      workspaceId: dashboard.workspaceId,
      allowedRoleCount: dashboard.allowedRoles.length
    },
    metadata: { requestId },
    requestId
  })
  const response = NextResponse.json(stripDashboardSensitiveFields(dashboard), { status: 201 })
  response.headers.set('x-request-id', requestId)
  return response
}
