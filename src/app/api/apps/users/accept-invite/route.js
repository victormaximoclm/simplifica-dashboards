import { NextResponse } from 'next/server'

import bcrypt from 'bcryptjs'

import { prisma } from '@/libs/prisma'

// GET /api/apps/users/accept-invite?token=xxx - Validate invite token
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ message: 'Token não fornecido' }, { status: 400 })
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
    return NextResponse.json({ message: 'Token inválido' }, { status: 404 })
  }

  if (user.inviteTokenExpiry && new Date() > user.inviteTokenExpiry) {
    return NextResponse.json({ message: 'Token expirado' }, { status: 410 })
  }

  if (user.status === 'active') {
    return NextResponse.json({ message: 'Convite já aceito' }, { status: 409 })
  }

  return NextResponse.json({
    email: user.email,
    workspaceName: user.workspace?.name || ''
  })
}

// POST /api/apps/users/accept-invite - Accept invite (set name + password)
export async function POST(req) {
  const body = await req.json()
  const { token, name, password } = body

  if (!token || !name || !password) {
    return NextResponse.json({ message: 'Todos os campos são obrigatórios' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ message: 'A senha deve ter no mínimo 6 caracteres' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { inviteToken: token },
    select: { id: true, status: true, inviteTokenExpiry: true }
  })

  if (!user) {
    return NextResponse.json({ message: 'Token inválido' }, { status: 404 })
  }

  if (user.inviteTokenExpiry && new Date() > user.inviteTokenExpiry) {
    return NextResponse.json({ message: 'Token expirado' }, { status: 410 })
  }

  if (user.status === 'active') {
    return NextResponse.json({ message: 'Convite já aceito' }, { status: 409 })
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name,
      password: hashedPassword,
      status: 'active',
      inviteToken: null,
      inviteTokenExpiry: null
    }
  })

  return NextResponse.json({ message: 'Conta criada com sucesso! Faça login.' })
}
