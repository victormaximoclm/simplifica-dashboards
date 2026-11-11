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
    },
    {
      key: 'documents',
      name: 'Documentos'
    }
  ]

  console.log('Criando módulos...')

  let created = 0
  let updated = 0

  for (const moduleData of modules) {
    const existing = await prisma.module.findUnique({
      where: {
        key: moduleData.key
      }
    })

    if (existing) {
      console.log(`  Já existe: ${moduleData.name}`)
      updated++
      continue
    }

    await prisma.module.create({
      data: moduleData
    })

    console.log(`  Criado: ${moduleData.name}`)
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
