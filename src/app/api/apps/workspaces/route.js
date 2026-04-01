import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'

// GET /api/apps/workspaces - List workspaces
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  // Only high admins can list all workspaces
  if (!isHighAdmin(session.user.role)) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const workspaces = await prisma.workspace.findMany({
    include: {
      _count: {
        select: { users: true }
      }
    },
    orderBy: { name: 'asc' }
  })

  return NextResponse.json(workspaces)
}

// POST /api/apps/workspaces - Create workspace
export async function POST(req) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  if (session.user.role !== 'superAdmin') {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const { name } = await req.json()

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ message: 'Nome é obrigatório' }, { status: 400 })
  }

  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  // Check if slug already exists
  const existing = await prisma.workspace.findUnique({ where: { slug } })

  if (existing) {
    return NextResponse.json({ message: 'Já existe um espaço de trabalho com esse nome' }, { status: 409 })
  }

  const workspace = await prisma.workspace.create({
    data: { name: name.trim(), slug }
  })

  return NextResponse.json(workspace, { status: 201 })
}
