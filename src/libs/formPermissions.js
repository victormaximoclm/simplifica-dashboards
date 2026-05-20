import { isHighAdmin } from '@/utils/roleHelpers'
import { canAccessForm } from '@/libs/formAccess'

/** Apenas SuperAdmin e SubAdmin criam/editam formulários */
export function canManageForms(role) {
  return isHighAdmin(role)
}

/**
 * Admin e HighAdmin preenchem qualquer form do workspace (sem filtro CustomRole/cargo).
 * Usuários comuns dependem de customRoleId + allowedRoles no formulário.
 */
export function canFillAllFormsInWorkspace(role) {
  return isHighAdmin(role) || role === 'admin'
}

/** Apenas admin do workspace e highAdmin podem gerar novos links públicos */
export function canGeneratePublicLinks(role) {
  return isHighAdmin(role) || role === 'admin'
}

export function canGeneratePublicLinksInFill(role, form, ctx = {}) {
  if (isHighAdmin(role) || role === 'admin') return true
  if (!form) return false
  return canAccessForm(form, ctx)
}

/** Quem pode enviar (submit) um formulário autenticado */
export function canSubmitForm(session, form, ctx = {}) {
  if (!session?.user) return false

  const role = session.user.role

  if (isHighAdmin(role)) return true

  if (role === 'admin') {
    return form.workspaceId === session.user.workspaceId
  }

  if (form.workspaceId !== session.user.workspaceId) return false

  return canAccessForm(form, ctx)
}
