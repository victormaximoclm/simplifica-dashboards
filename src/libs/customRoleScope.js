import { prisma } from '@/libs/prisma'

/**
 * Cargos (CustomRole) pertencem a um único workspace.
 * Retorna os ids de `roleIds` que NÃO existem ou NÃO pertencem a `workspaceId`.
 */
export async function findRolesOutsideWorkspace(roleIds, workspaceId) {
  const ids = [...new Set((Array.isArray(roleIds) ? roleIds : []).filter(Boolean))]

  if (!ids.length) return []
  if (!workspaceId) return ids

  const valid = await prisma.customRole.findMany({
    where: { id: { in: ids }, workspaceId },
    select: { id: true }
  })

  const validIds = new Set(valid.map(role => role.id))

  return ids.filter(id => !validIds.has(id))
}

/** true quando todos os cargos existem e pertencem ao workspace informado */
export async function rolesBelongToWorkspace(roleIds, workspaceId) {
  return (await findRolesOutsideWorkspace(roleIds, workspaceId)).length === 0
}

/**
 * Remove as permissões (RolePermission) de um recurso para cargos que não são do workspace dele.
 * Usado quando o recurso (dashboard/form) muda de workspace.
 */
export async function pruneForeignRolePermissions({ moduleId, resourceId, workspaceId }) {
  if (!moduleId || !resourceId) return

  await prisma.rolePermission.deleteMany({
    where: {
      moduleId,
      resourceId,
      NOT: { customRole: { workspaceId } }
    }
  })
}
