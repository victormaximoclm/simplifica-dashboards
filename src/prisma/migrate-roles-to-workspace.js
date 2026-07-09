const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // 1. Busca todos os cargos globais existentes
  const globalRoles = await prisma.customRole.findMany({
    include: { users: true, dashboardVisibility: true }
  })

  if (globalRoles.length === 0) {
    console.log('Nenhum cargo global encontrado.')
    return
  }

  // 2. Busca todos os workspaces
  const workspaces = await prisma.workspace.findMany()
  console.log(`Workspaces: ${workspaces.map(w => w.name).join(', ')}`)
  console.log(`Cargos globais: ${globalRoles.map(r => r.name).join(', ')}`)

  // Mapa: oldRoleId -> { workspaceId -> newRoleId }
  const roleMap = {}

  // 3. Para cada workspace, cria uma cópia de cada cargo global
  for (const workspace of workspaces) {
    for (const role of globalRoles) {
      // Evita duplicata se rodar o script mais de uma vez
      const existing = await prisma.$queryRaw`
        SELECT id FROM "CustomRole"
        WHERE name = ${role.name} AND "workspaceId" = ${workspace.id}
        LIMIT 1
      `

      let newRoleId
      if (existing.length > 0) {
        newRoleId = existing[0].id
        console.log(`  Já existe: ${role.name} em ${workspace.name}`)
      } else {
        const created = await prisma.$queryRaw`
          INSERT INTO "CustomRole" (id, name, "workspaceId", "createdAt", "updatedAt")
          VALUES (gen_random_uuid()::text, ${role.name}, ${workspace.id}, NOW(), NOW())
          RETURNING id
        `
        newRoleId = created[0].id
        console.log(`  Criado: ${role.name} em ${workspace.name}`)
      }

      if (!roleMap[role.id]) roleMap[role.id] = {}
      roleMap[role.id][workspace.id] = newRoleId
    }
  }

  // 4. Reatribui usuários ao cargo do seu workspace
  let usersUpdated = 0
  for (const role of globalRoles) {
    for (const user of role.users) {
      if (!user.workspaceId) {
        console.log(`  Usuário ${user.email} sem workspace — pulando`)
        continue
      }
      const newRoleId = roleMap[role.id]?.[user.workspaceId]
      if (!newRoleId) continue

      await prisma.user.update({
        where: { id: user.id },
        data: { customRoleId: newRoleId }
      })
      usersUpdated++
    }
  }
  console.log(`Usuários atualizados: ${usersUpdated}`)

  // 5. Reatribui DashboardVisibility ao cargo do workspace do dashboard
  let visibilitiesUpdated = 0
  for (const role of globalRoles) {
    for (const dv of role.dashboardVisibility) {
      const dashboard = await prisma.dashboard.findUnique({
        where: { id: dv.dashboardId }
      })
      if (!dashboard?.workspaceId) continue

      const newRoleId = roleMap[role.id]?.[dashboard.workspaceId]
      if (!newRoleId) continue

      // Verifica se já existe a combinação nova antes de criar
      const dvExists = await prisma.dashboardVisibility.findUnique({
        where: { dashboardId_customRoleId: { dashboardId: dv.dashboardId, customRoleId: newRoleId } }
      })

      if (!dvExists) {
        await prisma.dashboardVisibility.create({
          data: { dashboardId: dv.dashboardId, customRoleId: newRoleId }
        })
      }
      visibilitiesUpdated++
    }
  }
  console.log(`DashboardVisibilities atualizadas: ${visibilitiesUpdated}`)

  console.log('\nMigração concluída. Confira os dados antes de deletar os cargos globais.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
