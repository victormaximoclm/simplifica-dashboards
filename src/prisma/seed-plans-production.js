// scripts/seed-plans-production.js
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const simple = await prisma.plan.upsert({
    where: { key: 'simple' },
    update: {},
    create: { key: 'simple', name: 'Simples', maxUsers: 10 }
  })

  await prisma.plan.upsert({
    where: { key: 'pro' },
    update: {},
    create: { key: 'pro', name: 'Pro', maxUsers: 50 }
  })

  await prisma.plan.upsert({
    where: { key: 'enterprise' },
    update: {},
    create: { key: 'enterprise', name: 'Enterprise', maxUsers: -1 }
  })

  // Só preenche workspaces que AINDA não têm plano — nunca sobrescreve um plano já atribuído
  const { count } = await prisma.workspace.updateMany({
    where: { planId: null },
    data: { planId: simple.id }
  })

  console.log(`Planos garantidos. ${count} workspace(s) migrado(s) para o plano Simples por padrão.`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
