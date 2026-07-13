const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const modules = [
    {
      key: 'dashboards',
      name: 'Dashboards'
    },
    {
      key: 'forms',
      name: 'Formulários'
    },
    {
      key: 'users',
      name: 'Usuários'
    }
  ]

  console.log('Criando módulos...')

  let created = 0
  let updated = 0

  for (const module of modules) {
    const existing = await prisma.module.findUnique({
      where: {
        key: module.key
      }
    })

    if (existing) {
      console.log(`  Já existe: ${module.name}`)
      updated++
      continue
    }

    await prisma.module.create({
      data: module
    })

    console.log(`  Criado: ${module.name}`)
    created++
  }

  console.log('\nResumo:')
  console.log(`Criados: ${created}`)
  console.log(`Existentes: ${updated}`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
