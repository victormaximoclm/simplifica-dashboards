import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'

// PUT /api/apps/custom-roles/[id] - Update custom role (superAdmin/subAdmin)
export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  if (session.user.role !== 'superAdmin' && session.user.role !== 'subAdmin') {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { name } = await req.json()

  if (!name || !name.trim()) {
    return NextResponse.json({ message: 'Nome do cargo é obrigatório' }, { status: 400 })
  }

  const existing = await prisma.customRole.findUnique({ where: { id } })

  if (!existing) {
    return NextResponse.json({ message: 'Cargo não encontrado' }, { status: 404 })
  }

  // Check for duplicate name
  const duplicate = await prisma.customRole.findUnique({
    where: { name: name.trim() }
  })

  if (duplicate && duplicate.id !== id) {
    return NextResponse.json({ message: 'Já existe um cargo com esse nome' }, { status: 409 })
  }

  const role = await prisma.customRole.update({
    where: { id },
    data: { name: name.trim() },
    include: {
      _count: { select: { users: true, dashboardVisibility: true } }
    }
  })

  return NextResponse.json(role)
}

// DELETE /api/apps/custom-roles/[id] - Delete custom role (superAdmin/subAdmin)
export async function DELETE(req, { params }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  if (session.user.role !== 'superAdmin' && session.user.role !== 'subAdmin') {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params

  const existing = await prisma.customRole.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } }
  })

  if (!existing) {
    return NextResponse.json({ message: 'Cargo não encontrado' }, { status: 404 })
  }

  if (existing._count.users > 0) {
    return NextResponse.json(
      { message: `Não é possível excluir. Existem ${existing._count.users} usuário(s) com este cargo.` },
      { status: 400 }
    )
  }

  await prisma.customRole.delete({ where: { id } })

  return NextResponse.json({ message: 'Cargo excluído' })
}
