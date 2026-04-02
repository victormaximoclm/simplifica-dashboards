export const runtime = 'nodejs'
// Next Imports
import { NextResponse } from 'next/server'

import bcrypt from 'bcryptjs'

import { prisma } from '@/libs/prisma'
import { loginLimiter } from '@/libs/rateLimit'
import { loginSchema, parseBody } from '@/libs/validations'

export async function POST(req) {
  const { success } = loginLimiter.check(req)

  if (!success) {
    return NextResponse.json(
      { message: ['Muitas tentativas. Aguarde um momento antes de tentar novamente.'] },
      { status: 429 }
    )
  }

  const parsed = parseBody(loginSchema, await req.json())

  if (!parsed.success) {
    return NextResponse.json({ message: [parsed.message] }, { status: 400 })
  }

  const { email, password } = parsed.data

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
