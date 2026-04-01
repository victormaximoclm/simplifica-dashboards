const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const args = process.argv.slice(2)
  const isProduction = args.includes('--production')
  const isQa = args.includes('--qa')

  if (isProduction) {
    console.log('==> Modo PRODUÇÃO: nenhum dado de seed será criado.')
    console.log('==> O Super Admin será criado pela tela de configuração inicial.')

    return
  }

  const hashedPassword = await bcrypt.hash('Admin@123', 10)

  if (isQa) {
    console.log('==> Modo QA: criando dados minimos...')

    const wsPotiguar = await prisma.workspace.upsert({
      where: { slug: 'hospital-potiguar' },
      update: {},
      create: {
        id: 'ws-hospital-potiguar',
        name: 'Hospital Potiguar',
        slug: 'hospital-potiguar'
      }
    })

    await prisma.user.upsert({
      where: { email: 'admin.hp@simplificagest.com' },
      update: { role: 'admin', workspaceId: wsPotiguar.id, status: 'active', password: hashedPassword },
      create: {
        name: 'Admin Hospital Potiguar',
        email: 'admin.hp@simplificagest.com',
        password: hashedPassword,
        role: 'admin',
        status: 'active',
        workspaceId: wsPotiguar.id
      }
    })

    await prisma.user.upsert({
      where: { email: 'victor@hospital-potiguar.com' },
      update: { role: 'user', workspaceId: wsPotiguar.id, status: 'active', password: hashedPassword },
      create: {
        name: 'Victor',
        email: 'victor@hospital-potiguar.com',
        password: hashedPassword,
        role: 'user',
        status: 'active',
        workspaceId: wsPotiguar.id
      }
    })

    console.log('Seed QA completo!')
    console.log('Workspace:', wsPotiguar.name)
    console.log('Usuarios: admin.hp@simplificagest.com, victor@hospital-potiguar.com')
    console.log('Senha de todos os usuarios: Admin@123')

    return
  }

  // ── Modo TESTE ──────────────────────────────────────────────
  console.log('==> Modo TESTE: criando dados de exemplo...')

  // Create workspaces
  const wsPotiguar = await prisma.workspace.upsert({
    where: { slug: 'hospital-potiguar' },
    update: {},
    create: {
      id: 'ws-hospital-potiguar',
      name: 'Hospital Potiguar',
      slug: 'hospital-potiguar'
    }
  })

  const wsUnimed = await prisma.workspace.upsert({
    where: { slug: 'hospital-unimed' },
    update: {},
    create: {
      id: 'ws-hospital-unimed',
      name: 'Hospital Unimed',
      slug: 'hospital-unimed'
    }
  })

  // Create superAdmin
  await prisma.user.upsert({
    where: { email: 'admin@vuexy.com' },
    update: { role: 'superAdmin', status: 'active', password: hashedPassword },
    create: {
      name: 'Super Admin',
      email: 'admin@vuexy.com',
      password: hashedPassword,
      role: 'superAdmin',
      status: 'active',
      workspaceId: null
    }
  })

  // Create subAdmin
  await prisma.user.upsert({
    where: { email: 'subadmin@vuexy.com' },
    update: { role: 'subAdmin', status: 'active', password: hashedPassword },
    create: {
      name: 'Sub Admin',
      email: 'subadmin@vuexy.com',
      password: hashedPassword,
      role: 'subAdmin',
      status: 'active',
      workspaceId: null
    }
  })

  // Create admin for Hospital Potiguar
  await prisma.user.upsert({
    where: { email: 'admin.hp@simplificagest.com' },
    update: { role: 'admin', workspaceId: wsPotiguar.id, status: 'active', password: hashedPassword },
    create: {
      name: 'Admin Hospital Potiguar',
      email: 'admin.hp@simplificagest.com',
      password: hashedPassword,
      role: 'admin',
      status: 'active',
      workspaceId: wsPotiguar.id
    }
  })

  // Create user for Hospital Potiguar
  await prisma.user.upsert({
    where: { email: 'victor@hospital-potiguar.com' },
    update: { role: 'user', workspaceId: wsPotiguar.id, status: 'active', password: hashedPassword },
    create: {
      name: 'Victor',
      email: 'victor@hospital-potiguar.com',
      password: hashedPassword,
      role: 'user',
      status: 'active',
      workspaceId: wsPotiguar.id
    }
  })

  // Create user for Hospital Unimed
  await prisma.user.upsert({
    where: { email: 'gabriel@hospital-unimed.com' },
    update: { role: 'user', workspaceId: wsUnimed.id, status: 'active', password: hashedPassword },
    create: {
      name: 'Gabriel',
      email: 'gabriel@hospital-unimed.com',
      password: hashedPassword,
      role: 'user',
      status: 'active',
      workspaceId: wsUnimed.id
    }
  })

  // Create global custom roles
  const roleRecepcao = await prisma.customRole.upsert({
    where: { name: 'Recepção' },
    update: {},
    create: { name: 'Recepção' }
  })

  const roleFaturamento = await prisma.customRole.upsert({
    where: { name: 'Faturamento' },
    update: {},
    create: { name: 'Faturamento' }
  })

  // Assign custom role to Victor
  await prisma.user.update({
    where: { email: 'victor@hospital-potiguar.com' },
    data: { customRoleId: roleRecepcao.id }
  })

  console.log('Seed de teste completo!')
  console.log('Workspaces:', wsPotiguar.name, wsUnimed.name)
  console.log('Cargos:', roleRecepcao.name, roleFaturamento.name)
  console.log('Senha de todos os usuários: Admin@123')
  console.log('NOTA: Dashboards devem ser criados manualmente via interface.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
