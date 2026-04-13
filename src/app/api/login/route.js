export const runtime = 'nodejs'
// Next Imports
import { NextResponse } from 'next/server'

import bcrypt from 'bcryptjs'

import { prisma } from '@/libs/prisma'
import { applyRateLimitHeaders, getRequestId, logger } from '@/libs/logger'
import { loginLimiter } from '@/libs/rateLimit'
import { loginSchema, parseBody } from '@/libs/validations'

export async function POST(req) {
  const requestId = getRequestId(req)
  const rate = await loginLimiter.check(req)
  const withRate = response => applyRateLimitHeaders(response, rate)

  if (!rate.success) {
    logger.warn('login-rate-limited', { requestId })
    const response = NextResponse.json(
      { message: ['Muitas tentativas. Aguarde um momento antes de tentar novamente.'] },
      { status: 429 }
    )
    response.headers.set('x-request-id', requestId)
    return withRate(response)
  }

  const parsed = parseBody(loginSchema, await req.json())

  if (!parsed.success) {
    const response = NextResponse.json({ message: [parsed.message] }, { status: 400 })
    response.headers.set('x-request-id', requestId)
    return withRate(response)
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
      const response = NextResponse.json(
        { message: ['Sua conta está inativa. Contate o administrador.'] },
        { status: 403, statusText: 'Forbidden' }
      )
      response.headers.set('x-request-id', requestId)
      return withRate(response)
    }

    // Block pending users (haven't accepted invite yet)
    if (dbUser.status === 'pending') {
      const response = NextResponse.json(
        { message: ['Aceite o convite enviado ao seu email antes de fazer login.'] },
        { status: 403, statusText: 'Forbidden' }
      )
      response.headers.set('x-request-id', requestId)
      return withRate(response)
    }

    // Check password (bcrypt only)
    const passwordMatch = dbUser.password ? await bcrypt.compare(password, dbUser.password) : false

    if (passwordMatch) {
      // Record login timestamp
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { lastLoginAt: new Date(), lastActivityAt: new Date() }
      })

      const { password: _, status: __, ...filteredUserData } = dbUser

      logger.info('login-success', { requestId, userId: filteredUserData.id })
      const response = NextResponse.json(filteredUserData)
      response.headers.set('x-request-id', requestId)
      return withRate(response)
    }
  }

  logger.warn('login-invalid-credentials', { requestId, email })
  const response = NextResponse.json(
    { message: ['Email ou senha inválidos'] },
    { status: 401, statusText: 'Unauthorized Access' }
  )
  response.headers.set('x-request-id', requestId)
  return withRate(response)
}
