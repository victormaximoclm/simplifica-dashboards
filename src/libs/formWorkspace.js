import { cookies } from 'next/headers'

import { prisma } from '@/libs/prisma'
import { isHighAdmin, canManageWorkspaceContent, canCreateWorkspaceContent } from '@/utils/roleHelpers'
import { workspaceAccessInclude } from '@/libs/workspaceAccess'

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

/** highAdmin edita forms existentes, mas só em workspaces aos quais tem acesso de edição (respeita isPrivate/nível de convite) */
export async function canManageFormInWorkspace(session, workspaceId) {
  if (!isHighAdmin(session.user.role)) return false

  if (!workspaceId) return false

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: workspaceAccessInclude
  })

  if (!workspace) return false

  return canManageWorkspaceContent(session.user, workspace)
}

/** highAdmin cria forms novos, mas só em workspaces onde tem nível "create" (respeita isPrivate/nível de convite) */
export async function canCreateFormInWorkspace(session, workspaceId) {
  if (!isHighAdmin(session.user.role)) return false

  if (!workspaceId) return false

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: workspaceAccessInclude
  })

  if (!workspace) return false

  return canCreateWorkspaceContent(session.user, workspace)
}
