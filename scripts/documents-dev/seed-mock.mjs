// Dados de teste do módulo de Documentos — SOMENTE ambiente local.
//
//   pnpm documents:mock            cria (idempotente: se já houver documentos [MOCK], não duplica)
//   pnpm documents:mock --reset    recria os documentos [MOCK] do zero (usuários/workspaces são mantidos)
//   pnpm documents:mock:clean      remove tudo que este script criou (banco + arquivos do storage)
//
// Usuários/workspaces/funções são gravados via Prisma; pastas e arquivos passam pela API real
// (mesmo caminho da UI), para storageKey, disco e banco ficarem coerentes.
import fs from 'fs'
import path from 'path'

import bcrypt from 'bcryptjs'
import prismaPkg from '@prisma/client'

import {
  BASE_URL,
  MOCK_CUSTOM_ROLE_NAME,
  MOCK_HTML_DOCUMENTS,
  MOCK_HTML_TEMPLATES,
  MOCK_PASSWORD,
  MOCK_USERS,
  MOCK_WORKSPACES,
  api,
  assertLocalEnvironment,
  createFolder,
  isAppUp,
  login,
  makeLargeZip,
  makePdf,
  makeSampleFiles,
  makeTxt,
  uploadFiles
} from './lib.mjs'

const { PrismaClient } = prismaPkg
const args = process.argv.slice(2)
const isClean = args.includes('--clean')
const isReset = args.includes('--reset')

assertLocalEnvironment({ needDatabase: true, needApp: false })

const prisma = new PrismaClient()

const mockSlugs = Object.values(MOCK_WORKSPACES).map(ws => ws.slug)
const mockEmails = Object.values(MOCK_USERS).map(user => user.email)

// ── Base: workspaces, função e usuários ─────

async function ensureBaseData() {
  const workspaces = {}

  for (const [key, ws] of Object.entries(MOCK_WORKSPACES)) {
    workspaces[key] = await prisma.workspace.upsert({
      where: { slug: ws.slug },
      update: { name: ws.name, isPrivate: ws.isPrivate },
      create: { name: ws.name, slug: ws.slug, isPrivate: ws.isPrivate }
    })
  }

  const customRole = await prisma.customRole.upsert({
    where: { name: MOCK_CUSTOM_ROLE_NAME },
    update: { workspaceId: workspaces.beta.id },
    create: { name: MOCK_CUSTOM_ROLE_NAME, workspaceId: workspaces.beta.id }
  })

  const password = await bcrypt.hash(MOCK_PASSWORD, 10)
  const users = {}

  for (const [key, user] of Object.entries(MOCK_USERS)) {
    const data = {
      name: user.name,
      role: user.role,
      status: 'active',
      password,
      workspaceId: user.workspace ? workspaces[user.workspace].id : null,
      customRoleId: key === 'userBeta' ? customRole.id : null,
      termsAccepted: true,
      termsAcceptedAt: new Date()
    }

    users[key] = await prisma.user.upsert({
      where: { email: user.email },
      update: data,
      create: { email: user.email, ...data }
    })
  }

  await prisma.workspaceGuest.upsert({
    where: { workspaceId_userId: { workspaceId: workspaces.privado.id, userId: users.convidado.id } },
    update: { permission: 'view' },
    create: { workspaceId: workspaces.privado.id, userId: users.convidado.id, permission: 'view' }
  })

  return { workspaces, users }
}

// ── Documentos (via API) ────────────────────

function expectStatus(res, expected, what) {
  if (res.status !== expected) {
    throw new Error(`${what}: esperado HTTP ${expected}, recebido ${res.status} ${JSON.stringify(res.body)}`)
  }

  return res.body
}

