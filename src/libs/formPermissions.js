import { isHighAdmin } from '@/utils/roleHelpers'
import { canAccessForm, isFormHighAdminOnly } from '@/libs/formAccess'

/** Apenas SuperAdmin e SubAdmin criam/editam formulários */
export function canManageForms(role) {
  return isHighAdmin(role)
}

/**
 * HighAdmin: qualquer form. Admin: forms com cargo ou função definidos.
 * Usuários comuns: customRoleId + match em allowedRoles/cargos.
 */
export function canFillAllFormsInWorkspace(role, form) {
  if (isHighAdmin(role)) return true
  if (role === 'admin') return form ? !isFormHighAdminOnly(form) : true
  return false
}

/** Apenas admin do workspace e highAdmin podem gerar novos links públicos */
export function canGeneratePublicLinks(role) {
  return isHighAdmin(role) || role === 'admin'
}

export function canGeneratePublicLinksInFill(role, form, ctx = {}) {
  if (isHighAdmin(role)) return true
  if (!form) return false
  if (isFormHighAdminOnly(form)) return false
  if (role === 'admin') return true
  return canAccessForm(form, ctx)
}

/** Quem pode enviar (submit) um formulário autenticado */
export function canSubmitForm(session, form, ctx = {}) {
  if (!session?.user) return false

  const role = session.user.role

  if (isHighAdmin(role)) return true

  if (form.workspaceId !== session.user.workspaceId) return false

  if (isFormHighAdminOnly(form)) return false

  if (role === 'admin') return true

  return canAccessForm(form, ctx)
}
