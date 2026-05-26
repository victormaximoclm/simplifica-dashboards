export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

import bcrypt from 'bcryptjs'

import { applyRateLimitHeaders, getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { setupLimiter } from '@/libs/rateLimit'
import { acceptInviteSchema, parseBody } from '@/libs/validations'

// GET /api/apps/users/accept-invite?token=xxx - Validate invite token
export async function GET(req) {
  const requestId = getRequestId(req)
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (!token) {
    return jsonWithRequestId({ message: 'Token não fornecido' }, { status: 400, requestId })
  }

  const user = await prisma.user.findUnique({
    where: { inviteToken: token },
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      inviteTokenExpiry: true,
      workspace: { select: { name: true } }
    }
  })

  if (!user) {
    return jsonWithRequestId({ message: 'Token inválido' }, { status: 404, requestId })
  }

  if (user.inviteTokenExpiry && new Date() > user.inviteTokenExpiry) {
    return jsonWithRequestId({ message: 'Token expirado' }, { status: 410, requestId })
  }

  if (user.status === 'active') {
    return jsonWithRequestId({ message: 'Convite já aceito' }, { status: 409, requestId })
  }

  return jsonWithRequestId(
    {
      email: user.email,
      workspaceName: user.workspace?.name || ''
    },
    { requestId }
  )
}

// POST /api/apps/users/accept-invite - Accept invite (set name + password)
export async function POST(req) {
  const requestId = getRequestId(req)
  const rate = await setupLimiter.check(req)
  const withRate = response => applyRateLimitHeaders(response, rate)

  if (!rate.success) {
    return withRate(
      jsonWithRequestId({ message: 'Muitas tentativas. Aguarde um momento.' }, { status: 429, requestId })
    )
  }

  const parsed = parseBody(acceptInviteSchema, await req.json())

  if (!parsed.success) {
    return withRate(jsonWithRequestId({ message: parsed.message }, { status: 400, requestId }))
  }

  const { token, name, password, termsAccepted } = parsed.data

  const user = await prisma.user.findUnique({
    where: { inviteToken: token },
    select: { id: true, status: true, inviteTokenExpiry: true }
  })

  if (!user) {
    return withRate(jsonWithRequestId({ message: 'Token inválido' }, { status: 404, requestId }))
  }

  if (user.inviteTokenExpiry && new Date() > user.inviteTokenExpiry) {
    return withRate(jsonWithRequestId({ message: 'Token expirado' }, { status: 410, requestId }))
  }

  if (user.status === 'active') {
    return withRate(jsonWithRequestId({ message: 'Convite já aceito' }, { status: 409, requestId }))
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name,
      password: hashedPassword,
      status: 'active',
      inviteToken: null,
      inviteTokenExpiry: null,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      termsVersion: '1.0'
    }
  })

  logger.info('invite-accept-success', { requestId, userId: user.id })
  return withRate(jsonWithRequestId({ message: 'Conta criada com sucesso! Faça login.' }, { requestId }))
}
