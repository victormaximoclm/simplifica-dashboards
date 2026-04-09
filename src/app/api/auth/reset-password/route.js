export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import { prisma } from '@/libs/prisma'
import bcrypt from 'bcryptjs'
import { getRequestId, logger } from '@/libs/logger'

export async function POST(req) {
  const requestId = getRequestId(req)
  const { token, password } = await req.json()
  if (!token || !password) {
    const response = NextResponse.json({ message: 'Token e nova senha são obrigatórios.' }, { status: 400 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  // Busca token
  const reset = await prisma.passwordResetToken.findUnique({ where: { token } })
  if (!reset || reset.expiresAt < new Date()) {
    const response = NextResponse.json({ message: 'Token inválido ou expirado.' }, { status: 400 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  // Atualiza senha
  const hashed = await bcrypt.hash(password, 10)
  await prisma.user.update({ where: { id: reset.userId }, data: { password: hashed } })

  // Remove token
  await prisma.passwordResetToken.delete({ where: { token } })

  logger.info('reset-password-success', { requestId, userId: reset.userId })
  const response = NextResponse.json({ message: 'Senha redefinida com sucesso.' })
  response.headers.set('x-request-id', requestId)
  return response
}
