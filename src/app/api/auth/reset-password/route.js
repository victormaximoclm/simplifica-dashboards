export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { prisma } from '@/libs/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req) {
  const { token, password } = await req.json()
  if (!token || !password) {
    return NextResponse.json({ message: 'Token e nova senha são obrigatórios.' }, { status: 400 })
  }

  // Busca token
  const reset = await prisma.passwordResetToken.findUnique({ where: { token } })
  if (!reset || reset.expiresAt < new Date()) {
    return NextResponse.json({ message: 'Token inválido ou expirado.' }, { status: 400 })
  }

  // Atualiza senha
  const hashed = await bcrypt.hash(password, 10)
  await prisma.user.update({ where: { id: reset.userId }, data: { password: hashed } })

  // Remove token
  await prisma.passwordResetToken.delete({ where: { token } })

  return NextResponse.json({ message: 'Senha redefinida com sucesso.' })
}
