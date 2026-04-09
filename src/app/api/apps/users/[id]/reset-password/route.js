import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, logger } from '@/libs/logger'
import { isHighAdmin } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'

// PUT /api/apps/users/[id]/reset-password - Admin resets user password
export async function PUT(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (!isHighAdmin(session.user.role)) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { id } = await params
  const body = await req.json()
  const { newPassword } = body

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    const response = NextResponse.json({ message: 'Nova senha deve ter pelo menos 6 caracteres' }, { status: 400 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const targetUser = await prisma.user.findUnique({
    where: { id },
    select: { role: true, email: true }
  })

  if (!targetUser) {
    const response = NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  // Cannot reset own password via this endpoint
  if (targetUser.email === session.user.email) {
    const response = NextResponse.json(
      { message: 'Use as configurações de conta para alterar sua própria senha' },
      { status: 400 }
    )
    response.headers.set('x-request-id', requestId)
    return response
  }

  // SubAdmin can only reset passwords for admin and user roles
  if (session.user.role === 'subAdmin' && (targetUser.role === 'superAdmin' || targetUser.role === 'subAdmin')) {
    const response = NextResponse.json({ message: 'SubAdmin não pode alterar senha de SuperAdmin ou SubAdmin' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10)

  await prisma.user.update({
    where: { id },
    data: { password: hashedPassword }
  })

  logger.info('user-reset-password-success', { requestId, actorUserId: session.user.id, targetUserId: id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: session.user.workspaceId || null,
    action: 'USER_PASSWORD_RESET',
    resource: 'user',
    resourceId: id,
    metadata: { requestId },
    requestId
  })
  const response = NextResponse.json({ message: 'Senha alterada com sucesso' })
  response.headers.set('x-request-id', requestId)
  return response
}
