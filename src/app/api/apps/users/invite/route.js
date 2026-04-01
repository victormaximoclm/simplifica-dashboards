import crypto from 'crypto'

import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { sendInviteEmail } from '@/libs/mail'
import { isHighAdmin, getAssignableRoles } from '@/utils/roleHelpers'
import { createNotification } from '@/libs/notifications'
import { prisma } from '@/libs/prisma'
import { inviteUserSchema, parseBody } from '@/libs/validations'

// POST /api/apps/users/invite - Invite user by email (high admins only)
export async function POST(req) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  if (!isHighAdmin(session.user.role)) {
    return NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
  }

  const parsed = parseBody(inviteUserSchema, await req.json())

  if (!parsed.success) {
    return NextResponse.json({ message: parsed.message }, { status: 400 })
  }

  const { email, workspaceId, role, customRoleId } = parsed.data

  // Check if workspace exists
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })

  if (!workspace) {
    return NextResponse.json({ message: 'Espaço de trabalho não encontrado' }, { status: 404 })
  }

  // Validate role assignment permissions
  const assignedRole = role || 'user'
  const assignable = getAssignableRoles(session.user.role)

  if (!assignable.includes(assignedRole)) {
    return NextResponse.json({ message: 'Você não tem permissão para atribuir este cargo' }, { status: 403 })
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } })

  if (existingUser) {
    if (existingUser.status === 'active') {
      return NextResponse.json({ message: 'Este e-mail já está cadastrado e ativo' }, { status: 409 })
    }

    // User exists but is pending — resend invite
    const inviteToken = crypto.randomBytes(32).toString('hex')
    const inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await prisma.user.update({
      where: { email },
      data: { inviteToken, inviteTokenExpiry, workspaceId, role: role || 'user', customRoleId: customRoleId || null }
    })

    try {
      await sendInviteEmail({ to: email, inviteToken, workspaceName: workspace.name })
    } catch (err) {
      console.error('Erro ao enviar e-mail:', err)

      return NextResponse.json(
        {
          message: 'Convite criado, mas houve falha ao enviar e-mail. Tente reenviar o convite.',
          emailError: true
        },
        { status: 201 }
      )
    }

    return NextResponse.json({ message: 'Convite reenviado com sucesso' })
  }

  // Create new user with pending status
  const inviteToken = crypto.randomBytes(32).toString('hex')
  const inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const user = await prisma.user.create({
    data: {
      email,
      role: role || 'user',
      status: 'pending',
      workspaceId,
      customRoleId: customRoleId || null,
      inviteToken,
      inviteTokenExpiry
    },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      workspace: { select: { id: true, name: true } },
      customRole: { select: { id: true, name: true } }
    }
  })

  try {
    await sendInviteEmail({ to: email, inviteToken, workspaceName: workspace.name })
  } catch (err) {
    console.error('Erro ao enviar e-mail:', err)

    return NextResponse.json(
      {
        message: 'Usuário criado, mas houve falha ao enviar e-mail. Tente reenviar o convite.',
        user,
        emailError: true
      },
      { status: 201 }
    )
  }

  // Emit notification
  const inviter = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })

  await createNotification({
    type: 'user_invited',
    title: 'Novo convite enviado',
    message: `${session.user.name || session.user.email} convidou ${email} para ${workspace.name}`,
    workspaceId,
    createdById: inviter?.id
  })

  return NextResponse.json({ message: 'Convite enviado com sucesso', user }, { status: 201 })
}
