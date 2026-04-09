export const runtime = 'nodejs'
// Next Imports
import { NextResponse } from 'next/server'

// Third-party Imports
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'

import { authOptions } from '@/libs/auth'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { updateProfileSchema, parseBody } from '@/libs/validations'

// GET current user profile
export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Unauthorized' }, { status: 401, requestId })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      workspace: {
        select: { id: true, name: true }
      }
    }
  })

  if (!user) {
    return jsonWithRequestId({ message: 'User not found' }, { status: 404, requestId })
  }

  logger.info('account-settings-read-success', { requestId, userId: user.id })
  return jsonWithRequestId(user, { requestId })
}

// PUT update current user profile
export async function PUT(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Unauthorized' }, { status: 401, requestId })
  }

  const parsed = parseBody(updateProfileSchema, await req.json())

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const { name, image } = parsed.data

  // Only allow updating name and image via this endpoint
  const updateData = {}

  if (name !== undefined) updateData.name = name
  if (image !== undefined) updateData.image = image

  const user = await prisma.user.update({
    where: { email: session.user.email },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true
    }
  })

  logger.info('account-settings-update-success', { requestId, userId: user.id })
  return jsonWithRequestId(user, { requestId })
}

// DELETE current user account
export async function DELETE(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Unauthorized' }, { status: 401, requestId })
  }

  // Prevent superAdmin from being deleted via this route
  if (session.user.role === 'superAdmin') {
    return jsonWithRequestId({ message: 'SuperAdmin accounts cannot be self-deleted' }, { status: 403, requestId })
  }

  await prisma.user.delete({
    where: { email: session.user.email }
  })

  logger.info('account-settings-delete-success', { requestId, userEmail: session.user.email })
  return jsonWithRequestId({ message: 'Account deleted successfully' }, { requestId })
}
