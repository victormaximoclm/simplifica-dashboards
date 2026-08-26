/**
 * Role hierarchy: superAdmin > subAdmin > admin > user (custom roles)
 *
 * - isHighAdmin: superAdmin OR subAdmin (can manage everything)
 * - isSuperOnly: strictly superAdmin (can assign subAdmin role)
 */

export const ROLE_HIERARCHY = ['superAdmin', 'subAdmin', 'admin', 'user']

/** Returns true for superAdmin or subAdmin */
export const isHighAdmin = role => role === 'superAdmin' || role === 'subAdmin'

/** Returns true for strictly superAdmin */
export const isSuperOnly = role => role === 'superAdmin'

/**
 * Returns the roles that a given caller role can assign to others.
 * - superAdmin can assign: subAdmin, admin, user
 * - subAdmin can assign: admin, user
 * - others cannot assign roles
 */
export const getAssignableRoles = callerRole => {
  if (callerRole === 'superAdmin') return ['subAdmin', 'admin', 'user']
  if (callerRole === 'subAdmin') return ['admin', 'user']

  return []
}

/** Níveis de permissão de convidado (guest) num workspace privado, do mais fraco ao mais forte */
export const GUEST_PERMISSIONS = ['view', 'edit', 'create']
const GUEST_PERMISSION_RANK = { view: 1, edit: 2, create: 3 }

export const isValidGuestPermission = permission => GUEST_PERMISSIONS.includes(permission)

/** Retorna a entrada de convite do usuário no workspace (ou null se não for convidado) */
export const getWorkspaceGuestEntry = (user, workspace) => {
  if (!user?.id) return null

  return (workspace?.guests ?? []).find(guest => guest.userId === user.id) ?? null
}

export const isWorkspaceWhitelisted = (user, workspace) => !!getWorkspaceGuestEntry(user, workspace)

/**
 * Quem pode VER / ACESSAR o workspace:
 * - superAdmin sempre
 * - membros do workspace (workspaceId) sempre — são os usuários da empresa
 * - qualquer pessoa convidada (guest), independente do nível de permissão
 * - se NÃO é privado: qualquer HighAdmin (superAdmin/subAdmin)
 * - se É privado: subAdmin de outro espaço NÃO vê nem acessa, salvo se estiver na lista de convidados
 */
export const canAccessWorkspace = (user, workspace) => {
  if (!user || !workspace) return false
  if (user.role === 'superAdmin') return true
  if (user.workspaceId === workspace.id) return true
  if (isWorkspaceWhitelisted(user, workspace)) return true
  if (!workspace.isPrivate) return isHighAdmin(user.role)

  return false
}

/**
 * Quem pode EDITAR conteúdo já existente (dashboards, forms, módulos futuros):
 * - superAdmin
 * - HighAdmin no próprio workspace de origem
 * - HighAdmin em workspace NÃO privado
 * - convidado com nível "edit" ou "create"
 */
export const canManageWorkspaceContent = (user, workspace) => {
  if (!user || !workspace) return false
  if (user.role === 'superAdmin') return true
  if (isHighAdmin(user.role) && user.workspaceId === workspace.id) return true
  if (!workspace.isPrivate && isHighAdmin(user.role)) return true

  const guest = getWorkspaceGuestEntry(user, workspace)

  if (guest) return GUEST_PERMISSION_RANK[guest.permission] >= GUEST_PERMISSION_RANK.edit

  return false
}

/**
 * Quem pode CRIAR conteúdo novo (dashboards, forms, módulos futuros):
 * - superAdmin
 * - HighAdmin no próprio workspace de origem
 * - HighAdmin em workspace NÃO privado
 * - convidado com nível "create"
 */
export const canCreateWorkspaceContent = (user, workspace) => {
  if (!user || !workspace) return false
  if (user.role === 'superAdmin') return true
  if (isHighAdmin(user.role) && user.workspaceId === workspace.id) return true
  if (!workspace.isPrivate && isHighAdmin(user.role)) return true

  const guest = getWorkspaceGuestEntry(user, workspace)

  if (guest) return guest.permission === 'create'

  return false
}

/**
 * Quem pode alterar as CONFIGURAÇÕES do próprio workspace (nome, isPrivate, lista de convidados):
 * - superAdmin
 * - HighAdmin no próprio workspace de origem
 * - HighAdmin em workspace NÃO privado
 * - em workspace privado, apenas convidado com nível "create" (nunca "view"/"edit")
 */
export const canManageWorkspaceSettings = (user, workspace) => {
  if (!user || !workspace) return false
  if (user.role === 'superAdmin') return true
  if (isHighAdmin(user.role) && user.workspaceId === workspace.id) return true
  if (!workspace.isPrivate && isHighAdmin(user.role)) return true

  if (workspace.isPrivate) {
    const guest = getWorkspaceGuestEntry(user, workspace)

    return !!guest && guest.permission === 'create'
  }

  return false
}
