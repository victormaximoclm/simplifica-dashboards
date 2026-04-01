import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'

import { authOptions } from '@/libs/auth'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'

// PUT /api/apps/users/[id]/reset-password - Admin resets user password
export async function PUT(req, { params }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  if (!isHighAdmin(session.user.role)) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { newPassword } = body

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return NextResponse.json({ message: 'Nova senha deve ter pelo menos 6 caracteres' }, { status: 400 })
  }

  const targetUser = await prisma.user.findUnique({
    where: { id },
    select: { role: true, email: true }
  })

  if (!targetUser) {
    return NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 })
  }

  // Cannot reset own password via this endpoint
  if (targetUser.email === session.user.email) {
    return NextResponse.json(
      { message: 'Use as configurações de conta para alterar sua própria senha' },
      { status: 400 }
    )
  }

  // SubAdmin can only reset passwords for admin and user roles
  if (session.user.role === 'subAdmin' && (targetUser.role === 'superAdmin' || targetUser.role === 'subAdmin')) {
    return NextResponse.json({ message: 'SubAdmin não pode alterar senha de SuperAdmin ou SubAdmin' }, { status: 403 })
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10)

  await prisma.user.update({
    where: { id },
    data: { password: hashedPassword }
  })

  return NextResponse.json({ message: 'Senha alterada com sucesso' })
}
