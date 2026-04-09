export const runtime = 'nodejs'
// Next Imports
import { NextResponse } from 'next/server'

// Third-party Imports
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'

import { authOptions } from '@/libs/auth'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { changePasswordSchema, parseBody } from '@/libs/validations'

// PUT change password
export async function PUT(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Unauthorized' }, { status: 401, requestId })
  }

  const parsed = parseBody(changePasswordSchema, await req.json())

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const { currentPassword, newPassword } = parsed.data

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) {
    return jsonWithRequestId({ message: 'User not found' }, { status: 404, requestId })
  }

  // Check current password (bcrypt only)
  const isValid = user.password ? await bcrypt.compare(currentPassword, user.password) : false

  if (!isValid) {
    return jsonWithRequestId({ message: 'Current password is incorrect' }, { status: 400, requestId })
  }

  // Hash the new password
  const hashedPassword = await bcrypt.hash(newPassword, 10)

  await prisma.user.update({
    where: { email: session.user.email },
    data: { password: hashedPassword }
  })

  logger.info('account-password-change-success', { requestId, userId: user.id })
  return jsonWithRequestId({ message: 'Password changed successfully' }, { requestId })
}
