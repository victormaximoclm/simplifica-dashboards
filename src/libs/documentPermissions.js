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
