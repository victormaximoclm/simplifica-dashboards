// Smoke test de API do módulo de Documentos — SOMENTE ambiente local, contra a app rodando.
//
//   pnpm documents:smoke                    (verifica blobs no disco via `docker compose exec app`)
//   pnpm documents:smoke --storage=local (app rodando no host; usa STORAGE_DIR ou ./storage)
//   pnpm documents:smoke --storage=skip  (não verifica o disco)
//
// Pré-requisito: `pnpm documents:mock`. Tudo o que o teste cria fica em pastas "[SMOKE] <id>",
// removidas no final.
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import prismaPkg from '@prisma/client'

import {
  MOCK_USERS,
  MOCK_WORKSPACES,
  api,
  assertLocalEnvironment,
  createFolder,
  isAppUp,
  login,
  makeLargeZip,
  makePdf,
  makePng,
  makeSampleFiles,
  makeTxt,
  makeZip,
  sha256,
  uploadFiles
} from './lib.mjs'

assertLocalEnvironment({ needDatabase: true, needApp: true })

const { PrismaClient } = prismaPkg
const prisma = new PrismaClient()

// --storage=... > DOCS_DEV_STORAGE_MODE (o serviço `tools` usa "local" com o volume montado) > docker
const storageMode = (
  process.argv.find(arg => arg.startsWith('--storage=')) || `--storage=${process.env.DOCS_DEV_STORAGE_MODE || 'docker'}`
).split('=')[1]

const runId = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const startedAt = new Date()
const maxMb = Math.min(Math.floor(Number(process.env.DOCUMENTS_MAX_FILE_SIZE_MB)) || 25, 50)
const MB = 1024 * 1024

const EXPECTED_MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  zip: 'application/zip'
}

const PREVIEWABLE = ['pdf', 'png', 'jpg', 'jpeg', 'webp']

// ── Registro de resultados ──────────────────

const results = []
let group = ''

const section = name => {
  group = name
  console.log(`\n▶ ${name}`)
}

function record(name, ok, detail = '') {
  results.push({ grupo: group, teste: name, resultado: ok ? 'PASS' : 'FAIL', detalhe: ok ? '' : detail })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  → ${detail}`}`)
}

async function test(name, fn) {
  try {
    const outcome = await fn()

    if (outcome === true || outcome === false) record(name, outcome)
    else record(name, !!outcome?.ok, outcome?.detail)
  } catch (error) {
    record(name, false, error.message)
  }
}

const describe = res => `HTTP ${res.status} ${res.body ? JSON.stringify(res.body).slice(0, 160) : ''}`

const status = (res, expected) => ({
  ok: res.status === expected,
  detail: `esperado ${expected}, recebido ${describe(res)}`
})

// Sem sessão: a rota responde 401 ou o middleware redireciona para /login antes dela
const isUnauthenticated = res =>
  res.status === 401 || (res.status >= 300 && res.status < 400 && /\/login/.test(res.headers.get('location') || ''))

// ── Storage (disco) ─────────────────────────

function blobExists(storageKey) {
  if (storageMode === 'skip') return null

  if (storageMode === 'local') {
    const root = path.resolve(process.env.STORAGE_DIR || 'storage')

    return fs.existsSync(path.join(root, ...storageKey.split('/')))
  }

  try {
    execFileSync('docker', ['compose', 'exec', '-T', 'app', 'test', '-f', `/app/storage/${storageKey}`], {
      stdio: 'ignore'
    })

    return true
  } catch (error) {
    if (error.status === 1) return false
    throw new Error(
      `não foi possível checar o storage via docker (${error.message}); use --storage=local ou --storage=skip`
    )
  }
}

function countBlobs(workspaceId) {
  if (storageMode === 'skip') return null

  if (storageMode === 'local') {
    const dir = path.join(path.resolve(process.env.STORAGE_DIR || 'storage'), workspaceId)

    return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0
  }

  const out = execFileSync('docker', [
    'compose',
    'exec',
    '-T',
    'app',
    'sh',
    '-c',
    `ls /app/storage/${workspaceId} 2>/dev/null | wc -l`
  ])

  return Number(String(out).trim())
}

// ── Preparação ──────────────────────────────

async function loadFixtures() {
  const workspaces = {}

  for (const [key, ws] of Object.entries(MOCK_WORKSPACES)) {
    workspaces[key] = await prisma.workspace.findUnique({ where: { slug: ws.slug } })

    if (!workspaces[key]) throw new Error(`Workspace ${ws.name} não existe. Rode \`pnpm documents:mock\` antes.`)
  }

  const fileIn = async (workspaceKey, name) => {
    const file = await prisma.documentFile.findFirst({ where: { workspaceId: workspaces[workspaceKey].id, name } })

    if (!file)
      throw new Error(
        `Arquivo [MOCK] "${name}" não encontrado em ${workspaces[workspaceKey].name}. Rode \`pnpm documents:mock --reset\`.`
      )

    return file
  }

  const folderIn = async (workspaceKey, name) => {
    const folder = await prisma.documentFolder.findFirst({ where: { workspaceId: workspaces[workspaceKey].id, name } })

    if (!folder) throw new Error(`Pasta [MOCK] "${name}" não encontrada. Rode \`pnpm documents:mock --reset\`.`)

    return folder
  }

  return { workspaces, fileIn, folderIn }
}

async function main() {
  if (!(await isAppUp())) throw new Error('A aplicação não responde em /api/health. Suba a stack antes.')

  const { workspaces, fileIn, folderIn } = await loadFixtures()
  const { alfa, beta, privado } = workspaces

  console.log(`Smoke test ${runId} — storage: ${storageMode} — limite por arquivo: ${maxMb} MB`)
  console.log('Fazendo login com cada perfil (fluxo real do NextAuth)...')

  const s = {}

  for (const [key, user] of Object.entries(MOCK_USERS)) s[key] = await login(user.email)

  const sandboxes = {}

  for (const [key, ws] of Object.entries({ alfa, beta, privado })) {
    const res = await createFolder(s.superAdmin, { workspaceId: ws.id, name: `[SMOKE] ${runId}` })

    if (res.status !== 201) throw new Error(`não foi possível criar a sandbox em ${ws.name}: ${describe(res)}`)
    sandboxes[key] = res.body
  }

  // Alvos estáveis para as tentativas de escrita sem permissão
  const targets = {}

  for (const [key, ws] of Object.entries({ alfa, beta, privado })) {
    const folder = (await createFolder(s.superAdmin, { workspaceId: ws.id, parentId: sandboxes[key].id, name: 'Alvo' }))
      .body

    const file = (
      await uploadFiles(s.superAdmin, {
        workspaceId: ws.id,
        folderId: sandboxes[key].id,
        files: [{ name: 'alvo.pdf', type: 'application/pdf', buffer: makePdf('Alvo') }]
      })
    ).body.data[0]

    targets[key] = { folder, file, workspace: ws, sandbox: sandboxes[key] }
  }

  try {
    await runTests({ s, workspaces, sandboxes, targets, fileIn, folderIn })
  } finally {
    console.log('\nRemovendo sandboxes [SMOKE]...')

    for (const sandbox of Object.values(sandboxes))
      await api(s.superAdmin, 'DELETE', `/api/documents/folders/${sandbox.id}`)

    // Templates ficam no workspace (fora das sandboxes): remove os criados por esta execução
    const smokeTemplates = await prisma.documentHtmlTemplate.findMany({
      where: { name: { startsWith: `[SMOKE ${runId}]` } },
      select: { id: true }
    })

    for (const template of smokeTemplates)
      await api(s.superAdmin, 'DELETE', `/api/documents/html-templates/${template.id}`)
  }
}

// ── Testes ──────────────────────────────────

