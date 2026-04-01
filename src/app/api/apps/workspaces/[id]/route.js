import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'
import { createWorkspaceSchema, parseBody } from '@/libs/validations'

// GET /api/apps/workspaces/[id] - Get single workspace
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params

  // Users can only see their own workspace
  if (!isHighAdmin(session.user.role) && session.user.workspaceId !== id) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      users: {
        select: { id: true, name: true, email: true, role: true, image: true }
      }
    }
  })

  if (!workspace) {
    return NextResponse.json({ message: 'Espaço de trabalho não encontrado' }, { status: 404 })
  }

  return NextResponse.json(workspace)
}

// PUT /api/apps/workspaces/[id] - Update workspace
export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  if (!isHighAdmin(session.user.role)) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params

  const parsed = parseBody(createWorkspaceSchema, await req.json())

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.message }, { status: 400 })
  }

  const { name } = parsed.data

  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  // Check slug conflict with other workspaces
  const existing = await prisma.workspace.findFirst({
    where: { slug, NOT: { id } }
  })

  if (existing) {
    return NextResponse.json({ message: 'Já existe um espaço de trabalho com esse nome' }, { status: 409 })
  }

  const workspace = await prisma.workspace.update({
    where: { id },
    data: { name: name.trim(), slug }
  })

  return NextResponse.json(workspace)
}

// DELETE /api/apps/workspaces/[id] - Delete workspace
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  if (!isHighAdmin(session.user.role)) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params

  // Get workspace info for the response
  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      _count: {
        select: { users: true, dashboards: true }
      }
    }
  })

  if (!workspace) {
    return NextResponse.json({ message: 'Espaço de trabalho não encontrado' }, { status: 404 })
  }

  // Cascade: delete all related users, dashboards, notifications
  await prisma.workspace.delete({ where: { id } })

  return NextResponse.json({
    message: `Espaço "${workspace.name}" excluído com ${workspace._count.users} usuário(s) e ${workspace._count.dashboards} dashboard(s).`
  })
}
