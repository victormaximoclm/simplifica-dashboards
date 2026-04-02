export const runtime = 'nodejs'
// Next Imports
import { NextResponse } from 'next/server'

// Third-party Imports
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'

import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'
import { updateProfileSchema, parseBody } from '@/libs/validations'

// GET current user profile
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
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
    return NextResponse.json({ message: 'User not found' }, { status: 404 })
  }

  return NextResponse.json(user)
}

// PUT update current user profile
export async function PUT(req) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const parsed = parseBody(updateProfileSchema, await req.json())

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.message }, { status: 400 })
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

  return NextResponse.json(user)
}

// DELETE current user account
export async function DELETE() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  // Prevent superAdmin from being deleted via this route
  if (session.user.role === 'superAdmin') {
    return NextResponse.json({ message: 'SuperAdmin accounts cannot be self-deleted' }, { status: 403 })
  }

  await prisma.user.delete({
    where: { email: session.user.email }
  })

  return NextResponse.json({ message: 'Account deleted successfully' })
}
