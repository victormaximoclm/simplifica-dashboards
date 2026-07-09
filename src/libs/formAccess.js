import { prisma } from '@/libs/prisma'
import { isHighAdmin } from '@/utils/roleHelpers'

export async function getUserFormContext(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      workspaceId: true,
      customRoleId: true,
      customRole: { select: { name: true } }
    }
  })

  return {
    workspaceId: user?.workspaceId ?? null,
    customRoleId: user?.customRoleId ?? null,
    customRoleName: user?.customRole?.name ?? null
  }
}

export function userHasFormViewerAccess(ctx) {
  return Boolean(ctx?.customRoleId)
}

export function isFormHighAdminOnly(form) {
  return !Array.isArray(form?.allowedRoles) || form.allowedRoles.length === 0
}

export function canNonHighAdminAccessForm(role, form, ctx = {}) {
  if (isFormHighAdminOnly(form)) return false
  if (role === 'admin') return true
  return canAccessForm(form, ctx)
}

export function canAccessForm(form, ctx) {
  if (!userHasFormViewerAccess(ctx)) return false
  if (!Array.isArray(form.allowedRoles) || form.allowedRoles.length === 0) return false
  return form.allowedRoles.includes(ctx.customRoleId)
}

export function filterFormsForRole(forms, role, ctx = {}) {
  if (isHighAdmin(role)) return forms
  if (role === 'admin') return forms.filter(form => !isFormHighAdminOnly(form))
  if (!userHasFormViewerAccess(ctx)) return []
  return forms.filter(form => canAccessForm(form, ctx))
}

export function buildFormListWhereForRole(role, workspaceId, ctx = {}) {
  if (isHighAdmin(role)) {
    return workspaceId ? { workspaceId } : {}
  }

  if (role === 'admin') {
    return workspaceId ? { workspaceId } : { id: 'none' }
  }

  if (!workspaceId || !userHasFormViewerAccess(ctx)) {
    return { id: 'none' }
  }

  return {
    workspaceId,
    allowedRoles: { has: ctx.customRoleId }
  }
}
