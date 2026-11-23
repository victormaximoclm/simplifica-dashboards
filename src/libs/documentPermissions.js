import { isHighAdmin } from '@/utils/roleHelpers'

/**
 * Ponto único de decisão de perfil do módulo de Documentos.
 * Para abrir o módulo a outros perfis, altere apenas o corpo destas funções.
 * As rotas sempre combinam estas regras com o escopo do workspace
 * (canCreateWorkspaceContent / canManageWorkspaceContent / canAccessWorkspace).
 */

/** Criar pasta e enviar arquivo: apenas SuperAdmin e SubAdmin */
export function canCreateDocuments(user) {
  return isHighAdmin(user?.role)
}

/** Renomear e mover pasta/arquivo: apenas SuperAdmin e SubAdmin */
export function canEditDocuments(user) {
  return isHighAdmin(user?.role)
}

/** Excluir pasta/arquivo: apenas SuperAdmin e SubAdmin */
export function canDeleteDocuments(user) {
  return isHighAdmin(user?.role)
}

/** Navegar, visualizar e baixar: todos os perfis, sempre filtrado pelo workspace acessível */
export function canViewDocuments(user) {
  return !!user
}

/**
 * Quanto do conteúdo de um workspace o perfil enxerga (o workspace já foi validado por canAccessWorkspace):
 * - 'all': tudo. SuperAdmin/SubAdmin (dentro do alcance do workspace) e admin do próprio workspace.
 * - 'grants': só o que os cargos liberam (documentGrants.js). Usuário comum do próprio workspace.
 * - 'none': nada. Quem não é do workspace e não é SuperAdmin/SubAdmin (por exemplo, convidado comum): os
 *   documentos são isolados por workspace e os cargos de um workspace nunca valem em outro.
 */
export function getDocumentViewMode(user, workspace) {
  if (!user || !workspace) return 'none'
  if (isHighAdmin(user.role)) return 'all'
  if (!user.workspaceId || user.workspaceId !== workspace.id) return 'none'
  if (user.role === 'admin') return 'all'

  return 'grants'
}
