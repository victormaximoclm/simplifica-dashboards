import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'

// GET /api/apps/custom-roles - List all custom roles (global)
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  const roles = await prisma.customRole.findMany({
    include: {
      _count: { select: { users: true, dashboardVisibility: true } }
    },
    orderBy: { name: 'asc' }
  })

  return NextResponse.json(roles)
}

// POST /api/apps/custom-roles - Create custom role (superAdmin only)
export async function POST(req) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  if (session.user.role !== 'superAdmin' && session.user.role !== 'subAdmin') {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const { name } = await req.json()

  if (!name || !name.trim()) {
    return NextResponse.json({ message: 'Nome do cargo é obrigatório' }, { status: 400 })
  }

  // Check for duplicate name
  const existing = await prisma.customRole.findUnique({
    where: { name: name.trim() }
  })

  if (existing) {
    return NextResponse.json({ message: 'Já existe um cargo com esse nome' }, { status: 409 })
  }

  const role = await prisma.customRole.create({
    data: { name: name.trim() },
    include: {
      _count: { select: { users: true, dashboardVisibility: true } }
    }
  })

  return NextResponse.json(role, { status: 201 })
}
