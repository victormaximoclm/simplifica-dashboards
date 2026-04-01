// Next Imports
import { NextResponse } from 'next/server'

import bcrypt from 'bcryptjs'

import { prisma } from '@/libs/prisma'

export async function POST(req) {
  const { email, password } = await req.json()

  // Try Prisma database
  const dbUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      password: true,
      status: true,
      workspaceId: true
    }
  })

  if (dbUser) {
    // Block inactive users
    if (dbUser.status === 'inactive') {
      return NextResponse.json(
        { message: ['Sua conta está inativa. Contate o administrador.'] },
        { status: 403, statusText: 'Forbidden' }
      )
    }

    // Block pending users (haven't accepted invite yet)
    if (dbUser.status === 'pending') {
      return NextResponse.json(
        { message: ['Aceite o convite enviado ao seu email antes de fazer login.'] },
        { status: 403, statusText: 'Forbidden' }
      )
    }

    // Check password (bcrypt only)
    const passwordMatch = dbUser.password ? await bcrypt.compare(password, dbUser.password) : false

    if (passwordMatch) {
      // Record login timestamp
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { lastLoginAt: new Date() }
      })

      const { password: _, status: __, ...filteredUserData } = dbUser

      return NextResponse.json(filteredUserData)
    }
  }

  return NextResponse.json(
    { message: ['Email ou senha inválidos'] },
    { status: 401, statusText: 'Unauthorized Access' }
  )
}
