export const runtime = 'nodejs'
import crypto from 'crypto'

import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, logger } from '@/libs/logger'
import { sendInviteEmail } from '@/libs/mail'
import { isHighAdmin, getAssignableRoles } from '@/utils/roleHelpers'
import { createNotification } from '@/libs/notifications'
import { prisma } from '@/libs/prisma'
import { inviteUserSchema, parseBody } from '@/libs/validations'
import { hasAdminPermission } from '@/utils/adminPermission'

// POST /api/apps/users/invite - Invite user by email (high admins only)
export async function POST(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const canInvite = isHighAdmin(session.user.role) || hasAdminPermission(session.user.adminPermissions, 'users')

  if (!canInvite) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const parsed = parseBody(inviteUserSchema, await req.json())

  if (!parsed.success) {
    const response = NextResponse.json({ message: parsed.message }, { status: 400 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { email, workspaceId, role, customRoleId } = parsed.data

  if (customRoleId) {
    const roleCheck = await prisma.customRole.findUnique({ where: { id: customRoleId } })
    if (!roleCheck || roleCheck.workspaceId !== workspaceId) {
      const response = NextResponse.json({ message: 'Cargo não pertence ao workspace do usuário' }, { status: 400 })
      response.headers.set('x-request-id', requestId)
      return response
    }
  }

  // Validate role assignment permissions
  const assignedRole = role || 'user'
  const assignable = getAssignableRoles(session.user.role)

  // subAdmin role does not require a workspace
  const needsWorkspace = assignedRole !== 'subAdmin'
  let workspace = null

  if (needsWorkspace) {
    if (!workspaceId) {
      const response = NextResponse.json({ message: 'Espaço de trabalho é obrigatório' }, { status: 400 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, include: { plan: true } })

    if (!workspace) {
      const response = NextResponse.json({ message: 'Espaço de trabalho não encontrado' }, { status: 404 })
      response.headers.set('x-request-id', requestId)
      return response
    }
  }

  if (!assignable.includes(assignedRole)) {
    const response = NextResponse.json({ message: 'Você não tem permissão para atribuir este cargo' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } })

  if (existingUser) {
    if (existingUser.status === 'active') {
      const response = NextResponse.json({ message: 'Este e-mail já está cadastrado e ativo' }, { status: 409 })
      response.headers.set('x-request-id', requestId)
      return response
    }

    // User exists but is pending — resend invite
    const inviteToken = crypto.randomBytes(32).toString('hex')
    const inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await prisma.user.update({
      where: { email },
      data: {
        inviteToken,
        inviteTokenExpiry,
        ...(needsWorkspace ? { workspaceId } : {}),
        role: assignedRole,
        customRoleId: customRoleId || null
      }
    })

    try {
      await sendInviteEmail({ to: email, inviteToken, workspaceName: workspace?.name || 'Simpla Insights' })
    } catch (err) {
      logger.error('invite-email-send-failed', {
        requestId,
        userId: session.user.id,
        email,
        error: err instanceof Error ? err.message : 'unknown'
      })

      const response = NextResponse.json(
        {
          message: 'Convite criado, mas houve falha ao enviar e-mail. Tente reenviar o convite.',
          emailError: true
        },
        { status: 201 }
      )
      response.headers.set('x-request-id', requestId)
      return response
    }

    logger.info('invite-resent-success', { requestId, userId: session.user.id, email })
    await createAuditLog({
      userId: session.user.id,
      tenantId: workspaceId || existingUser.workspaceId || null,
      action: 'USER_INVITE_RESEND',
      resource: 'user',
      resourceId: existingUser.id,
      metadata: { requestId, email, assignedRole },
      requestId
    })
    const response = NextResponse.json({ message: 'Convite reenviado com sucesso' })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (needsWorkspace && workspace) {
    if (!workspace.plan) {
      logger.warn('workspace-sem-plano', { requestId, workspaceId })
      // não bloqueia — segue o fluxo normalmente
    } else {
      const limit = workspace.plan.maxUsers === -1 ? Infinity : workspace.plan.maxUsers + workspace.extraUserSlots
      const currentUserCount = await prisma.user.count({
        where: { workspaceId, status: { in: ['active', 'pending'] } }
      })

      if (currentUserCount >= limit) {
        const response = NextResponse.json(
          {
            message: `Limite de ${limit} usuários do plano "${workspace.plan.name}" atingido. Contrate mais espaço para convidar novos usuários.`,
            code: 'USER_LIMIT_REACHED'
          },
          { status: 403 }
        )
        response.headers.set('x-request-id', requestId)
        return response
      }
    }
  }

  // Create new user with pending status
  const inviteToken = crypto.randomBytes(32).toString('hex')
  const inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const user = await prisma.user.create({
    data: {
      email,
      role: assignedRole,
      status: 'pending',
      ...(needsWorkspace ? { workspaceId } : {}),
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
    await sendInviteEmail({ to: email, inviteToken, workspaceName: workspace?.name || 'Simpla Insights' })
  } catch (err) {
    logger.error('invite-email-send-failed', {
      requestId,
      userId: session.user.id,
      email,
      error: err instanceof Error ? err.message : 'unknown'
    })

    const response = NextResponse.json(
      {
        message: 'Usuário criado, mas houve falha ao enviar e-mail. Tente reenviar o convite.',
        user,
        emailError: true
      },
      { status: 201 }
    )
    response.headers.set('x-request-id', requestId)
    return response
  }

  // Emit notification
  const inviter = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })

  await createNotification({
    type: 'user_invited',
    title: 'Novo convite enviado',
    message: `${session.user.name || session.user.email} convidou ${email}${workspace ? ` para ${workspace.name}` : ''}`,
    workspaceId: workspaceId || null,
    createdById: inviter?.id
  })

  logger.info('invite-create-success', { requestId, userId: session.user.id, invitedUserId: user.id, email })
  await createAuditLog({
    userId: session.user.id,
    tenantId: workspaceId || user.workspace?.id || null,
    action: 'USER_INVITE',
    resource: 'user',
    resourceId: user.id,
    after: { role: user.role, status: user.status, workspaceId: user.workspace?.id || null },
    metadata: { requestId, email },
    requestId
  })
  const response = NextResponse.json({ message: 'Convite enviado com sucesso', user }, { status: 201 })
  response.headers.set('x-request-id', requestId)
  return response
}
