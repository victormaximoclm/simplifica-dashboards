import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'

import { authOptions } from '@/libs/auth'
import { isHighAdmin, getAssignableRoles } from '@/utils/roleHelpers'
import { prisma } from '@/libs/prisma'

// POST /api/apps/users/create-test - Create user directly (test mode, no invite required)
export async function POST(req) {
  // Block in production — test mode is local-only
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ message: 'Rota indisponível' }, { status: 404 })
  }

  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  if (!isHighAdmin(session.user.role)) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const body = await req.json()
  const { email, name, password, workspaceId, role, customRoleId } = body

  // Validate required fields
  if (!email || !name || !password) {
    return NextResponse.json({ message: 'Email, nome e senha são obrigatórios' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ message: 'Senha deve ter pelo menos 6 caracteres' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(email)) {
    return NextResponse.json({ message: 'Email inválido' }, { status: 400 })
  }

  // Validate role assignment permissions
  const assignedRole = role || 'user'
  const assignable = getAssignableRoles(session.user.role)

  if (!assignable.includes(assignedRole)) {
    return NextResponse.json({ message: 'Você não tem permissão para atribuir este cargo' }, { status: 403 })
  }

  // Workspace required for admin and user, not for subAdmin
  const needsWorkspace = assignedRole !== 'subAdmin'

  if (needsWorkspace && !workspaceId) {
    return NextResponse.json({ message: 'Espaço de trabalho é obrigatório' }, { status: 400 })
  }

  if (workspaceId) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })

    if (!workspace) {
      return NextResponse.json({ message: 'Espaço de trabalho não encontrado' }, { status: 404 })
    }
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } })

  if (existingUser) {
    return NextResponse.json({ message: 'Este e-mail já está cadastrado' }, { status: 409 })
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  const user = await prisma.user.create({
    data: {
      email,
      name,
      password: hashedPassword,
      role: assignedRole,
      status: 'active',
      ...(needsWorkspace ? { workspaceId } : {}),
      customRoleId: assignedRole === 'user' ? customRoleId || null : null
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      status: true,
      workspace: { select: { id: true, name: true } },
      customRole: { select: { id: true, name: true } }
    }
  })

  return NextResponse.json({ message: 'Usuário criado com sucesso', user }, { status: 201 })
}
