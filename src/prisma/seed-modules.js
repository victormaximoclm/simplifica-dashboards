const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  await prisma.module.upsert({
    where: { key: 'dashboards' },
    update: {},
    create: { id: 'mod_dashboards', key: 'dashboards', name: 'Dashboards' }
  })
  await prisma.module.upsert({
    where: { key: 'forms' },
    update: {},
    create: { id: 'mod_forms', key: 'forms', name: 'Formularios' }
  })
  console.log('ok')
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