async function seedDocuments(session, workspaces) {
  let folderCount = 0
  let fileCount = 0

  const folder = async (workspace, parentId, name) => {
    const body = expectStatus(
      await createFolder(session, { workspaceId: workspace.id, parentId, name }),
      201,
      `pasta "${name}"`
    )

    folderCount++

    return body.id
  }

  // Um arquivo por requisição: mesmo comportamento da UI e corpo sempre abaixo do limite
  const upload = async (workspace, folderId, files) => {
    for (const file of files) {
      expectStatus(
        await uploadFiles(session, { workspaceId: workspace.id, folderId, files: [file] }),
        201,
        `arquivo "${file.name}"`
      )
      fileCount++
    }
  }

  const samples = makeSampleFiles()
  const sample = name => samples.find(file => file.name === name)
  const { alfa, beta, privado } = workspaces

  // [MOCK] Alfa
  console.log('  [MOCK] Alfa: estrutura principal...')

  const contratos = await folder(alfa, null, 'Contratos')
  const c2024 = await folder(alfa, contratos, '2024')
  const c2025 = await folder(alfa, contratos, '2025')

  await upload(alfa, c2024, [{ ...sample('Contrato de Prestação de Serviços.pdf'), name: 'Contrato Fornecedor A.pdf' }])
  await upload(alfa, c2025, [
    sample('Contrato de Prestação de Serviços.pdf'),
    { name: 'Aditivo nº 1.pdf', type: 'application/pdf', buffer: makePdf('Aditivo n 1', 1) },
    sample('Leia-me.txt')
  ])

  const financeiro = await folder(alfa, null, 'Financeiro')
  const notas = await folder(alfa, financeiro, 'Notas Fiscais')

  await upload(alfa, financeiro, [sample('Orçamento 2025.xlsx'), sample('Clientes São Paulo.csv')])
  await upload(alfa, notas, [
    { name: 'NF 0001 – Janeiro.pdf', type: 'application/pdf', buffer: makePdf('NF 0001 Janeiro', 2) },
    { name: 'NF 0002 – Fevereiro.pdf', type: 'application/pdf', buffer: makePdf('NF 0002 Fevereiro', 1) },
    sample('Leia-me.txt')
  ])

  const rh = await folder(alfa, null, 'RH')
  const politicas = await folder(alfa, rh, 'Políticas')

  await upload(alfa, politicas, [sample('Política de Férias.docx'), sample('Apresentação Comercial.pptx')])

  const marketing = await folder(alfa, null, 'Marketing')
  const imagens = await folder(alfa, marketing, 'Imagens')

  await upload(alfa, imagens, [sample('Logo Simpla.png'), sample('Foto da fachada.jpg'), sample('Ícone.webp')])
  await upload(alfa, marketing, [sample('Pacote de anexos.zip')])

  await folder(alfa, null, 'Pasta vazia')

  // Cadeia com a profundidade máxima (10 níveis)
  let parent = null

  for (let level = 1; level <= 10; level++) parent = await folder(alfa, parent, `Nivel ${level}`)

  await upload(alfa, parent, [{ name: 'No fundo.txt', type: 'text/plain', buffer: makeTxt('Nível 10 alcançado.') }])

  // Nomes variados na raiz
  console.log('  [MOCK] Alfa: nomes variados e arquivo grande (~20 MB)...')

  const longBase = 'Relatório anual consolidado de indicadores operacionais, financeiros e de qualidade '.repeat(3)

  await upload(alfa, null, [
    { name: 'Relatório 📊 Resultados 2025.pdf', type: 'application/pdf', buffer: makePdf('Resultados 2025', 2) },
    { name: 'arquivo com   espaços   múltiplos.txt', type: 'text/plain', buffer: makeTxt('espaços') },
    {
      name: `${longBase.slice(0, 210).trim()}.txt`,
      type: 'text/plain',
      buffer: makeTxt('nome com mais de 200 caracteres')
    },
    sample('Leia-me.txt'),
    { name: 'Arquivo grande (20 MB).zip', type: 'application/zip', buffer: makeLargeZip(20 * 1024 * 1024, 7) }
  ])

  // Pasta com ~60 itens (paginação e busca)
  console.log('  [MOCK] Alfa: pasta com 60 itens...')

  const muitos = await folder(alfa, null, 'Muitos itens')

  for (let i = 1; i <= 5; i++) await folder(alfa, muitos, `Subpasta ${String(i).padStart(2, '0')}`)

  const manyFiles = Array.from({ length: 55 }, (_, index) => {
    const n = String(index + 1).padStart(2, '0')
    const label = index % 5 === 0 ? `Comunicação ${n}` : index % 5 === 1 ? `Ação ${n}` : `Item ${n}`

    return { name: `${label}.txt`, type: 'text/plain', buffer: makeTxt(`Item de teste ${n}`) }
  })

  await upload(alfa, muitos, manyFiles)

  // [MOCK] Beta
  console.log('  [MOCK] Beta...')

  const projetos = await folder(beta, null, 'Projetos')
  const p2025 = await folder(beta, projetos, '2025')

  await upload(beta, p2025, [
    { name: 'Cronograma Beta.pdf', type: 'application/pdf', buffer: makePdf('Cronograma Beta', 1) }
  ])
  await upload(beta, null, [sample('Leia-me.txt'), { ...sample('Logo Simpla.png'), name: 'Logo Beta.png' }])

  // [MOCK] Privado
  console.log('  [MOCK] Privado...')

  const confidencial = await folder(privado, null, 'Confidencial')

  await upload(privado, confidencial, [
    { name: 'Plano estratégico.pdf', type: 'application/pdf', buffer: makePdf('Plano estrategico', 2) },
    { name: 'Salários.csv', type: 'text/csv', buffer: Buffer.from('cargo;faixa\nAnalista;X\nGerente;Y\n', 'utf8') }
  ])

  return { folderCount, fileCount }
}

