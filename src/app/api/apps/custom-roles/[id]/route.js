export const runtime = 'nodejs'
import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { createCustomRoleSchema, parseBody } from '@/libs/validations'

// PUT /api/apps/custom-roles/[id] - Update custom role (superAdmin/subAdmin)
export async function PUT(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (session.user.role !== 'superAdmin' && session.user.role !== 'subAdmin') {
    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const { id } = await params

  const parsed = parseBody(createCustomRoleSchema, await req.json())

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const { name } = parsed.data

  const existing = await prisma.customRole.findUnique({ where: { id } })

  if (!existing) {
    return jsonWithRequestId({ message: 'Cargo não encontrado' }, { status: 404, requestId })
  }

  // Check for duplicate name
  const duplicate = await prisma.customRole.findUnique({
    where: { name: name.trim() }
  })

  if (duplicate && duplicate.id !== id) {
    return jsonWithRequestId({ message: 'Já existe um cargo com esse nome' }, { status: 409, requestId })
  }

  const role = await prisma.customRole.update({
    where: { id },
    data: { name: name.trim() },
    include: {
      _count: { select: { users: true, dashboardVisibility: true } }
    }
  })

  logger.info('custom-role-update-success', { requestId, userId: session.user.id, customRoleId: role.id })
  return jsonWithRequestId(role, { requestId })
}

// DELETE /api/apps/custom-roles/[id] - Delete custom role (superAdmin/subAdmin)
export async function DELETE(req, { params }) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (session.user.role !== 'superAdmin' && session.user.role !== 'subAdmin') {
    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const { id } = await params

  const existing = await prisma.customRole.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } }
  })

  if (!existing) {
    return jsonWithRequestId({ message: 'Cargo não encontrado' }, { status: 404, requestId })
  }

  if (existing._count.users > 0) {
    return jsonWithRequestId(
      { message: `Não é possível excluir. Existem ${existing._count.users} usuário(s) com este cargo.` },
      { status: 400, requestId }
    )
  }

  await prisma.customRole.delete({ where: { id } })

  logger.info('custom-role-delete-success', { requestId, userId: session.user.id, customRoleId: id })
  return jsonWithRequestId({ message: 'Cargo excluído' }, { requestId })
}
