import { prisma } from '@/libs/prisma'
import { isHighAdmin } from '@/utils/roleHelpers'

/** Contexto do usuário para controle de acesso a formulários */
export async function getUserFormContext(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      workspaceId: true,
      customRoleId: true,
      customRole: { select: { name: true } },
      userIntegrations: {
        where: { provider: 'clickup', enabled: true },
        take: 1,
        select: { configJson: true }
      }
    }
  })

  const rawCargo = user?.userIntegrations?.[0]?.configJson?.cargo
  const cargo = typeof rawCargo === 'string' ? rawCargo.trim() : null

  return {
    workspaceId: user?.workspaceId ?? null,
    cargo: cargo || null,
    customRoleId: user?.customRoleId ?? null,
    customRoleName: user?.customRole?.name ?? null
  }
}

/** Usuário comum precisa de CustomRole atribuída para ver qualquer formulário */
export function userHasFormViewerAccess(ctx) {
  return Boolean(ctx?.customRoleId)
}

/** Compara cargo do usuário com allowedCargos (case-insensitive) */
export function cargoMatches(allowedCargos, cargo) {
  if (!cargo || !Array.isArray(allowedCargos) || allowedCargos.length === 0) return false
  const normalized = cargo.trim().toLowerCase()
  return allowedCargos.some(c => String(c).trim().toLowerCase() === normalized)
}

/** Compara customRoleId (ou nome legado) com allowedRoles do formulário */
export function roleMatches(allowedRoles, customRoleId, customRoleName) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) return false
  if (customRoleId && allowedRoles.includes(customRoleId)) return true
  if (customRoleName && allowedRoles.includes(customRoleName)) return true
  return false
}

/**
 * Verifica se o usuário (role user) pode acessar/preencher o formulário.
 * Requer customRoleId no contexto. Admin/highAdmin validam fora desta função.
 */
export function canAccessForm(form, ctx) {
  if (!userHasFormViewerAccess(ctx)) return false

  const restrictsCargos = Array.isArray(form.allowedCargos) && form.allowedCargos.length > 0
  const restrictsRoles = Array.isArray(form.allowedRoles) && form.allowedRoles.length > 0

  if (!restrictsCargos && !restrictsRoles) return true
  if (restrictsRoles && roleMatches(form.allowedRoles, ctx.customRoleId, ctx.customRoleName)) return true
  if (restrictsCargos && cargoMatches(form.allowedCargos, ctx.cargo)) return true

  return false
}

/** Filtra forms em memória (cargo case-insensitive, role por id/nome) */
export function filterFormsForContext(forms, ctx) {
  if (!userHasFormViewerAccess(ctx)) return []
  return forms.filter(form => canAccessForm(form, ctx))
}

/** Usuários comuns: filtro pós-query por cargo (case-insensitive) */
export function shouldFilterFormsByContext(role) {
  return !isHighAdmin(role) && role !== 'admin'
}

/**
 * Filtro Prisma para usuários com CustomRole no workspace.
 * - Formulários abertos (sem restrição de cargo/função)
 * - Formulários com allowedRoles contendo o customRoleId
 * - Formulários com allowedCargos contendo o cargo ClickUp (se houver)
 */
export function buildFormListWhere(workspaceId, ctx = {}) {
  if (!workspaceId || !userHasFormViewerAccess(ctx)) {
    return { id: 'none' }
  }

  const orConditions = [{ AND: [{ allowedCargos: { isEmpty: true } }, { allowedRoles: { isEmpty: true } }] }]

  orConditions.push({ allowedRoles: { has: ctx.customRoleId } })
  if (ctx.customRoleName) {
    orConditions.push({ allowedRoles: { has: ctx.customRoleName } })
  }
  if (ctx.cargo) {
    orConditions.push({ allowedCargos: { has: ctx.cargo } })
  }

  return { workspaceId, OR: orConditions }
}

/**
 * Filtro de listagem por papel:
 * - superAdmin/subAdmin: todos os forms (opcionalmente por workspace ativo)
 * - admin: todos do próprio workspace
 * - user: workspace + CustomRole obrigatória + match em allowedRoles/cargos
 */
export function buildFormListWhereForRole(role, workspaceId, ctx = {}) {
  if (isHighAdmin(role)) {
    return workspaceId ? { workspaceId } : {}
  }

  if (role === 'admin') {
    return workspaceId ? { workspaceId } : { id: 'none' }
  }

  return buildFormListWhere(workspaceId, ctx)
}