// Documentos HTML (editor + template Simplifica). Idempotente por nome, à parte do seed principal,
// para aparecerem também em bases [MOCK] criadas antes deste recurso
async function ensureHtmlTemplates(session, workspaces) {
  let created = 0

  for (const template of MOCK_HTML_TEMPLATES) {
    const workspace = workspaces[template.workspace]

    const exists = await prisma.documentHtmlTemplate.findFirst({
      where: { workspaceId: workspace.id, name: template.name },
      select: { id: true }
    })

    if (exists) continue

    const res = await api(session, 'POST', '/api/documents/html-templates', {
      json: { workspaceId: workspace.id, name: template.name, html: template.html }
    })

    expectStatus(res, 201, `criar template HTML "${template.name}"`)
    created++
  }

  if (created) console.log(`  ${created} template(s) HTML [MOCK] criado(s).`)
}

async function ensureHtmlDocuments(session, workspaces) {
  let created = 0

  for (const doc of MOCK_HTML_DOCUMENTS) {
    const workspace = workspaces[doc.workspace]

    const folder = doc.folder
      ? await prisma.documentFolder.findFirst({ where: { workspaceId: workspace.id, name: doc.folder } })
      : null

    if (doc.folder && !folder) continue

    const template = doc.template
      ? await prisma.documentHtmlTemplate.findFirst({ where: { workspaceId: workspace.id, name: doc.template } })
      : null

    const exists = await prisma.documentFile.findFirst({
      where: { workspaceId: workspace.id, folderId: folder?.id ?? null, name: `${doc.title}.html` },
      select: { id: true }
    })

    if (exists) continue

    const res = await api(session, 'POST', '/api/documents/html', {
      json: {
        workspaceId: workspace.id,
        folderId: folder?.id ?? null,
        title: doc.title,
        content: doc.content,
        templateId: template?.id ?? null
      }
    })

    expectStatus(res, 201, `criar documento HTML "${doc.title}"`)
    created++
  }

  if (created) console.log(`  ${created} documento(s) HTML [MOCK] criado(s).`)
}

// ── Limpeza ─────────────────────────────────

async function deleteDocumentsViaApi(session, workspaces) {
  for (const ws of workspaces) {
    // Itens da raiz; excluir uma pasta remove todo o conteúdo e os blobs
    for (;;) {
      const res = await api(session, 'GET', `/api/documents?workspaceId=${ws.id}&pageSize=100`)
      const items = expectStatus(res, 200, `listar ${ws.name}`).data

      if (!items.length) break

      for (const item of items) {
        const route = item.kind === 'folder' ? 'folders' : 'files'

        expectStatus(await api(session, 'DELETE', `/api/documents/${route}/${item.id}`), 200, `excluir "${item.name}"`)
      }
    }
  }
}

async function removeLocalStorageDirs(workspaces) {
  const storageDir = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.resolve('storage')
  const leftovers = []

  for (const ws of workspaces) {
    const dir = path.join(storageDir, ws.id)

    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
      console.log(`  removido do storage local: ${dir}`)
    } else {
      leftovers.push(ws.id)
    }
  }

  return leftovers
}

