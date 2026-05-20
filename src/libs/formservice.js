import { prisma } from '@/libs/prisma'

export async function createForm({
  title,
  description,
  workspaceId,
  fields,
  webhookUrl,
  allowPublicLink,
  allowedCargos,
  allowedRoles
}) {
  return prisma.form.create({
    data: {
      title,
      description,
      workspaceId,
      fields,
      webhookUrl,
      allowPublicLink,
      allowedCargos,
      allowedRoles: allowedRoles ?? []
    }
  })
}

export async function listForms({ workspaceId, cargo, customRoleName }) {
  const { buildFormListWhere } = await import('@/libs/formAccess')

  return prisma.form.findMany({
    where: buildFormListWhere(workspaceId, { cargo, customRoleName }),
    orderBy: { createdAt: 'desc' }
  })
}

export async function getFormById(id) {
  return prisma.form.findUnique({ where: { id } })
}

export async function updateForm(id, data) {
  return prisma.form.update({ where: { id }, data })
}

export async function deleteForm(id) {
  return prisma.form.delete({ where: { id } })
}
