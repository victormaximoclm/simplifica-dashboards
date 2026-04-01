// Next Imports
import { NextResponse } from 'next/server'

// Third-party Imports
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'

import { authOptions } from '@/libs/auth'
import { prisma } from '@/libs/prisma'
import { changePasswordSchema, parseBody } from '@/libs/validations'

// PUT change password
export async function PUT(req) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const parsed = parseBody(changePasswordSchema, await req.json())

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.message }, { status: 400 })
  }

  const { currentPassword, newPassword } = parsed.data

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
