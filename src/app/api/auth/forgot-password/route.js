export const runtime = 'nodejs'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

import { i18n } from '@/configs/i18n'
import { prisma } from '@/libs/prisma'
import { sendMail } from '@/libs/mail'

export async function POST(req) {
  const { email } = await req.json()
  if (!email) {
    return NextResponse.json({ message: 'Email é obrigatório.' }, { status: 400 })
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: 'insensitive' } }
  })
  if (!user) {
    return NextResponse.json({ message: 'Se o email estiver cadastrado, enviaremos instruções.' })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 1000 * 60 * 60)

  await prisma.passwordResetToken.upsert({
    where: { userId: user.id },
    update: { token, expiresAt: expires },
    create: { userId: user.id, token, expiresAt: expires }
  })

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  const locale = i18n.defaultLocale
  const resetLink = `${baseUrl}/${locale}/reset-password?token=${encodeURIComponent(token)}`

  await sendMail({
    to: user.email,
    subject: 'Redefinição de senha',
    html: `<p>Olá,</p><p>Recebemos uma solicitação para redefinir sua senha.</p><p><a href="${resetLink}">Clique aqui para criar uma nova senha</a></p><p>Se não foi você, ignore este email.</p>`
  })

  return NextResponse.json({ message: 'Se o email estiver cadastrado, enviaremos instruções.' })
}
