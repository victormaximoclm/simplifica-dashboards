import { prisma } from '@/libs/prisma'
import {
  canAccessWorkspace,
  canManageWorkspaceContent,
  canCreateWorkspaceContent,
  isHighAdmin,
  isValidGuestPermission
} from '@/utils/roleHelpers'

export const workspaceAccessInclude = {
  guests: { select: { userId: true, permission: true } }
}

export async function loadWorkspaceForAccess(workspaceId) {
  if (!workspaceId) return null

  return prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: workspaceAccessInclude
  })
}

export async function shouldUseWorkspaceScope(session) {
  if (!session?.user) return false
  if (isHighAdmin(session.user.role)) return true

  const count = await prisma.workspace.count({
    where: { guests: { some: { userId: session.user.id } } }
  })

  return count > 0
}

/**
 * Resolve e valida o workspaceId que uma rota de módulo deve usar no `where`.
 *
 * - Se passou um workspaceId específico: valida canAccessWorkspace (qualquer perfil).
 * - Se highAdmin / convidado de whitelist e não passou nada: retorna null (listar o que ele acessa).
 * - Caso contrário: sempre o workspace de origem do usuário.
 */
export async function resolveModuleWorkspaceScope(session, requestedWorkspaceId) {
  if (requestedWorkspaceId) {
    const workspace = await loadWorkspaceForAccess(requestedWorkspaceId)

    if (!workspace) {
      return { error: { status: 404, message: 'Workspace não encontrado' } }
    }

    if (!canAccessWorkspace(session.user, workspace)) {
      return { error: { status: 403, message: 'Acesso negado a este workspace' } }
    }

    return { workspaceId: requestedWorkspaceId, workspace }
  }

  if (await shouldUseWorkspaceScope(session)) {
    return { workspaceId: null }
  }

  return { workspaceId: session.user.workspaceId }
}

/**
 * Para quando o highAdmin NÃO especifica workspace e a rota precisa listar
 * "tudo que ele pode ver" em vez de "tudo que existe".
 * Retorna array de workspaceIds acessíveis. null = superAdmin, sem filtro.
 */
export async function getAccessibleWorkspaceIds(session) {
  if (session.user.role === 'superAdmin') return null

  const allWorkspaces = await prisma.workspace.findMany({
    select: { id: true, isPrivate: true, ...workspaceAccessInclude }
  })

  return allWorkspaces.filter(ws => canAccessWorkspace(session.user, ws)).map(ws => ws.id)
}

export async function getAccessibleWorkspaces(session, extraInclude = {}) {
  const workspaces = await prisma.workspace.findMany({
    include: {
      ...workspaceAccessInclude,
      ...extraInclude
    },
    orderBy: { name: 'asc' }
  })

  if (session.user.role === 'superAdmin') return workspaces

  return workspaces.filter(ws => canAccessWorkspace(session.user, ws))
}

export async function getFirstAccessibleWorkspace(session) {
  const ids = await getAccessibleWorkspaceIds(session)

  if (ids === null) {
    return prisma.workspace.findFirst({ orderBy: { name: 'asc' } })
  }

  if (!ids.length) return null

  return prisma.workspace.findFirst({
    where: { id: { in: ids } },
    orderBy: { name: 'asc' }
  })
}

export async function canManageWorkspaceContentById(session, workspaceId) {
  const workspace = await loadWorkspaceForAccess(workspaceId)

  if (!workspace) return false

  return canManageWorkspaceContent(session.user, workspace)
}

export async function canCreateWorkspaceContentById(session, workspaceId) {
  const workspace = await loadWorkspaceForAccess(workspaceId)

  if (!workspace) return false

  return canCreateWorkspaceContent(session.user, workspace)
}

export function uniqueIds(ids = []) {
  return [...new Set(ids.filter(Boolean))]
}

/**
 * Normaliza a lista de convidados enviada pelo client ({ userId, permission }[]),
 * removendo duplicatas/entradas inválidas e garantindo que quem ativa o modo
 * privado não se tranque fora da lista (exceto superAdmin) — o criador/editor
 * sempre entra com o nível máximo ("create") para manter controle total.
 */
export function withCreatorOnPrivateGuestList(isPrivate, guests, userId, role) {
  const seen = new Set()
  const normalized = []

  for (const guest of Array.isArray(guests) ? guests : []) {
    const guestUserId = guest?.userId

    if (!guestUserId || seen.has(guestUserId)) continue

    seen.add(guestUserId)
    normalized.push({
      userId: guestUserId,
      permission: isValidGuestPermission(guest?.permission) ? guest.permission : 'view'
    })
  }

  if (isPrivate && role !== 'superAdmin' && userId && !seen.has(userId)) {
    normalized.push({ userId, permission: 'create' })
  }

  return normalized
}
