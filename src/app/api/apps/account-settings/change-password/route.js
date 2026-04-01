// Next Imports
import { NextResponse } from 'next/server'

// Third-party Imports
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'

import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'

// PUT change password
export async function PUT(req) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const { currentPassword, newPassword } = await req.json()

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ message: 'Current password and new password are required' }, { status: 400 })
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ message: 'New password must be at least 6 characters' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email }
  })

  if (!user) {
    return NextResponse.json({ message: 'User not found' }, { status: 404 })
  }

  // Check current password (bcrypt only)
  const isValid = user.password ? await bcrypt.compare(currentPassword, user.password) : false

  if (!isValid) {
    return NextResponse.json({ message: 'Current password is incorrect' }, { status: 400 })
  }

  // Hash the new password
  const hashedPassword = await bcrypt.hash(newPassword, 10)

  await prisma.user.update({
    where: { email: session.user.email },
    data: { password: hashedPassword }
  })

  return NextResponse.json({ message: 'Password changed successfully' })
}