async function clean() {
  const workspaces = await prisma.workspace.findMany({ where: { slug: { in: mockSlugs } } })
  const workspaceIds = workspaces.map(ws => ws.id)
  const mockUsers = await prisma.user.findMany({ where: { email: { in: mockEmails } }, select: { id: true } })
  const mockUserIds = mockUsers.map(user => user.id)

  // Excluir um workspace apaga em cascata os usuários dele: nunca faça isso com usuários reais
  const foreignUsers = await prisma.user.findMany({
    where: { workspaceId: { in: workspaceIds }, email: { notIn: mockEmails } },
    select: { email: true }
  })

  if (foreignUsers.length) {
    console.error(
      `✖ Há usuários que não são [MOCK] dentro dos workspaces [MOCK]: ${foreignUsers.map(u => u.email).join(', ')}`
    )
    console.error('  Mova-os para outro workspace antes de limpar. Nada foi removido.')
    process.exit(1)
  }

  const remainingFiles = await prisma.documentFile.count({ where: { workspaceId: { in: workspaceIds } } })

  if (remainingFiles || (await prisma.documentFolder.count({ where: { workspaceId: { in: workspaceIds } } }))) {
    if (await isAppUp()) {
      console.log('Excluindo documentos [MOCK] pela API (remove também os arquivos do storage)...')
      await deleteDocumentsViaApi(await login(MOCK_USERS.superAdmin.email), workspaces)
    } else {
      console.log('App fora do ar: removendo arquivos do storage local, se existir neste host...')

      const leftovers = await removeLocalStorageDirs(workspaces)

      if (leftovers.length) {
        console.log('  Storage não encontrado neste host (provavelmente dentro do container). Remova com:')

        for (const id of leftovers) console.log(`    docker compose exec app rm -rf /app/storage/${id}`)
      }
    }
  }

  const audit = await prisma.auditLog.deleteMany({
    where: { OR: [{ tenantId: { in: workspaceIds } }, { userId: { in: mockUserIds } }] }
  })

  const notifications = await prisma.notification.deleteMany({
    where: { OR: [{ workspaceId: { in: workspaceIds } }, { createdById: { in: mockUserIds } }] }
  })

  // Usuários antes dos workspaces (o convidado e o superAdmin [MOCK] não pertencem a nenhum)
  const users = await prisma.user.deleteMany({ where: { email: { in: mockEmails } } })

  await prisma.customRole.deleteMany({ where: { name: MOCK_CUSTOM_ROLE_NAME } })

  const deletedWorkspaces = await prisma.workspace.deleteMany({ where: { slug: { in: mockSlugs } } })

  console.log(
    `\n✔ Limpeza concluída: ${deletedWorkspaces.count} workspaces, ${users.count} usuários, ` +
      `${audit.count} registros de auditoria e ${notifications.count} notificações [MOCK] removidos.`
  )
}

// ── Execução ────────────────────────────────

async function main() {
  if (isClean) {
    await clean()

    return
  }

  console.log('Criando base [MOCK] (workspaces, função e usuários)...')

  const { workspaces } = await ensureBaseData()
  const workspaceIds = Object.values(workspaces).map(ws => ws.id)
  const existing = await prisma.documentFolder.count({ where: { workspaceId: { in: workspaceIds } } })

  if (!(await isAppUp())) {
    console.error(`\n✖ A aplicação não responde em ${BASE_URL}/api/health. Suba a stack e rode de novo.`)
    console.error('  (usuários e workspaces [MOCK] já foram criados; faltam os documentos, que passam pela API)')
    process.exit(1)
  }

  const session = await login(MOCK_USERS.superAdmin.email)

  if (existing && !isReset) {
    console.log(`\nDocumentos [MOCK] já existem (${existing} pastas). Nada foi duplicado.`)
    console.log('Use `pnpm documents:mock --reset` para recriá-los do zero.')
  } else {
    if (existing) {
      console.log('Removendo documentos [MOCK] anteriores (--reset)...')
      await deleteDocumentsViaApi(session, Object.values(workspaces))
    }

    console.log('Criando pastas e arquivos via API...')

    const { folderCount, fileCount } = await seedDocuments(session, workspaces)

    console.log(`  ${folderCount} pastas e ${fileCount} arquivos criados.`)
  }

  await ensureHtmlTemplates(session, workspaces)
  await ensureHtmlDocuments(session, workspaces)

  // Dentro do serviço `tools` a app é "app:3000"; no navegador do host é localhost
  const browserUrl = BASE_URL.replace('//app:', '//localhost:')

  console.log(`\nAcesse ${browserUrl}/br/documents com (senha de todos: ${MOCK_PASSWORD}):`)
  console.table(
    Object.entries(MOCK_USERS).map(([key, user]) => ({
      perfil: key,
      email: user.email,
      role: user.role,
      workspace: user.workspace
        ? MOCK_WORKSPACES[user.workspace].name
        : key === 'convidado'
          ? '(convidado do [MOCK] Privado)'
          : '—'
    }))
  )
}

main()
  .catch(error => {
    console.error(`\n✖ ${error.message}`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
