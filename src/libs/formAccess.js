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

export async function canAccessForm(form, ctx) {
  if (!ctx?.customRoleId) return false
  if (!Array.isArray(form.allowedRoles) || form.allowedRoles.length === 0) return false

  const { prisma } = await import('@/libs/prisma')
  const formsModule = await prisma.module.findUnique({ where: { key: 'forms' } })
  if (!formsModule) return false

  const perm = await prisma.rolePermission.findFirst({
    where: {
      customRoleId: ctx.customRoleId,
      moduleId: formsModule.id,
      action: 'view',
      resourceId: form.id
    }
  })
  return !!perm
}

export async function filterFormsForRole(forms, role, ctx = {}) {
  if (isHighAdmin(role)) return forms
  if (role === 'admin') return forms.filter(form => !isFormHighAdminOnly(form))
  if (!ctx?.customRoleId) return []

  const { prisma } = await import('@/libs/prisma')
  const formsModule = await prisma.module.findUnique({ where: { key: 'forms' } })
  if (!formsModule) return []

  const perms = await prisma.rolePermission.findMany({
    where: { customRoleId: ctx.customRoleId, moduleId: formsModule.id, action: 'view' },
    select: { resourceId: true }
  })

  const allowed = new Set(perms.map(p => p.resourceId))
  return forms.filter(f => allowed.has(f.id))
}

export async function buildFormListWhereForRole(role, workspaceId, ctx = {}) {
  if (isHighAdmin(role)) {
    return workspaceId ? { workspaceId } : {}
  }

  if (role === 'admin') {
    return workspaceId ? { workspaceId } : { id: 'none' }
  }

  if (!workspaceId || !ctx?.customRoleId) {
    return { id: 'none' }
  }

  // Busca IDs de forms permitidos via RolePermission
  const { prisma } = await import('@/libs/prisma')
  const formsModule = await prisma.module.findUnique({ where: { key: 'forms' } })
  if (!formsModule) return { id: 'none' }

  const perms = await prisma.rolePermission.findMany({
    where: {
      customRoleId: ctx.customRoleId,
      moduleId: formsModule.id,
      action: 'view'
    },
    select: { resourceId: true }
  })

  const formIds = perms.map(p => p.resourceId).filter(Boolean)
  if (formIds.length === 0) return { id: 'none' }

  return { workspaceId, id: { in: formIds } }
}
