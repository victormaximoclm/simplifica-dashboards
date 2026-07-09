export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, logger } from '@/libs/logger'
import { isHighAdmin, getAssignableRoles } from '@/utils/roleHelpers'
import { createNotification } from '@/libs/notifications'
import { prisma } from '@/libs/prisma'

// PUT /api/apps/users/[id] - Update user (high admins only)
export async function PUT(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (!isHighAdmin(session.user.role)) {
    logger.warn('user-update-forbidden', { requestId, userId: session.user.id, role: session.user.role })
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { id } = await params
  const body = await req.json()
  const { role, workspaceId, status, customRoleId } = body

  if (customRoleId) {
    const targetWorkspaceId = workspaceId || updateData.workspaceId || targetUser?.workspaceId
    const roleCheck = await prisma.customRole.findUnique({ where: { id: customRoleId } })
    if (!roleCheck || roleCheck.workspaceId !== targetWorkspaceId) {
      return jsonWithRequestId({ message: 'Cargo não pertence ao workspace do usuário' }, { status: 400, requestId })
    }
  }

  const targetUser = await prisma.user.findUnique({
    where: { id },
    select: { role: true, status: true, name: true, email: true, workspaceId: true }
  })

  if (!targetUser) {
    const response = NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (session.user.role === 'subAdmin' && (targetUser.role === 'superAdmin' || targetUser.role === 'subAdmin')) {
    const response = NextResponse.json(
      { message: 'SubAdmin não pode modificar SuperAdmin ou SubAdmin' },
      { status: 403 }
    )
    response.headers.set('x-request-id', requestId)
    return response
  }

  // Super Admin cannot change their own role
  const currentUser = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })

  if (currentUser && currentUser.id === id && session.user.role === 'superAdmin' && role && role !== 'superAdmin') {
    const response = NextResponse.json({ message: 'Super Admin não pode alterar o próprio cargo' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const updateData = {}

  if (role && typeof role === 'string') {
    // Validate role assignment permissions
    const assignable = getAssignableRoles(session.user.role)

    if (!assignable.includes(role)) {
      const response = NextResponse.json(
        { message: 'Você não tem permissão para atribuir este cargo' },
        { status: 403 }
      )
      response.headers.set('x-request-id', requestId)
      return response
    }

    updateData.role = role
  }

  if (status && ['active', 'inactive'].includes(status)) {
    // Block status change for pending users — they can only be deleted
    if (targetUser.status === 'pending') {
      const response = NextResponse.json(
        { message: 'Usuários pendentes não podem ter o status alterado. Remova e convide novamente.' },
        { status: 400 }
      )
      response.headers.set('x-request-id', requestId)
      return response
    }

    updateData.status = status
  }

  if (workspaceId !== undefined) {
    if (workspaceId === null || workspaceId === '') {
      updateData.workspaceId = null
    } else {
      // Validate workspace exists
      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } })

      if (!workspace) {
        const response = NextResponse.json({ message: 'Workspace não encontrado' }, { status: 404 })
        response.headers.set('x-request-id', requestId)
        return response
      }

      updateData.workspaceId = workspaceId
    }
  }

  if (customRoleId !== undefined) {
    updateData.customRoleId = customRoleId || null
  }

  if (Object.keys(updateData).length === 0) {
    const response = NextResponse.json({ message: 'Nenhum campo para atualizar' }, { status: 400 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  // Get original user data for notification
  const originalUser = targetUser

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
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

  // Emit notifications for changes
  const editor = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
  const targetName = originalUser?.name || originalUser?.email || 'Usuário'
  const wsId = user.workspace?.id || originalUser?.workspaceId

  if (role && role !== originalUser?.role) {
    await createNotification({
      type: 'user_role_changed',
      title: 'Cargo alterado',
      message: `${session.user.name || session.user.email} alterou o cargo de ${targetName}`,
      workspaceId: wsId,
      createdById: editor?.id
    })
  }

  if (status && status !== originalUser?.status) {
    const isPending = status === 'pending'

    await createNotification({
      type: isPending ? 'user_status_pending' : 'user_status_changed',
      title: status === 'inactive' ? 'Usuário inativado' : status === 'active' ? 'Usuário ativado' : 'Status alterado',
      message: `${session.user.name || session.user.email} alterou o status de ${targetName} para ${status === 'active' ? 'ativo' : status === 'inactive' ? 'inativo' : 'pendente'}`,
      workspaceId: wsId,
      createdById: editor?.id
    })
  }

  logger.info('user-update-success', { requestId, actorUserId: session.user.id, targetUserId: id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: wsId || originalUser?.workspaceId || null,
    action: 'USER_UPDATE',
    resource: 'user',
    resourceId: id,
    before: { role: originalUser?.role, status: originalUser?.status, workspaceId: originalUser?.workspaceId },
    after: { role: user.role, status: user.status, workspaceId: user.workspace?.id || null },
    metadata: { requestId },
    requestId
  })
  const response = NextResponse.json(user)
  response.headers.set('x-request-id', requestId)
  return response
}

// DELETE /api/apps/users/[id] - Delete user (high admins only)
export async function DELETE(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    const response = NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (!isHighAdmin(session.user.role)) {
    const response = NextResponse.json({ message: 'Acesso negado' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  const { id } = await params

  const targetUser = await prisma.user.findUnique({
    where: { id },
    select: { role: true, name: true, email: true, workspaceId: true }
  })

  if (!targetUser) {
    const response = NextResponse.json({ message: 'Usuário não encontrado' }, { status: 404 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  if (session.user.role === 'subAdmin' && (targetUser.role === 'superAdmin' || targetUser.role === 'subAdmin')) {
    const response = NextResponse.json({ message: 'SubAdmin não pode deletar SuperAdmin ou SubAdmin' }, { status: 403 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  // Prevent deleting own account
  const currentUser = await prisma.user.findUnique({ where: { email: session.user.email } })

  if (currentUser && currentUser.id === id) {
    const response = NextResponse.json({ message: 'Não é possível deletar sua própria conta' }, { status: 400 })
    response.headers.set('x-request-id', requestId)
    return response
  }

  // Get user data before deleting for notification
  await prisma.user.delete({ where: { id } })

  // Emit notification
  const deleter = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })

  await createNotification({
    type: 'user_deleted',
    title: 'Usuário removido',
    message: `${session.user.name || session.user.email} removeu ${targetUser?.name || targetUser?.email || 'um usuário'}`,
    workspaceId: targetUser?.workspaceId,
    createdById: deleter?.id
  })

  logger.info('user-delete-success', { requestId, actorUserId: session.user.id, targetUserId: id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: targetUser?.workspaceId || null,
    action: 'USER_DELETE',
    resource: 'user',
    resourceId: id,
    before: {
      role: targetUser?.role,
      name: targetUser?.name,
      email: targetUser?.email,
      workspaceId: targetUser?.workspaceId
    },
    metadata: { requestId },
    requestId
  })
  const response = NextResponse.json({ message: 'Usuário deletado' })
  response.headers.set('x-request-id', requestId)
  return response
}