async function runTests({ s, workspaces, sandboxes, targets, fileIn, folderIn }) {
  const { alfa, beta, privado } = workspaces
  const alfaFile = await fileIn('alfa', 'Contrato de Prestação de Serviços.pdf')
  const alfaFolder = await folderIn('alfa', 'Contratos')
  const privadoFile = await fileIn('privado', 'Plano estratégico.pdf')
  const sandboxAlfa = sandboxes.alfa.id

  const upload = (session, workspaceId, folderId, files) => uploadFiles(session, { workspaceId, folderId, files })
  const txt = (name, content = name) => ({ name, type: 'text/plain', buffer: makeTxt(content) })

  // 1. Sem sessão ──────────────────────────
  section('Sem sessão')

  for (const [label, method, route] of [
    ['listar', 'GET', `/api/documents?workspaceId=${alfa.id}`],
    ['criar pasta', 'POST', '/api/documents/folders'],
    ['baixar', 'GET', `/api/documents/files/${alfaFile.id}/download`],
    ['excluir', 'DELETE', `/api/documents/files/${alfaFile.id}`]
  ]) {
    await test(`${label} sem sessão → 401 (ou redirect do middleware para /login)`, async () => {
      const res = await api(null, method, route, method === 'POST' ? { json: { name: 'x', workspaceId: alfa.id } } : {})
      const redirectToLogin = res.status >= 300 && res.status < 400 && /\/login/.test(res.headers.get('location') || '')

      return { ok: res.status === 401 || redirectToLogin, detail: describe(res) }
    })
  }

  // 2. Matriz perfil × ação ────────────────
  section('Perfis: superAdmin e subAdmin escrevem')

  for (const profile of ['superAdmin', 'subAdmin']) {
    const session = s[profile]
    let folderId
    let fileId

    await test(`${profile}: criar pasta → 201`, async () => {
      const res = await createFolder(session, { workspaceId: alfa.id, parentId: sandboxAlfa, name: `Pasta ${profile}` })

      folderId = res.body?.id

      return status(res, 201)
    })
    await test(`${profile}: enviar arquivo → 201`, async () => {
      const res = await upload(session, alfa.id, sandboxAlfa, [txt(`${profile}.txt`)])

      fileId = res.body?.data?.[0]?.id

      return status(res, 201)
    })
    await test(`${profile}: renomear pasta → 200`, async () =>
      status(
        await api(session, 'PATCH', `/api/documents/folders/${folderId}`, { json: { name: `Pasta ${profile} 2` } }),
        200
      ))
    await test(`${profile}: renomear arquivo → 200`, async () =>
      status(
        await api(session, 'PATCH', `/api/documents/files/${fileId}`, { json: { name: `${profile} renomeado` } }),
        200
      ))
    await test(`${profile}: mover arquivo → 200`, async () =>
      status(
        await api(session, 'POST', `/api/documents/files/${fileId}/move`, { json: { targetFolderId: folderId } }),
        200
      ))
    await test(`${profile}: mover pasta → 200`, async () =>
      status(
        await api(session, 'POST', `/api/documents/folders/${folderId}/move`, {
          json: { targetFolderId: targets.alfa.folder.id }
        }),
        200
      ))
    await test(`${profile}: excluir arquivo → 200`, async () =>
      status(await api(session, 'DELETE', `/api/documents/files/${fileId}`), 200))
    await test(`${profile}: excluir pasta → 200`, async () =>
      status(await api(session, 'DELETE', `/api/documents/folders/${folderId}`), 200))
    await test(`${profile}: listagem informa permissões de escrita`, async () => {
      const res = await api(session, 'GET', `/api/documents?workspaceId=${alfa.id}`)
      const p = res.body?.permissions

      return { ok: p?.canCreate && p?.canEdit && p?.canDelete, detail: JSON.stringify(p) }
    })
  }

  await test('superAdmin cria no [MOCK] Privado → 201', async () => {
    const res = await createFolder(s.superAdmin, {
      workspaceId: privado.id,
      parentId: sandboxes.privado.id,
      name: 'Do superAdmin'
    })

    return status(res, 201)
  })
  await test('subAdmin (não convidado) cria no [MOCK] Privado → 403', async () =>
    status(
      await createFolder(s.subAdmin, { workspaceId: privado.id, parentId: sandboxes.privado.id, name: 'Não deveria' }),
      403
    ))

  section('Perfis: admin, user e convidado só leem (403 em toda mutação)')

  const readers = [
    ['adminAlfa', 'alfa'],
    ['userAlfa', 'alfa'],
    ['adminBeta', 'beta'],
    ['userBeta', 'beta'],
    ['convidado', 'privado']
  ]

  for (const [profile, wsKey] of readers) {
    const session = s[profile]
    const { folder, file, workspace, sandbox } = targets[wsKey]

    const mutations = [
      ['POST pasta', () => createFolder(session, { workspaceId: workspace.id, parentId: sandbox.id, name: 'x' })],
      ['POST arquivo', () => upload(session, workspace.id, sandbox.id, [txt('x.txt')])],
      ['PATCH pasta', () => api(session, 'PATCH', `/api/documents/folders/${folder.id}`, { json: { name: 'x' } })],
      ['PATCH arquivo', () => api(session, 'PATCH', `/api/documents/files/${file.id}`, { json: { name: 'x' } })],
      [
        'mover pasta',
        () => api(session, 'POST', `/api/documents/folders/${folder.id}/move`, { json: { targetFolderId: null } })
      ],
      [
        'mover arquivo',
        () => api(session, 'POST', `/api/documents/files/${file.id}/move`, { json: { targetFolderId: null } })
      ],
      ['DELETE pasta', () => api(session, 'DELETE', `/api/documents/folders/${folder.id}`)],
      ['DELETE arquivo', () => api(session, 'DELETE', `/api/documents/files/${file.id}`)]
    ]

    for (const [label, call] of mutations)
      await test(`${profile}: ${label} → 403`, async () => status(await call(), 403))

    await test(`${profile}: itens continuam intactos no banco`, async () => {
      const [f, d] = await Promise.all([
        prisma.documentFolder.findUnique({ where: { id: folder.id } }),
        prisma.documentFile.findUnique({ where: { id: file.id } })
      ])

      return {
        ok: f?.name === 'Alvo' && f?.parentId === sandbox.id && d?.name === 'alvo.pdf',
        detail: `${f?.name}/${d?.name}`
      }
    })
    await test(`${profile}: lista o próprio workspace → 200 sem permissões de escrita`, async () => {
      const res = await api(session, 'GET', `/api/documents?workspaceId=${workspace.id}&folderId=${sandbox.id}`)
      const p = res.body?.permissions
      const hasFile = res.body?.data?.some(item => item.id === file.id)

      return {
        ok: res.status === 200 && hasFile && !p?.canCreate && !p?.canEdit && !p?.canDelete,
        detail: describe(res)
      }
    })
    await test(`${profile}: baixa → 200 e conteúdo idêntico`, async () => {
      const res = await api(session, 'GET', `/api/documents/files/${file.id}/download`)

      return { ok: res.status === 200 && sha256(res.buffer) === sha256(makePdf('Alvo')), detail: describe(res) }
    })
    await test(`${profile}: visualiza PDF → 200 inline`, async () => {
      const res = await api(session, 'GET', `/api/documents/files/${file.id}/preview`)

      return {
        ok: res.status === 200 && /^inline/.test(res.headers.get('content-disposition') || ''),
        detail: describe(res)
      }
    })
  }

  await test('convidado sem workspaceId cai no [MOCK] Privado', async () => {
    const res = await api(s.convidado, 'GET', '/api/documents')

    return {
      ok: res.status === 200 && res.body?.workspace?.id === privado.id,
      detail: JSON.stringify(res.body?.workspace)
    }
  })

  // 3. Isolamento ──────────────────────────
  section('Isolamento de workspace')

  const userBeta = s.userBeta
  const leaked = res => res.buffer.length > 0 && sha256(res.buffer) === sha256(makeSampleFiles()[0].buffer)

  for (const [label, method, route, json] of [
    ['listar Alfa', 'GET', `/api/documents?workspaceId=${alfa.id}`],
    ['árvore de pastas do Alfa', 'GET', `/api/documents/folders?workspaceId=${alfa.id}`],
    ['metadados de arquivo do Alfa', 'GET', `/api/documents/files/${alfaFile.id}`],
    ['pasta do Alfa (contagem)', 'GET', `/api/documents/folders/${alfaFolder.id}`],
    ['baixar arquivo do Alfa', 'GET', `/api/documents/files/${alfaFile.id}/download`],
    ['visualizar arquivo do Alfa', 'GET', `/api/documents/files/${alfaFile.id}/preview`],
    ['renomear arquivo do Alfa', 'PATCH', `/api/documents/files/${alfaFile.id}`, { name: 'hack' }],
    ['excluir arquivo do Alfa', 'DELETE', `/api/documents/files/${alfaFile.id}`]
  ]) {
    await test(`userBeta: ${label} → 403/404 sem vazar conteúdo`, async () => {
      const res = await api(userBeta, method, route, json ? { json } : {})

      return { ok: [403, 404].includes(res.status) && !leaked(res), detail: describe(res) }
    })
  }

  await test('userBeta: pasta do Alfa dentro do workspace Beta → 404', async () =>
    status(await api(userBeta, 'GET', `/api/documents?workspaceId=${beta.id}&folderId=${alfaFolder.id}`), 404))
  await test('adminAlfa: listar [MOCK] Privado (não convidado) → 403', async () =>
    status(await api(s.adminAlfa, 'GET', `/api/documents?workspaceId=${privado.id}`), 403))
  await test('adminAlfa: baixar arquivo do [MOCK] Privado → 403', async () =>
    status(await api(s.adminAlfa, 'GET', `/api/documents/files/${privadoFile.id}/download`), 403))
  await test('subAdmin (não convidado): listar [MOCK] Privado → 403', async () =>
    status(await api(s.subAdmin, 'GET', `/api/documents?workspaceId=${privado.id}`), 403))
  await test('superAdmin: upload no Beta apontando pasta do Alfa → 404', async () =>
    status(await upload(s.superAdmin, beta.id, alfaFolder.id, [txt('cruzado.txt')]), 404))
  await test('superAdmin: mover arquivo do Alfa para pasta do Beta → 404', async () =>
    status(
      await api(s.superAdmin, 'POST', `/api/documents/files/${targets.alfa.file.id}/move`, {
        json: { targetFolderId: targets.beta.folder.id }
      }),
      404
    ))

  // 4. Upload ──────────────────────────────
  section('Upload')

  const uploadFolder = (
    await createFolder(s.superAdmin, { workspaceId: alfa.id, parentId: sandboxAlfa, name: 'Uploads' })
  ).body.id

  const up = files => upload(s.superAdmin, alfa.id, uploadFolder, files)
  const big20 = makeLargeZip(20 * MB, 20)
  let big20Id

  await test('20 MB → 201', async () => {
    const res = await up([{ name: 'grande-20mb.zip', type: 'application/zip', buffer: big20 }])

    big20Id = res.body?.data?.[0]?.id

    return status(res, 201)
  })
  await test('15 MB → 201 (prova que proxyClientMaxBodySize > 10 MB está aplicado)', async () =>
    status(await up([{ name: 'medio-15mb.zip', type: 'application/zip', buffer: makeLargeZip(15 * MB, 15) }]), 201))
  await test(`${maxMb + 1} MB → 413 citando o limite real (${maxMb} MB)`, async () => {
    const res = await up([
      { name: 'acima-do-limite.zip', type: 'application/zip', buffer: makeLargeZip((maxMb + 1) * MB, 26) }
    ])

    return { ok: res.status === 413 && res.body?.message?.includes(`${maxMb} MB`), detail: describe(res) }
  })

  const rejected = [
    [
      'HTML renomeado para .pdf',
      { name: 'falso.pdf', type: 'application/pdf', buffer: Buffer.from('<html><script>alert(1)</script></html>') }
    ],
    [
      '.svg',
      { name: 'imagem.svg', type: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') }
    ],
    ['.exe', { name: 'programa.exe', type: 'application/x-msdownload', buffer: Buffer.from('MZ\x90\x00') }],
    ['.html', { name: 'pagina.html', type: 'text/html', buffer: Buffer.from('<html></html>') }],
    ['PDF com extensão .png', { name: 'disfarcado.png', type: 'image/png', buffer: makePdf('disfarcado') }],
    ['PDF vazio', { name: 'vazio.pdf', type: 'application/pdf', buffer: Buffer.alloc(0) }]
  ]

  for (const [label, file] of rejected) await test(`${label} → 415`, async () => status(await up([file]), 415))

  await test('TXT vazio → 201 (texto vazio é válido)', async () => status(await up([txt('vazio.txt', '')]), 201))

  const nameCases = [
    ['nome com "/" vira só o último segmento', 'pasta/sub/barra.txt', name => name === 'barra.txt'],
    ['nome com "\\" vira só o último segmento', 'pasta\\invertida.txt', name => name === 'invertida.txt'],
    ['nome com byte nulo é limpo', 'nu\u0000lo.txt', name => name === 'nulo.txt'],
    [
      'nome com 300 caracteres é cortado em 255 mantendo a extensão',
      `${'x'.repeat(300)}.txt`,
      name => name.length === 255 && name.endsWith('.txt')
    ]
  ]

  for (const [label, rawName, isExpected] of nameCases) {
    await test(label, async () => {
      const res = await up([txt(rawName, 'conteudo')])
      const stored = res.body?.data?.[0]?.name

      // 400 também é aceitável se o parser de multipart recusar o nome antes da aplicação
      return {
        ok: (res.status === 201 && isExpected(stored)) || res.status === 400,
        detail: `${describe(res)} nome=${JSON.stringify(stored)}`
      }
    })
  }

  await test('nome ".." → 400', async () => status(await up([txt('..')]), 400))
  await test('MIME vazio com PNG válido → 201 e Content-Type da extensão', async () => {
    const res = await up([{ name: 'sem-mime.png', type: '', buffer: makePng(8, 8, 2) }])

    return { ok: res.status === 201 && res.body?.data?.[0]?.mimeType === 'image/png', detail: describe(res) }
  })
  await test('octet-stream com ZIP válido → 201 e Content-Type da extensão', async () => {
    const res = await up([
      { name: 'octeto.zip', type: 'application/octet-stream', buffer: makeZip([{ name: 'a.txt', data: 'a' }]) }
    ])

    return { ok: res.status === 201 && res.body?.data?.[0]?.mimeType === 'application/zip', detail: describe(res) }
  })
  await test('dois arquivos na mesma requisição → 201 com 2 itens', async () => {
    const res = await up([txt('lote-1.txt'), txt('lote-2.txt')])

    return { ok: res.status === 201 && res.body?.data?.length === 2, detail: describe(res) }
  })
  await test('nome duplicado → 409', async () => {
    await up([txt('Duplicado.txt')])

    return status(await up([txt('Duplicado.txt')]), 409)
  })
  await test('nome duplicado trocando maiúsculas/minúsculas → 409', async () =>
    status(await up([txt('DUPLICADO.TXT')]), 409))

  // 5. Pastas ──────────────────────────────
  section('Pastas')

  const mk = async (name, parentId = sandboxAlfa) =>
    (await createFolder(s.superAdmin, { workspaceId: alfa.id, parentId, name })).body?.id

  const move = (id, targetFolderId) =>
    api(s.superAdmin, 'POST', `/api/documents/folders/${id}/move`, { json: { targetFolderId } })

  const a = await mk('A')
  const b = await mk('B', a)

  await test('renomear pasta → 200', async () =>
    status(await api(s.superAdmin, 'PATCH', `/api/documents/folders/${a}`, { json: { name: 'A renomeada' } }), 200))
  await test('mover pasta para dentro dela mesma → 400', async () => status(await move(a, a), 400))
  await test('mover pasta para dentro de uma descendente → 400', async () => status(await move(a, b), 400))
  await test('mover subpasta para o nível acima → 200', async () => status(await move(b, sandboxAlfa), 200))
  await test('renomear para nome de pasta irmã → 409', async () =>
    status(await api(s.superAdmin, 'PATCH', `/api/documents/folders/${b}`, { json: { name: 'a renomeada' } }), 409))
  await test('pasta duplicada na subpasta → 409', async () => {
    await mk('Duplicada')

    return status(
      await createFolder(s.superAdmin, { workspaceId: alfa.id, parentId: sandboxAlfa, name: 'DUPLICADA' }),
      409
    )
  })
  await test('pasta duplicada na raiz → 409', async () =>
    status(await createFolder(s.superAdmin, { workspaceId: alfa.id, parentId: null, name: `[smoke] ${runId}` }), 409))

  const nivel10 = await folderIn('alfa', 'Nivel 10')
  const nivel9 = await folderIn('alfa', 'Nivel 9')
  const nivel8 = await folderIn('alfa', 'Nivel 8')

  await test('criar dentro do 10º nível → 400', async () =>
    status(await createFolder(s.superAdmin, { workspaceId: alfa.id, parentId: nivel10.id, name: 'Nivel 11' }), 400))

  const twoLevels = await mk('Dois níveis')

  await mk('Filho', twoLevels)
  await test('mover subárvore de 2 níveis para o nível 9 (ficaria com 11) → 400', async () =>
    status(await move(twoLevels, nivel9.id), 400))
  await test('mover subárvore de 2 níveis para o nível 8 (fica com 10) → 200', async () =>
    status(await move(twoLevels, nivel8.id), 200))
  await move(twoLevels, sandboxAlfa)

  await test('excluir pasta com conteúdo: contagem, resposta, banco e disco', async () => {
    const x = await mk('X')
    const y = await mk('Y', x)
    const z = await mk('Z', y)

    for (const [folderId, name] of [
      [x, 'x.txt'],
      [y, 'y.txt'],
      [z, 'z.txt']
    ])
      await upload(s.superAdmin, alfa.id, folderId, [txt(name)])

    const counts = (await api(s.superAdmin, 'GET', `/api/documents/folders/${x}`)).body?.counts

    const keys = (
      await prisma.documentFile.findMany({ where: { folderId: { in: [x, y, z] } }, select: { storageKey: true } })
    ).map(f => f.storageKey)

    const before = keys.map(blobExists)
    const res = await api(s.superAdmin, 'DELETE', `/api/documents/folders/${x}`)
    const orphanFolders = await prisma.documentFolder.count({ where: { id: { in: [x, y, z] } } })
    const orphanFiles = await prisma.documentFile.count({ where: { storageKey: { in: keys } } })
    const after = keys.map(blobExists)

    const problems = []

    if (counts?.folders !== 2 || counts?.files !== 3) problems.push(`contagem prévia ${JSON.stringify(counts)}`)
    if (res.status !== 200 || res.body?.deleted?.folders !== 3 || res.body?.deleted?.files !== 3)
      problems.push(`resposta ${describe(res)}`)
    if (orphanFolders || orphanFiles) problems.push(`linhas órfãs: ${orphanFolders} pastas, ${orphanFiles} arquivos`)
    if (storageMode !== 'skip' && before.some(exists => !exists)) problems.push('blobs não existiam antes da exclusão')
    if (storageMode !== 'skip' && after.some(Boolean)) problems.push('blobs continuam no disco')

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  // 6. Concorrência ────────────────────────
  section('Concorrência (pg_advisory_xact_lock)')

  await test('10 criações simultâneas da mesma pasta → 1×201 e 9×409', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        createFolder(s.superAdmin, { workspaceId: alfa.id, parentId: sandboxAlfa, name: 'Concorrente' })
      )
    )

    const created = responses.filter(r => r.status === 201).length
    const conflicts = responses.filter(r => r.status === 409).length

    return {
      ok: created === 1 && conflicts === 9,
      detail: `201=${created} 409=${conflicts} outros=${responses.map(r => r.status).join(',')}`
    }
  })
  await test('10 uploads simultâneos com o mesmo nome → 1×201, 9×409 e nenhum blob sobrando', async () => {
    const blobsBefore = countBlobs(alfa.id)

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => upload(s.superAdmin, alfa.id, sandboxAlfa, [txt('Concorrente.txt')]))
    )

    const created = responses.filter(r => r.status === 201).length
    const conflicts = responses.filter(r => r.status === 409).length
    const rows = await prisma.documentFile.count({ where: { folderId: sandboxAlfa, name: 'Concorrente.txt' } })
    const blobsAfter = countBlobs(alfa.id)
    const blobDelta = blobsBefore === null ? 1 : blobsAfter - blobsBefore

    return {
      ok: created === 1 && conflicts === 9 && rows === 1 && blobDelta === 1,
      detail: `201=${created} 409=${conflicts} linhas=${rows} blobs novos=${blobDelta}`
    }
  })

  // 7. Download e preview ──────────────────
  section('Download e preview')

  for (const sample of makeSampleFiles()) {
    const ext = sample.name.split('.').pop().toLowerCase()
    const row = await fileIn('alfa', sample.name)

    await test(`${sample.name}: download com headers corretos e SHA-256 idêntico`, async () => {
      const res = await api(s.userAlfa, 'GET', `/api/documents/files/${row.id}/download`)
      const problems = []

      if (res.status !== 200) problems.push(describe(res))
      if (!/^attachment;/.test(res.headers.get('content-disposition') || ''))
        problems.push(`disposition=${res.headers.get('content-disposition')}`)
      if (res.headers.get('x-content-type-options') !== 'nosniff') problems.push('sem nosniff')
      if (res.headers.get('content-type') !== EXPECTED_MIME[ext])
        problems.push(`content-type=${res.headers.get('content-type')}`)
      if (sha256(res.buffer) !== sha256(sample.buffer)) problems.push('hash diferente')

      return { ok: !problems.length, detail: problems.join('; ') }
    })

    const previewable = PREVIEWABLE.includes(ext)

    await test(`${sample.name}: preview ${previewable ? '→ 200 inline + nosniff' : '→ 4xx'}`, async () => {
      const res = await api(s.userAlfa, 'GET', `/api/documents/files/${row.id}/preview`)

      if (!previewable) return { ok: res.status >= 400 && res.status < 500, detail: describe(res) }

      return {
        ok:
          res.status === 200 &&
          /^inline;/.test(res.headers.get('content-disposition') || '') &&
          res.headers.get('x-content-type-options') === 'nosniff' &&
          sha256(res.buffer) === sha256(sample.buffer),
        detail: `${describe(res)} disposition=${res.headers.get('content-disposition')}`
      }
    })
  }

  await test('arquivo de 20 MB: download íntegro (SHA-256)', async () => {
    const res = await api(s.adminAlfa, 'GET', `/api/documents/files/${big20Id}/download`)

    return {
      ok: res.status === 200 && sha256(res.buffer) === sha256(big20),
      detail: `${describe(res)} bytes=${res.buffer.length}`
    }
  })

  for (const [label, id] of [
    ['id com path traversal', encodeURIComponent('../../etc/passwd')],
    ['id de uma pasta', alfaFolder.id],
    ['id inexistente', 'cm000000000000000000000000']
  ]) {
    await test(`download com ${label} → 4xx`, async () => {
      const res = await api(s.superAdmin, 'GET', `/api/documents/files/${id}/download`)

      return { ok: res.status >= 400 && res.status < 500, detail: describe(res) }
    })
  }

  await test('PATCH com storageKey malicioso é ignorado', async () => {
    const before = await prisma.documentFile.findUnique({ where: { id: targets.alfa.file.id } })

    const res = await api(s.superAdmin, 'PATCH', `/api/documents/files/${before.id}`, {
      json: { name: 'alvo-2', storageKey: '../../etc/passwd' }
    })

    const after = await prisma.documentFile.findUnique({ where: { id: before.id } })

    return {
      ok: res.status === 200 && after.storageKey === before.storageKey && !('storageKey' in (res.body || {})),
      detail: describe(res)
    }
  })
  await test('respostas da API nunca expõem storageKey', async () => {
    const res = await api(s.superAdmin, 'GET', `/api/documents?workspaceId=${alfa.id}&folderId=${uploadFolder}`)

    return { ok: res.status === 200 && !JSON.stringify(res.body).includes('storageKey'), detail: describe(res) }
  })

  // 7b. Pré-visualização estruturada ───────
  section('Pré-visualização estruturada (/preview-data)')

  const previewData = (session, id) => api(session, 'GET', `/api/documents/files/${id}/preview-data`)

  const previewExpectations = {
    'Leia-me.txt': body => body.kind === 'text' && body.text.includes('Acentuação: ção'),
    'Clientes São Paulo.csv': body =>
      body.kind === 'table' && body.sheets[0].rows[1]?.[0] === 'João' && body.sheets[0].rows[1]?.[1] === 'São Paulo',
    'Política de Férias.docx': body =>
      body.kind === 'document' && body.blocks.some(block => block.runs?.some(run => run.text === 'Política de Férias')),
    'Orçamento 2025.xlsx': body =>
      body.kind === 'table' &&
      body.sheets[0].name === 'Planilha1' &&
      body.sheets[0].rows[1]?.[0] === 'Licenças' &&
      body.sheets[0].rows[2]?.[1] === '3450.5',
    'Apresentação Comercial.pptx': body =>
      body.kind === 'slides' && body.slides[0]?.paragraphs.includes('Apresentação Comercial [MOCK]'),
    'Pacote de anexos.zip': body =>
      body.kind === 'archive' && body.total === 2 && body.entries.some(entry => entry.name === 'anexo-1.txt')
  }

  for (const [name, isValid] of Object.entries(previewExpectations)) {
    const row = await fileIn('alfa', name)

    await test(`${name}: pré-visualização com o conteúdo correto`, async () => {
      const res = await previewData(s.userAlfa, row.id)

      return {
        ok: res.status === 200 && !!res.headers.get('x-request-id') && isValid(res.body),
        detail: describe(res)
      }
    })
  }

  for (const name of ['Contrato de Prestação de Serviços.pdf', 'Logo Simpla.png']) {
    const row = await fileIn('alfa', name)

    await test(`${name}: preview-data → 415 (exibido inline pela rota /preview)`, async () =>
      status(await previewData(s.userAlfa, row.id), 415))
  }

  await test('listagem indica o modo de pré-visualização de cada arquivo', async () => {
    const res = await api(
      s.userAlfa,
      'GET',
      `/api/documents?workspaceId=${alfa.id}&folderId=${(await folderIn('alfa', 'Financeiro')).id}`
    )

    const files = (res.body?.data ?? []).filter(item => item.kind === 'file')

    return {
      ok: files.length > 0 && files.every(file => file.previewable === true && file.inlinePreview === false),
      detail: JSON.stringify(files.map(file => [file.name, file.previewable, file.inlinePreview]))
    }
  })
  await test('userBeta: preview-data de arquivo do Alfa → 403 sem conteúdo', async () => {
    const res = await previewData(s.userBeta, (await fileIn('alfa', 'Política de Férias.docx')).id)

    return { ok: res.status === 403 && !res.body?.kind, detail: describe(res) }
  })

  const uploadOne = async file => (await up([file])).body?.data?.[0]

  await test('zip bomb (docx com 60 MB descompactados) → 422 e a app continua no ar', async () => {
    const bomb = await uploadOne({
      name: 'bomba.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: makeZip([
        { name: '[Content_Types].xml', data: '<Types/>' },
        { name: 'word/document.xml', data: Buffer.alloc(60 * MB, 0x20), deflate: true }
      ])
    })

    const res = await previewData(s.superAdmin, bomb.id)
    const health = await api(null, 'GET', '/api/health')

    return {
      ok: res.status === 422 && /grande demais/.test(res.body?.message || '') && health.status === 200,
      detail: `${describe(res)} health=${health.status}`
    }
  })
  await test('arquivo OOXML corrompido → 422 com mensagem', async () => {
    const broken = await uploadOne({
      name: 'corrompido.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('lixo que não é um zip válido')])
    })

    const res = await previewData(s.superAdmin, broken.id)

    return { ok: res.status === 422 && !!res.body?.message, detail: describe(res) }
  })
  await test('CSV em Latin-1 (Excel em português) é decodificado corretamente', async () => {
    const latin = await uploadOne({
      name: 'latin1.csv',
      type: 'text/csv',
      buffer: Buffer.from('nome;cidade\nJoão;São Paulo\n', 'latin1')
    })

    const res = await previewData(s.superAdmin, latin.id)

    return { ok: res.status === 200 && res.body?.sheets?.[0]?.rows?.[1]?.[0] === 'João', detail: describe(res) }
  })
  await test('CSV com aspas e ";" dentro dos campos', async () => {
    const quoted = await uploadOne({
      name: 'aspas.csv',
      type: 'text/csv',
      buffer: Buffer.from('"Nome";"Obs"\n"Ana";"texto; com ponto e vírgula"\n"Bia";"tem ""aspas"""\n', 'utf8')
    })

    const rows = (await previewData(s.superAdmin, quoted.id)).body?.sheets?.[0]?.rows ?? []

    return {
      ok: rows[1]?.[1] === 'texto; com ponto e vírgula' && rows[2]?.[1] === 'tem "aspas"',
      detail: JSON.stringify(rows)
    }
  })

  // 8. Auditoria e notificação ─────────────
  section('Auditoria e notificação')

  const expectedActions = [
    'DOCUMENT_FOLDER_CREATE',
    'DOCUMENT_FOLDER_RENAME',
    'DOCUMENT_FOLDER_MOVE',
    'DOCUMENT_FOLDER_DELETE',
    'DOCUMENT_FILE_UPLOAD',
    'DOCUMENT_FILE_RENAME',
    'DOCUMENT_FILE_MOVE',
    'DOCUMENT_FILE_DELETE',
    'DOCUMENT_FILE_VIEW',
    'DOCUMENT_FILE_DOWNLOAD'
  ]

  await test('AuditLog tem todas as ações DOCUMENT_* desta execução', async () => {
    const rows = await prisma.auditLog.groupBy({
      by: ['action'],
      where: { action: { startsWith: 'DOCUMENT_' }, createdAt: { gte: startedAt } },
      _count: true
    })

    const found = rows.map(row => row.action)
    const missing = expectedActions.filter(action => !found.includes(action))

    return { ok: !missing.length, detail: `faltando: ${missing.join(', ')}` }
  })
  await test('exclusão de pasta registra a contagem no AuditLog', async () => {
    const row = await prisma.auditLog.findFirst({
      where: {
        action: 'DOCUMENT_FOLDER_DELETE',
        createdAt: { gte: startedAt },
        metadata: { path: ['deletedFiles'], equals: 3 }
      }
    })

    return { ok: !!row, detail: 'nenhum DOCUMENT_FOLDER_DELETE com deletedFiles=3' }
  })
  await test('painel "Audit de Ações" lista DOCUMENT_* (superAdmin)', async () => {
    const res = await api(s.superAdmin, 'GET', '/api/apps/audit-logs/admin?q=DOCUMENT_&pageSize=100')

    return {
      ok: res.status === 200 && res.body?.items?.some(item => item.action?.startsWith('DOCUMENT_')),
      detail: describe(res)
    }
  })
  await test('painel de auditoria → 403 para admin', async () =>
    status(await api(s.adminAlfa, 'GET', '/api/apps/audit-logs/admin'), 403))

  // Quem abriu / baixou: arquivos novos desta execução (a janela anti-duplicação é de 15 min)
  const accessName = `Acesso ${runId}`

  const [accessPdf, accessTxt] = (
    await uploadFiles(s.superAdmin, {
      workspaceId: alfa.id,
      folderId: sandboxes.alfa.id,
      files: [
        { name: `${accessName}.pdf`, type: 'application/pdf', buffer: makePdf('Acesso') },
        { name: `${accessName}.txt`, type: 'text/plain', buffer: Buffer.from('conteúdo de teste') }
      ]
    })
  ).body.data

  const userAlfaId = (await prisma.user.findUnique({ where: { email: MOCK_USERS.userAlfa.email } })).id
  const userBetaId = (await prisma.user.findUnique({ where: { email: MOCK_USERS.userBeta.email } })).id

  const accessLogs = (fileId, action, userId) =>
    prisma.auditLog.count({ where: { entityId: fileId, action, ...(userId && { userId }) } })

  await test('abrir PDF/imagem registra DOCUMENT_FILE_VIEW uma vez (reabrir em seguida não duplica)', async () => {
    const results = []

    for (let i = 0; i < 3; i++)
      results.push(await api(s.userAlfa, 'GET', `/api/documents/files/${accessPdf.id}/preview`))

    const count = await accessLogs(accessPdf.id, 'DOCUMENT_FILE_VIEW', userAlfaId)

    return { ok: results.every(res => res.status === 200) && count === 1, detail: `views=${count}` }
  })
  await test('abrir txt/docx/planilha (preview-data) registra DOCUMENT_FILE_VIEW', async () => {
    const res = await api(s.userAlfa, 'GET', `/api/documents/files/${accessTxt.id}/preview-data`)
    const count = await accessLogs(accessTxt.id, 'DOCUMENT_FILE_VIEW', userAlfaId)

    return { ok: res.status === 200 && count === 1, detail: `HTTP ${res.status} views=${count}` }
  })
  await test('baixar registra DOCUMENT_FILE_DOWNLOAD (separado da visualização)', async () => {
    const res = await api(s.userAlfa, 'GET', `/api/documents/files/${accessPdf.id}/download`)
    const count = await accessLogs(accessPdf.id, 'DOCUMENT_FILE_DOWNLOAD', userAlfaId)

    return { ok: res.status === 200 && count === 1, detail: `HTTP ${res.status} downloads=${count}` }
  })
  await test('outro usuário abrindo o mesmo arquivo ganha o próprio registro', async () => {
    await api(s.subAdmin, 'GET', `/api/documents/files/${accessPdf.id}/preview`)
    const total = await accessLogs(accessPdf.id, 'DOCUMENT_FILE_VIEW')

    return { ok: total === 2, detail: `views=${total}` }
  })
  await test('acesso negado (userBeta) não gera log de visualização/download', async () => {
    const results = await Promise.all([
      api(s.userBeta, 'GET', `/api/documents/files/${accessPdf.id}/preview`),
      api(s.userBeta, 'GET', `/api/documents/files/${accessPdf.id}/download`)
    ])

    const count = await prisma.auditLog.count({ where: { entityId: accessPdf.id, userId: userBetaId } })

    return {
      ok: results.every(res => res.status === 403) && count === 0,
      detail: `${results.map(res => res.status).join(',')} logs=${count}`
    }
  })
  await test('painel de Logs: busca pelo nome do documento mostra quem abriu e baixou', async () => {
    const res = await api(
      s.superAdmin,
      'GET',
      `/api/apps/audit-logs/admin?q=${encodeURIComponent(accessName)}&pageSize=100`
    )

    const items = res.body?.items ?? []

    const has = action =>
      items.some(
        item =>
          item.action === action &&
          item.user?.email === MOCK_USERS.userAlfa.email &&
          item.resourceLabel === `${accessName}.pdf` &&
          item.tenant?.id === alfa.id
      )

    return {
      ok: res.status === 200 && has('DOCUMENT_FILE_VIEW') && has('DOCUMENT_FILE_DOWNLOAD'),
      detail: items
        .map(item => `${item.action}:${item.resourceLabel}`)
        .join(', ')
        .slice(0, 160)
    }
  })
  await test('painel de Logs: subAdmin também vê; arquivo excluído mantém o nome no log', async () => {
    await api(s.superAdmin, 'DELETE', `/api/documents/files/${accessPdf.id}`)

    const res = await api(
      s.subAdmin,
      'GET',
      `/api/apps/audit-logs/admin?q=${encodeURIComponent(accessName)}&pageSize=100`
    )

    const view = res.body?.items?.find(item => item.action === 'DOCUMENT_FILE_VIEW' && item.entityId === accessPdf.id)

    return {
      ok: res.status === 200 && view?.resourceLabel === `${accessName}.pdf`,
      detail: describe(res).slice(0, 120)
    }
  })
  await test('painel de Logs → 403 para user comum', async () =>
    status(await api(s.userAlfa, 'GET', '/api/apps/audit-logs/admin'), 403))

  for (const [profile, shouldSee] of [
    ['superAdmin', true],
    ['subAdmin', true],
    ['adminAlfa', false],
    ['userAlfa', false],
    ['convidado', false]
  ]) {
    await test(`notificação de upload ${shouldSee ? 'visível' : 'invisível'} para ${profile}`, async () => {
      const res = await api(s[profile], 'GET', '/api/apps/notifications')
      const sees = Array.isArray(res.body) && res.body.some(n => n.type === 'document_uploaded')

      return { ok: res.status === 200 && sees === shouldSee, detail: `${describe(res).slice(0, 80)} vê=${sees}` }
    })
  }

  // 8b. Documentos HTML (editor + template) ─
  section('Documentos HTML (editor)')

  const htmlSandbox = sandboxes.alfa
  const docJson = (...content) => ({ type: 'doc', content })
  const para = value => ({ type: 'paragraph', content: [{ type: 'text', text: value }] })
  const createHtml = (session, body) => api(session, 'POST', '/api/documents/html', { json: body })
  const htmlBody = (title, content) => ({ workspaceId: alfa.id, folderId: htmlSandbox.id, title, content })

  const created = await createHtml(s.superAdmin, htmlBody('Comunicado smoke', docJson(para('Primeira versão'))))
  const htmlDoc = created.body?.data

  await test('superAdmin cria documento HTML → 201, .html, text/html, editável', async () => ({
    ok:
      created.status === 201 &&
      htmlDoc?.name === 'Comunicado smoke.html' &&
      htmlDoc?.mimeType === 'text/html' &&
      htmlDoc?.htmlEditable === true,
    detail: describe(created)
  }))
  await test('subAdmin cria documento HTML → 201', async () =>
    status(await createHtml(s.subAdmin, htmlBody('Doc do subAdmin', docJson(para('ok')))), 201))

  for (const profile of ['adminAlfa', 'userAlfa', 'convidado']) {
    await test(`${profile}: criar documento HTML → 403`, async () =>
      status(await createHtml(s[profile], htmlBody(`Proibido ${profile}`, docJson(para('x')))), 403))
    await test(`${profile}: editar documento HTML → 403`, async () =>
      status(
        await api(s[profile], 'PUT', `/api/documents/html/${htmlDoc?.id}`, {
          json: { title: 'x', content: docJson(para('x')) }
        }),
        403
      ))
  }

  await test('userAlfa (leitura) abre o conteúdo editável → 200', async () => {
    const res = await api(s.userAlfa, 'GET', `/api/documents/html/${htmlDoc?.id}`)

    return { ok: res.status === 200 && res.body?.title === 'Comunicado smoke', detail: describe(res) }
  })
  await test('userBeta: conteúdo de documento HTML do Alfa → 403', async () =>
    status(await api(s.userBeta, 'GET', `/api/documents/html/${htmlDoc?.id}`), 403))
  await test('sem sessão: criar documento HTML → 401/login', async () => {
    const res = await createHtml(null, htmlBody('Anônimo', docJson(para('x'))))

    return { ok: isUnauthenticated(res), detail: describe(res) }
  })

  await test('download traz o template Simplifica e CSP sandbox', async () => {
    const res = await api(s.userAlfa, 'GET', `/api/documents/files/${htmlDoc?.id}/download`)
    const html = res.buffer.toString('utf8')
    const csp = res.headers.get('content-security-policy') || ''

    return {
      ok:
        res.status === 200 &&
        (res.headers.get('content-type') || '').startsWith('text/html') &&
        /attachment/.test(res.headers.get('content-disposition') || '') &&
        csp.includes('sandbox') &&
        html.includes('<h1 class="doc-title">Comunicado smoke</h1>') &&
        html.includes('Primeira versão') &&
        html.includes('Documento gerado pela Simplifica'),
      detail: `HTTP ${res.status} csp=${csp.slice(0, 40)} len=${html.length}`
    }
  })

  // Conteúdo malicioso: tudo deve virar texto ou ser descartado
  const evil = await createHtml(
    s.superAdmin,
    htmlBody('<img src=x onerror=alert(1)>', {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }] },
        {
          type: 'paragraph',
          attrs: { textAlign: 'center;background:url(x)', onclick: 'alert(1)' },
          content: [
            {
              type: 'text',
              text: 'clique',
              marks: [
                { type: 'link', attrs: { href: 'javascript:alert(1)' } },
                { type: 'bold', attrs: { x: 1 } }
              ]
            }
          ]
        },
        { type: 'iframe', attrs: { src: 'https://evil.example' } },
        { type: 'heading', attrs: { level: '1 onclick=alert(1)' }, content: [{ type: 'text', text: 'Título' }] }
      ]
    })
  )

  await test('conteúdo malicioso é escapado/descartado no HTML gerado', async () => {
    const res = await api(s.superAdmin, 'GET', `/api/documents/files/${evil.body?.data?.id}/download`)
    const html = res.buffer.toString('utf8')
    const problems = []

    if (evil.status !== 201) problems.push(`criação ${evil.status}`)
    if (/<script/i.test(html)) problems.push('<script> no HTML')
    if (/javascript:/i.test(html)) problems.push('javascript: no HTML')

    // Texto escapado ("&lt;img onerror=...") é inofensivo; procura tags reais e atributos dentro delas
    if (/<(img|iframe)\b|<[^>]*\son\w+\s*=|url\(/i.test(html)) problems.push('tag/atributo perigoso no HTML')
    if (!html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')) problems.push('texto não foi escapado')
    if (!html.includes('<strong>clique</strong>')) problems.push('negrito perdido')

    return { ok: !problems.length, detail: problems.join('; ') || 'ok' }
  })
  await test('conteúdo malicioso também é limpo no JSON guardado', async () => {
    const res = await api(s.superAdmin, 'GET', `/api/documents/html/${evil.body?.data?.id}`)
    const json = JSON.stringify(res.body?.content ?? {})

    return {
      ok: res.status === 200 && !/javascript:|iframe|onclick|evil\.example|background/i.test(json),
      detail: json.slice(0, 160)
    }
  })

  await test('título vazio → 400 / conteúdo vazio → 400 / formato inválido → 400', async () => {
    const results = await Promise.all([
      createHtml(s.superAdmin, htmlBody('   ', docJson(para('x')))),
      createHtml(s.superAdmin, htmlBody('Vazio', docJson({ type: 'paragraph' }))),
      createHtml(s.superAdmin, htmlBody('Inválido', { type: 'nada' })),
      createHtml(s.superAdmin, htmlBody('Sem conteúdo', 'texto'))
    ])

    return { ok: results.every(res => res.status === 400), detail: results.map(res => res.status).join(',') }
  })
  await test('documento grande demais → 413', async () => {
    const huge = docJson(...Array.from({ length: 25000 }, () => para('x')))
    const res = await createHtml(s.superAdmin, htmlBody('Enorme', huge))

    return status(res, 413)
  })
  await test('mesmo título na mesma pasta → 409', async () =>
    status(await createHtml(s.superAdmin, htmlBody('Comunicado smoke', docJson(para('de novo')))), 409))
  await test('título com "/" vira nome de arquivo seguro', async () => {
    const res = await createHtml(s.superAdmin, htmlBody('RH/Política 2026', docJson(para('x'))))

    return { ok: res.status === 201 && res.body?.data?.name === 'RH-Política 2026.html', detail: describe(res) }
  })
  await test('pasta de outro workspace → 404', async () =>
    status(
      await createHtml(s.superAdmin, { ...htmlBody('Cruzado', docJson(para('x'))), folderId: targets.beta.folder.id }),
      404
    ))
  await test('upload direto de .html continua bloqueado → 415', async () => {
    const res = await uploadFiles(s.superAdmin, {
      workspaceId: alfa.id,
      folderId: htmlSandbox.id,
      files: [{ name: 'pagina.html', type: 'text/html', buffer: Buffer.from('<script>alert(1)</script>') }]
    })

    return status(res, 415)
  })

  const beforeUpdate = await prisma.documentFile.findUnique({ where: { id: htmlDoc?.id } })

  const updated = await api(s.subAdmin, 'PUT', `/api/documents/html/${htmlDoc?.id}`, {
    json: { title: 'Comunicado atualizado', content: docJson(para('Segunda versão')) }
  })

  const afterUpdate = await prisma.documentFile.findUnique({ where: { id: htmlDoc?.id } })

  await test('subAdmin edita: HTML regravado, nome do arquivo mantido', async () => {
    const res = await api(s.userAlfa, 'GET', `/api/documents/files/${htmlDoc?.id}/download`)
    const html = res.buffer.toString('utf8')

    return {
      ok:
        updated.status === 200 &&
        updated.body?.data?.name === 'Comunicado smoke.html' &&
        html.includes('Comunicado atualizado') &&
        html.includes('Segunda versão') &&
        !html.includes('Primeira versão'),
      detail: `${describe(updated).slice(0, 80)} len=${html.length}`
    }
  })
  await test('edição troca o blob e remove o anterior do storage', async () => {
    const oldExists = blobExists(beforeUpdate.storageKey)
    const newExists = blobExists(afterUpdate.storageKey)

    if (oldExists === null) return { ok: true, detail: 'storage=skip' }

    return {
      ok: beforeUpdate.storageKey !== afterUpdate.storageKey && !oldExists && newExists,
      detail: `antigo=${oldExists} novo=${newExists}`
    }
  })
  await test('edições simultâneas: cada uma troca exatamente o blob que substituiu', async () => {
    const blobsBefore = countBlobs(alfa.id)

    const results = await Promise.all(
      [1, 2, 3].map(n =>
        api(s.superAdmin, 'PUT', `/api/documents/html/${htmlDoc?.id}`, {
          json: { title: `Versão ${n}`, content: docJson(para(`Versão ${n}`)) }
        })
      )
    )

    const row = await prisma.documentFile.findUnique({ where: { id: htmlDoc?.id } })
    const blobsAfter = countBlobs(alfa.id)

    return {
      ok:
        results.every(res => res.status === 200) &&
        (blobsAfter === null || (blobExists(row.storageKey) && blobsAfter === blobsBefore)),
      detail: `status=${results.map(res => res.status).join(',')} blobs antes=${blobsBefore} depois=${blobsAfter}`
    }
  })
  await test('editar arquivo que não é documento HTML → 415', async () =>
    status(
      await api(s.superAdmin, 'PUT', `/api/documents/html/${targets.alfa.file.id}`, {
        json: { title: 'x', content: docJson(para('x')) }
      }),
      415
    ))
  await test('preview-data devolve o HTML para o iframe isolado', async () => {
    const res = await api(s.userAlfa, 'GET', `/api/documents/files/${htmlDoc?.id}/preview-data`)

    return {
      ok: res.status === 200 && res.body?.kind === 'html' && res.body.html.includes('Documento gerado pela Simplifica'),
      detail: describe(res).slice(0, 100)
    }
  })
  await test('busca encontra o documento HTML', async () => {
    const res = await api(
      s.userAlfa,
      'GET',
      `/api/documents?workspaceId=${alfa.id}&q=${encodeURIComponent('Comunicado smoke')}`
    )

    return { ok: res.body?.data?.some(item => item.id === htmlDoc?.id), detail: describe(res) }
  })
  await test('auditoria registra DOCUMENT_HTML_CREATE e DOCUMENT_HTML_UPDATE', async () => {
    const actions = await prisma.auditLog.findMany({
      where: { entityId: htmlDoc?.id, action: { in: ['DOCUMENT_HTML_CREATE', 'DOCUMENT_HTML_UPDATE'] } },
      select: { action: true }
    })

    const set = new Set(actions.map(row => row.action))

    return { ok: set.size === 2, detail: [...set].join(',') }
  })
  await test('excluir documento HTML remove também o conteúdo editável', async () => {
    const res = await api(s.superAdmin, 'DELETE', `/api/documents/files/${evil.body?.data?.id}`)
    const source = await prisma.documentHtmlContent.findUnique({ where: { fileId: evil.body?.data?.id ?? '' } })

    return { ok: res.status === 200 && !source, detail: describe(res) }
  })

  // 8c. Templates HTML do workspace ────────
  section('Templates HTML')

  const tplName = suffix => `[SMOKE ${runId}] ${suffix}`

  const tplHtml = marker =>
    `<!doctype html><html><head><title>{{titulo}}</title><style>.x{color:#123}</style></head><body><div class="${marker}"><h1>{{ titulo }}</h1><p>{{autor}} · {{data}} · {{workspace}}</p>{{conteudo}}</div></body></html>`

  const createTpl = (session, body) => api(session, 'POST', '/api/documents/html-templates', { json: body })
  const tplBody = (name, html, workspaceId = alfa.id) => ({ workspaceId, name, html })

  const tplCreated = await createTpl(s.superAdmin, tplBody(tplName('Ofício'), tplHtml('tpl-oficio')))
  const tpl = tplCreated.body?.data

  await test('superAdmin cria template → 201', async () => ({
    ok: tplCreated.status === 201 && tpl?.name === tplName('Ofício') && tpl?.documentsCount === 0,
    detail: describe(tplCreated)
  }))
  await test('subAdmin cria template → 201', async () =>
    status(await createTpl(s.subAdmin, tplBody(tplName('Do subAdmin'), tplHtml('tpl-sub'))), 201))

  for (const profile of ['adminAlfa', 'userAlfa', 'convidado']) {
    await test(`${profile}: criar/listar/editar/excluir template → 403`, async () => {
      const results = await Promise.all([
        createTpl(s[profile], tplBody(tplName(profile), tplHtml('x'))),
        api(s[profile], 'GET', `/api/documents/html-templates?workspaceId=${alfa.id}`),
        api(s[profile], 'PUT', `/api/documents/html-templates/${tpl?.id}`, { json: { name: 'x', html: tplHtml('x') } }),
        api(s[profile], 'DELETE', `/api/documents/html-templates/${tpl?.id}`)
      ])

      return { ok: results.every(res => res.status === 403), detail: results.map(res => res.status).join(',') }
    })
  }

  await test('sem sessão: listar/criar template → 401/login', async () => {
    const results = await Promise.all([
      api(null, 'GET', `/api/documents/html-templates?workspaceId=${alfa.id}`),
      createTpl(null, tplBody(tplName('Anônimo'), tplHtml('x')))
    ])

    return { ok: results.every(isUnauthenticated), detail: results.map(res => res.status).join(',') }
  })
  await test('listagem traz só os templates do workspace pedido', async () => {
    const [inAlfa, inBeta] = await Promise.all([
      api(s.superAdmin, 'GET', `/api/documents/html-templates?workspaceId=${alfa.id}`),
      api(s.superAdmin, 'GET', `/api/documents/html-templates?workspaceId=${beta.id}`)
    ])

    return {
      ok:
        inAlfa.status === 200 &&
        inAlfa.body.data.some(item => item.id === tpl?.id) &&
        inBeta.status === 200 &&
        !inBeta.body.data.some(item => item.id === tpl?.id),
      detail: `alfa=${inAlfa.body?.data?.length} beta=${inBeta.body?.data?.length}`
    }
  })

  const invalidTemplates = {
    'sem {{conteudo}}': '<p>{{titulo}}</p>',
    '<script>': '<script>alert(1)</script>{{conteudo}}',
    'atributo de evento': '<img src="data:," onerror="alert(1)">{{conteudo}}',
    'evento após /': '<svg/onload=alert(1)>{{conteudo}}',
    'javascript:': '<a href="JaVaScRiPt:alert(1)">x</a>{{conteudo}}',
    '<iframe>': '<iframe src="https://evil.example"></iframe>{{conteudo}}',
    '<link>': '<link rel="stylesheet" href="https://evil.example/x.css">{{conteudo}}',
    '<meta http-equiv>': '<meta http-equiv="refresh" content="0;url=https://evil.example">{{conteudo}}',
    '<form>': '<form action="https://evil.example"><input name="senha"></form>{{conteudo}}',
    '@import': '<style>@import "https://evil.example/x.css";</style>{{conteudo}}',
    'marcador desconhecido': '{{conteudo}}{{senha}}',
    'HTML vazio': '   '
  }

  for (const [label, html] of Object.entries(invalidTemplates)) {
    await test(`template com ${label} → 400`, async () =>
      status(await createTpl(s.superAdmin, tplBody(tplName(`Inválido ${label}`), html)), 400))
  }

  await test('template maior que 512 KB → 413', async () =>
    status(await createTpl(s.superAdmin, tplBody(tplName('Enorme'), `{{conteudo}}${'a'.repeat(600 * 1024)}`)), 413))
  await test('nome repetido no workspace (sem diferenciar maiúsculas) → 409', async () =>
    status(await createTpl(s.superAdmin, tplBody(tplName('ofício'), tplHtml('dup'))), 409))
  await test('mesmo nome em outro workspace → 201', async () =>
    status(await createTpl(s.superAdmin, tplBody(tplName('Ofício'), tplHtml('beta'), beta.id)), 201))
  await test('nome vazio → 400', async () => status(await createTpl(s.superAdmin, tplBody('  ', tplHtml('x'))), 400))

  const docWithTpl = await createHtml(s.subAdmin, {
    ...htmlBody('Ofício <smoke>', docJson(para('Texto do ofício'))),
    templateId: tpl?.id
  })

  await test('documento criado com template → 201 e HTML usa o template', async () => {
    const res = await api(s.userAlfa, 'GET', `/api/documents/files/${docWithTpl.body?.data?.id}/download`)
    const html = res.buffer.toString('utf8')
    const problems = []

    if (docWithTpl.status !== 201) problems.push(`criação ${docWithTpl.status}`)
    if (!html.includes('class="tpl-oficio"')) problems.push('template não aplicado')
    if (html.includes('Documento gerado pela Simplifica')) problems.push('veio o padrão')
    if (!html.includes('<h1>Ofício &lt;smoke&gt;</h1>')) problems.push('título sem escape')
    if (!html.includes('Texto do ofício')) problems.push('sem conteúdo')
    if (!html.includes(MOCK_USERS.subAdmin.name) || !html.includes(alfa.name)) problems.push('autor/workspace')
    if (/\{\{/.test(html)) problems.push('marcador sobrou')

    // A CSP vem antes de qualquer marcação do template
    if (
      !/^<!doctype html>\s*<meta charset="utf-8">\s*<meta http-equiv="Content-Security-Policy" content="default-src 'none'/.test(
        html
      )
    )
      problems.push('CSP não está no topo')
    if ((html.match(/<!doctype/gi) || []).length !== 1) problems.push('doctype duplicado')

    return { ok: !problems.length, detail: problems.join('; ') || 'ok' }
  })
  await test('conteúdo editável informa o templateId', async () => {
    const res = await api(s.superAdmin, 'GET', `/api/documents/html/${docWithTpl.body?.data?.id}`)

    return { ok: res.status === 200 && res.body?.templateId === tpl?.id, detail: describe(res).slice(0, 120) }
  })
  await test('template de outro workspace → 404', async () => {
    const betaTpl = await prisma.documentHtmlTemplate.findFirst({
      where: { workspaceId: beta.id, name: tplName('Ofício') }
    })

    const results = await Promise.all([
      createHtml(s.superAdmin, { ...htmlBody('Cruzado tpl', docJson(para('x'))), templateId: betaTpl?.id }),
      api(s.superAdmin, 'PUT', `/api/documents/html/${docWithTpl.body?.data?.id}`, {
        json: { title: 'x', content: docJson(para('x')), templateId: betaTpl?.id }
      })
    ])

    return { ok: results.every(res => res.status === 404), detail: results.map(res => res.status).join(',') }
  })
  await test('template inexistente → 404', async () =>
    status(
      await createHtml(s.superAdmin, { ...htmlBody('Sem tpl', docJson(para('x'))), templateId: 'nao-existe' }),
      404
    ))

  await test('editar template: nome e HTML; documentos já gerados não mudam', async () => {
    const res = await api(s.superAdmin, 'PUT', `/api/documents/html-templates/${tpl?.id}`, {
      json: { name: tplName('Ofício v2'), html: tplHtml('tpl-oficio-v2') }
    })

    const download = await api(s.superAdmin, 'GET', `/api/documents/files/${docWithTpl.body?.data?.id}/download`)
    const html = download.buffer.toString('utf8')

    return {
      ok:
        res.status === 200 &&
        res.body?.data?.name === tplName('Ofício v2') &&
        res.body?.data?.documentsCount === 1 &&
        html.includes('tpl-oficio') &&
        !html.includes('tpl-oficio-v2'),
      detail: describe(res).slice(0, 100)
    }
  })
  await test('editar template com HTML inválido → 400 (e nada muda)', async () => {
    const res = await api(s.superAdmin, 'PUT', `/api/documents/html-templates/${tpl?.id}`, {
      json: { name: tplName('Ofício v2'), html: '<script>x</script>{{conteudo}}' }
    })

    const row = await prisma.documentHtmlTemplate.findUnique({ where: { id: tpl?.id ?? '' } })

    return { ok: res.status === 400 && row?.html.includes('tpl-oficio-v2'), detail: describe(res) }
  })
  await test('renomear template para nome existente → 409', async () =>
    status(
      await api(s.superAdmin, 'PUT', `/api/documents/html-templates/${tpl?.id}`, {
        json: { name: tplName('do subadmin'), html: tplHtml('x') }
      }),
      409
    ))
  await test('reeditar documento aplica a versão nova do template', async () => {
    const res = await api(s.subAdmin, 'PUT', `/api/documents/html/${docWithTpl.body?.data?.id}`, {
      json: { title: 'Ofício reeditado', content: docJson(para('Texto novo')), templateId: tpl?.id }
    })

    const download = await api(s.superAdmin, 'GET', `/api/documents/files/${docWithTpl.body?.data?.id}/download`)

    return {
      ok: res.status === 200 && download.buffer.toString('utf8').includes('tpl-oficio-v2'),
      detail: describe(res)
    }
  })
  await test('reeditar escolhendo o padrão → volta ao template Simplifica', async () => {
    const res = await api(s.subAdmin, 'PUT', `/api/documents/html/${docWithTpl.body?.data?.id}`, {
      json: { title: 'Ofício padrão', content: docJson(para('Texto padrão')), templateId: null }
    })

    const download = await api(s.superAdmin, 'GET', `/api/documents/files/${docWithTpl.body?.data?.id}/download`)
    const source = await prisma.documentHtmlContent.findUnique({ where: { fileId: docWithTpl.body?.data?.id ?? '' } })

    return {
      ok:
        res.status === 200 &&
        download.buffer.toString('utf8').includes('Documento gerado pela Simplifica') &&
        source?.templateId === null,
      detail: describe(res)
    }
  })

  await test('excluir template: documentos ficam, templateId vira null', async () => {
    const doc = await createHtml(s.superAdmin, {
      ...htmlBody('Usa template a excluir', docJson(para('x'))),
      templateId: tpl?.id
    })

    const res = await api(s.superAdmin, 'DELETE', `/api/documents/html-templates/${tpl?.id}`)
    const source = await prisma.documentHtmlContent.findUnique({ where: { fileId: doc.body?.data?.id ?? '' } })
    const download = await api(s.userAlfa, 'GET', `/api/documents/files/${doc.body?.data?.id}/download`)

    return {
      ok:
        doc.status === 201 &&
        res.status === 200 &&
        source &&
        source.templateId === null &&
        download.status === 200 &&
        download.buffer.toString('utf8').includes('tpl-oficio-v2'),
      detail: `${describe(res).slice(0, 60)} templateId=${source?.templateId}`
    }
  })
  await test('template excluído: editar/excluir de novo → 404; usar → 404', async () => {
    const results = await Promise.all([
      api(s.superAdmin, 'PUT', `/api/documents/html-templates/${tpl?.id}`, { json: { name: 'x', html: tplHtml('x') } }),
      api(s.superAdmin, 'DELETE', `/api/documents/html-templates/${tpl?.id}`),
      createHtml(s.superAdmin, { ...htmlBody('Tpl apagado', docJson(para('x'))), templateId: tpl?.id })
    ])

    return { ok: results.every(res => res.status === 404), detail: results.map(res => res.status).join(',') }
  })
  await test('auditoria registra criação, edição e exclusão de template', async () => {
    const actions = await prisma.auditLog.findMany({
      where: {
        entityId: tpl?.id,
        action: { in: ['DOCUMENT_TEMPLATE_CREATE', 'DOCUMENT_TEMPLATE_UPDATE', 'DOCUMENT_TEMPLATE_DELETE'] }
      },
      select: { action: true }
    })

    return { ok: new Set(actions.map(row => row.action)).size === 3, detail: actions.map(row => row.action).join(',') }
  })

  // 9. Paginação, busca e ordenação ────────
  section('Paginação, busca e ordenação')

  const many = await folderIn('alfa', 'Muitos itens')
  const list = query => api(s.userAlfa, 'GET', `/api/documents?workspaceId=${alfa.id}&folderId=${many.id}&${query}`)

  await test('pageSize=25: 3 páginas, 60 itens, sem repetição e pastas primeiro', async () => {
    const pages = await Promise.all([1, 2, 3].map(page => list(`page=${page}&pageSize=25`)))
    const items = pages.flatMap(res => res.body?.data ?? [])
    const unique = new Set(items.map(item => item.id))
    const firstFileIndex = items.findIndex(item => item.kind === 'file')
    const lastFolderIndex = items.map(item => item.kind).lastIndexOf('folder')
    const p = pages[0].body?.pagination

    return {
      ok:
        p?.total === 60 &&
        p?.totalPages === 3 &&
        pages[2].body?.data?.length === 10 &&
        unique.size === 60 &&
        lastFolderIndex < firstFileIndex,
      detail: `pagination=${JSON.stringify(p)} únicos=${unique.size} última pasta=${lastFolderIndex} primeiro arquivo=${firstFileIndex}`
    }
  })
  await test('ordenação por nome dentro de pastas e de arquivos', async () => {
    const items = (await list('pageSize=100')).body?.data ?? []
    const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: false })

    const sorted = kind => {
      const names = items.filter(item => item.kind === kind).map(item => item.name)

      return names.every((name, i) => i === 0 || collator.compare(names[i - 1], name) <= 0)
    }

    return {
      ok: sorted('folder') && sorted('file'),
      detail: items
        .map(item => item.name)
        .join(' | ')
        .slice(0, 200)
    }
  })
  await test('busca com acento ("ação") encontra 22 itens', async () => {
    const res = await list(`q=${encodeURIComponent('ação')}&pageSize=100`)

    return {
      ok: res.body?.pagination?.total === 22 && res.body.data.every(item => /ação/i.test(item.name)),
      detail: describe(res)
    }
  })
  await test('busca sem diferenciar maiúsculas ("AÇÃO") encontra os mesmos 22', async () => {
    const res = await list(`q=${encodeURIComponent('AÇÃO')}&pageSize=100`)

    return { ok: res.body?.pagination?.total === 22, detail: describe(res) }
  })

  // Busca recursiva: pasta atual + subpastas (raiz = workspace inteiro), com o caminho de cada item
  const financeiro = await folderIn('alfa', 'Financeiro')

  const search = (session, ws, query, folder) =>
    api(
      session,
      'GET',
      `/api/documents?workspaceId=${ws.id}&q=${encodeURIComponent(query)}&pageSize=100${folder ? `&folderId=${folder.id}` : ''}`
    )

  const locationOf = item => (item.location ?? []).map(folder => folder.name).join('/')

  await test('busca na raiz acha arquivo a 10 níveis de profundidade, com o caminho', async () => {
    const res = await search(s.userAlfa, alfa, 'No fundo')
    const hit = res.body?.data?.find(item => item.name === 'No fundo.txt')
    const expected = Array.from({ length: 10 }, (_, i) => `Nivel ${i + 1}`).join('/')

    return { ok: !!hit && locationOf(hit) === expected && !!res.body?.search?.recursive, detail: describe(res) }
  })
  await test('busca dentro de "Financeiro" acha os 2 PDFs de "Notas Fiscais"', async () => {
    const res = await search(s.userAlfa, alfa, 'NF 000', financeiro)
    const data = res.body?.data ?? []

    return {
      ok: data.length === 2 && data.every(item => locationOf(item) === 'Financeiro/Notas Fiscais'),
      detail: data.map(item => `${locationOf(item)}/${item.name}`).join(' | ') || describe(res)
    }
  })
  await test('busca dentro de "Financeiro" não traz itens de fora da subárvore', async () => {
    const res = await search(s.userAlfa, alfa, 'Leia-me', financeiro)
    const data = res.body?.data ?? []

    return {
      ok: data.length === 1 && locationOf(data[0]) === 'Financeiro/Notas Fiscais',
      detail: data.map(item => `${locationOf(item)}/${item.name}`).join(' | ') || describe(res)
    }
  })
  await test('busca na raiz acha subpasta ("Notas Fiscais" em Financeiro)', async () => {
    const res = await search(s.userAlfa, alfa, 'Notas Fiscais')
    const hit = res.body?.data?.find(item => item.kind === 'folder' && item.name === 'Notas Fiscais')

    return { ok: !!hit && locationOf(hit) === 'Financeiro', detail: describe(res) }
  })
  await test('busca recursiva não vaza itens de outro workspace (userBeta no Beta)', async () => {
    const res = await search(s.userBeta, beta, 'NF 000')

    return { ok: res.status === 200 && res.body?.pagination?.total === 0, detail: describe(res) }
  })
  await test('listagem sem busca não traz "location" nem "search"', async () => {
    const res = await api(s.userAlfa, 'GET', `/api/documents?workspaceId=${alfa.id}&folderId=${financeiro.id}`)
    const data = res.body?.data ?? []

    return {
      ok: res.status === 200 && data.length > 0 && data.every(item => !('location' in item)) && !res.body.search,
      detail: describe(res)
    }
  })

  await test('pageSize fora da faixa é limitado (1→10, 1000→100)', async () => {
    const [small, large] = await Promise.all([list('pageSize=1'), list('pageSize=1000')])

    return {
      ok: small.body?.pagination?.pageSize === 10 && large.body?.pagination?.pageSize === 100,
      detail: `${small.body?.pagination?.pageSize}/${large.body?.pagination?.pageSize}`
    }
  })
}

main()
  .catch(error => {
    record('execução', false, error.message)
  })
  .finally(async () => {
    await prisma.$disconnect()

    const failed = results.filter(r => r.resultado === 'FAIL')

    console.log('\n══════════ RESUMO ══════════')
    console.table(
      results.map(({ grupo, teste, resultado, detalhe }) => ({
        grupo,
        teste: teste.slice(0, 70),
        resultado,
        detalhe: detalhe.slice(0, 90)
      }))
    )
    console.log(`${results.length - failed.length} PASS · ${failed.length} FAIL`)
    process.exitCode = failed.length ? 1 : 0
  })
