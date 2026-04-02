export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
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

// GET /api/apps/dashboards - List dashboards for current user
export async function GET(req) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
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
    // Regular user: sees dashboards in their workspace that have their customRoleId in allowedRoles
    where.workspaceId = session.user.workspaceId

    // Get user's customRoleId
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { customRoleId: true }
    })

    if (user?.customRoleId) {
      where.allowedRoles = {
        some: { customRoleId: user.customRoleId }
      }
    } else {
      // User without custom role sees nothing
      return NextResponse.json([])
    }
  }

  const dashboards = await prisma.dashboard.findMany({
    where,
    include: dashboardIncludes,
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json(dashboards)
}

// POST /api/apps/dashboards - Create dashboard (superAdmin only)
export async function POST(req) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  if (!isHighAdmin(session.user.role)) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const parsed = parseBody(createDashboardSchema, await req.json())

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.message }, { status: 400 })
  }

  const { iframeCode, workspaceId, allowedRoleIds, title: customTitle } = parsed.data

  // Validate workspace exists
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })

  if (!workspace) {
    return NextResponse.json({ message: 'Workspace não encontrado' }, { status: 404 })
  }

  const iframeParsed = parseIframe(iframeCode)

  if (!iframeParsed.embedUrl) {
    return NextResponse.json(
      { message: 'Não foi possível extrair a URL do iframe. Verifique o código colado.' },
      { status: 400 }
    )
  }

  const dashboard = await prisma.dashboard.create({
    data: {
      title: sanitizeDashboardTitle(customTitle || iframeParsed.title),
      embedUrl: iframeParsed.embedUrl,
      iframeCode,
      workspaceId,
      allowedRoles: {
        create: (allowedRoleIds || []).map(customRoleId => ({ customRoleId }))
      }
    },
    include: dashboardIncludes
  })

  // Emit notification
  const creator = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })

  await createNotification({
    type: 'dashboard_created',
    title: 'Novo dashboard',
    message: `${session.user.name || session.user.email} adicionou o dashboard "${dashboard.title}" em ${workspace.name}`,
    workspaceId,
    createdById: creator?.id
  })

  return NextResponse.json(dashboard, { status: 201 })
}
