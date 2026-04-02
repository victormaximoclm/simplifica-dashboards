export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
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

    if (!['http:', 'https:'].includes(url.protocol)) {
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

const dashboardIncludes = {
  workspace: { select: { id: true, name: true } },
  allowedRoles: {
    include: { customRole: { select: { id: true, name: true } } }
  }
}

// GET /api/apps/dashboards/:id
export async function GET(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  const dashboard = await prisma.dashboard.findUnique({
    where: { id },
    include: dashboardIncludes
  })

  if (!dashboard) {
    return NextResponse.json({ message: 'Dashboard não encontrado' }, { status: 404 })
  }

  // High admins (superAdmin, subAdmin): access to everything
  if (isHighAdmin(session.user.role)) {
    return NextResponse.json(dashboard)
  }

  // Must be in same workspace
  if (dashboard.workspaceId !== session.user.workspaceId) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  // Admin sees all dashboards in their workspace
  if (session.user.role === 'admin') {
    return NextResponse.json(dashboard)
  }

  // Regular user: check if their customRoleId is in allowedRoles
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { customRoleId: true }
  })

  const hasAccess = user?.customRoleId && dashboard.allowedRoles.some(ar => ar.customRoleId === user.customRoleId)

  if (!hasAccess) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  return NextResponse.json(dashboard)
}

// PUT /api/apps/dashboards/:id (superAdmin only)
export async function PUT(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  if (!isHighAdmin(session.user.role)) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const body = await req.json()
  const { iframeCode, workspaceId, allowedRoleIds, title: customTitle } = body

  const existing = await prisma.dashboard.findUnique({ where: { id } })

  if (!existing) {
    return NextResponse.json({ message: 'Dashboard não encontrado' }, { status: 404 })
  }

  const updateData = {}

  if (iframeCode) {
    const parsed = parseIframe(iframeCode)

    if (!parsed.embedUrl) {
      return NextResponse.json({ message: 'Não foi possível extrair a URL do iframe' }, { status: 400 })
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
      return NextResponse.json({ message: 'Workspace não encontrado' }, { status: 404 })
    }

    updateData.workspaceId = workspaceId
  }

  // Update allowed roles if provided
  if (Array.isArray(allowedRoleIds)) {
    updateData.allowedRoles = {
      deleteMany: {},
      create: allowedRoleIds.map(customRoleId => ({ customRoleId }))
    }
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

  return NextResponse.json(dashboard)
}

// DELETE /api/apps/dashboards/:id (superAdmin only)
export async function DELETE(req, { params }) {
  const { id } = await params
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  if (!isHighAdmin(session.user.role)) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const existing = await prisma.dashboard.findUnique({ where: { id } })

  if (!existing) {
    return NextResponse.json({ message: 'Dashboard não encontrado' }, { status: 404 })
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

  return NextResponse.json({ message: 'Dashboard excluído' })
}
