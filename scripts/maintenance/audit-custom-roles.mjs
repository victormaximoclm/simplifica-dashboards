// Varredura SOMENTE LEITURA: encontra cargos usados fora do workspace a que pertencem.
// Uso: docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm tools npx dotenv -e .env -- node scripts/maintenance/audit-custom-roles.mjs
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const users = await prisma.user.findMany({
  where: { customRoleId: { not: null } },
  select: { id: true, email: true, workspaceId: true, customRole: { select: { id: true, name: true, workspaceId: true } } }
})

const usersWithForeignRole = users.filter(u => u.customRole && u.customRole.workspaceId !== u.workspaceId)

const [dashboards, forms, modules] = await Promise.all([
  prisma.dashboard.findMany({ select: { id: true, title: true, workspaceId: true } }),
  prisma.form.findMany({ select: { id: true, title: true, workspaceId: true } }),
  prisma.module.findMany({ where: { key: { in: ['dashboards', 'forms'] } }, select: { id: true, key: true } })
])

const resources = new Map()

dashboards.forEach(d => resources.set(`dashboards:${d.id}`, { kind: 'dashboard', ...d }))
forms.forEach(f => resources.set(`forms:${f.id}`, { kind: 'form', ...f }))

const keyById = new Map(modules.map(m => [m.id, m.key]))

const perms = await prisma.rolePermission.findMany({
  where: { moduleId: { in: modules.map(m => m.id) }, resourceId: { not: null } },
  include: { customRole: { select: { name: true, workspaceId: true } } }
})

const foreignPerms = []
const orphanPerms = []

for (const p of perms) {
  const res = resources.get(`${keyById.get(p.moduleId)}:${p.resourceId}`)

  if (!res) orphanPerms.push(p)
  else if (p.customRole.workspaceId !== res.workspaceId) foreignPerms.push({ p, res })
}

console.log(`Usuários com cargo de outro workspace: ${usersWithForeignRole.length}`)
usersWithForeignRole.forEach(u =>
  console.log(`  - ${u.email} (ws ${u.workspaceId}) -> cargo "${u.customRole.name}" (ws ${u.customRole.workspaceId})`)
)
console.log(`Permissões de cargo de outro workspace: ${foreignPerms.length}`)
foreignPerms.forEach(({ p, res }) =>
  console.log(`  - ${res.kind} "${res.title}" (ws ${res.workspaceId}) <- cargo "${p.customRole.name}" (ws ${p.customRole.workspaceId}) [perm ${p.id}]`)
)
console.log(`Permissões órfãs (recurso inexistente): ${orphanPerms.length}`)

await prisma.$disconnect()
