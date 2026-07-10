import { cookies } from 'next/headers'

import { prisma } from '@/libs/prisma'
import { isHighAdmin } from '@/utils/roleHelpers'

/** Resolve workspace para criar/editar formulários (cookie para highAdmin) */
export async function resolveFormWorkspaceId(session, formWorkspaceId = null) {
  if (formWorkspaceId) return formWorkspaceId

  if (session.user.workspaceId) return session.user.workspaceId

  if (isHighAdmin(session.user.role)) {
    const cookieStore = await cookies()
    const activeWsId = cookieStore.get('activeWorkspaceId')?.value

    if (activeWsId) return activeWsId

    const first = await prisma.workspace.findFirst({ orderBy: { name: 'asc' }, select: { id: true } })
    return first?.id ?? null
  }

  return null
}

/** CustomRole é global no schema — lista todas as funções disponíveis */
export async function listCustomRolesForForms(workspaceId) {
  return prisma.customRole.findMany({
    where: workspaceId ? { workspaceId } : undefined,
    select: { id: true, name: true },
    orderBy: { name: 'asc' }
  })
}

/** Apenas highAdmin gerencia forms (qualquer workspace ativo) */
export function canManageFormInWorkspace(session, _workspaceId) {
  return isHighAdmin(session.user.role)
}
