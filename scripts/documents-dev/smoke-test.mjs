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
  MOCK_ROLES,
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

  // Usuário comum só vê o que o cargo libera (item sem cargos = só admin e acima): as sandboxes de Alfa e Beta são
  // liberadas para o cargo "Leitor" de cada um e tudo dentro herda. A do [MOCK] Privado fica sem cargos.
  const roles = {}

  for (const key of ['alfa', 'beta']) {
    roles[key] = await prisma.customRole.findFirst({ where: { workspaceId: workspaces[key].id, name: MOCK_ROLES[key] } })

    if (!roles[key]) throw new Error(`Cargo ${MOCK_ROLES[key]} não existe. Rode \`pnpm documents:mock\` antes.`)

    const grant = await api(s.superAdmin, 'PUT', `/api/documents/folders/${sandboxes[key].id}/access`, {
      json: { roles: [{ roleId: roles[key].id, canDownload: true }] }
    })

    if (grant.status !== 200) throw new Error(`não foi possível liberar a sandbox de ${key}: ${describe(grant)}`)
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
    await runTests({ s, workspaces, sandboxes, targets, fileIn, folderIn, roles })
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

async function runTests({ s, workspaces, sandboxes, targets, fileIn, folderIn, roles }) {
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

    // Convidado comum (não é SuperAdmin/SubAdmin nem do workspace): documentos são isolados por workspace e o cargo
    // dele não vale aqui. Não vê nem abre nada, mesmo com a permissão "view" de convidado.
    if (profile === 'convidado') {
      await test('convidado: raiz lista vazia (200) e pasta/arquivo → 403, sem conteúdo', async () => {
        const [root, inside, download, preview] = await Promise.all([
          api(session, 'GET', `/api/documents?workspaceId=${workspace.id}`),
          api(session, 'GET', `/api/documents?workspaceId=${workspace.id}&folderId=${sandbox.id}`),
          api(session, 'GET', `/api/documents/files/${file.id}/download`),
          api(session, 'GET', `/api/documents/files/${file.id}/preview`)
        ])

        return {
          ok:
            root.status === 200 &&
            root.body?.data?.length === 0 &&
            inside.status === 403 &&
            download.status === 403 &&
            preview.status === 403 &&
            download.buffer.length < 200,
          detail: [root, inside, download, preview].map(describe).join(' | ')
        }
      })

      continue
    }

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
    )
      .map(f => f.storageKey)
      .filter(Boolean)

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

  // 14. Site ───────────────────────────────
  const SITE_MIME = 'application/vnd.simplifica.site'

  const mkSite = (session, workspaceId, folderId, name) =>
    api(session, 'POST', '/api/documents/sites', { json: { workspaceId, folderId, name } })

  const addPage = (siteId, parentId, title, position, content = []) =>
    prisma.documentSitePage.create({ data: { siteId, parentId, title, position, content } })

  const siteRows = async fileIds => ({
    files: await prisma.documentFile.count({ where: { id: { in: fileIds } } }),
    sites: await prisma.documentSite.count({ where: { fileId: { in: fileIds } } }),
    pages: await prisma.documentSitePage.count({ where: { siteId: { in: fileIds } } })
  })

  const textBlock = (id, ...marksAndText) => ({
    id,
    type: 'text',
    doc: { type: 'doc', content: [{ type: 'paragraph', content: marksAndText }] }
  })

  section('Site: criação e controle de acesso')

  let siteA = null

  await test('superAdmin cria Site → 201, sem blob, size 0, sem expor storageKey, com a primeira página', async () => {
    const res = await mkSite(s.superAdmin, alfa.id, sandboxAlfa, 'Site A')

    if (res.status !== 201) return { ok: false, detail: describe(res) }

    siteA = res.body.data

    const row = await prisma.documentFile.findUnique({ where: { id: siteA.id }, include: { site: { include: { pages: true } } } })
    const problems = []

    if (siteA.mimeType !== SITE_MIME || siteA.isSite !== true) problems.push(`tipo ${siteA.mimeType}/${siteA.isSite}`)
    if (siteA.size !== 0 || siteA.previewable !== false) problems.push(`size ${siteA.size}, previewable ${siteA.previewable}`)
    if (JSON.stringify(res.body).includes('storageKey')) problems.push('resposta expõe storageKey')
    if (row?.storageKey !== null) problems.push(`storageKey no banco: ${row?.storageKey}`)
    if (row?.site?.pages.length !== 1 || row.site.pages[0].title !== 'Início' || row.site.pages[0].id !== res.body.pageId)
      problems.push('primeira página ausente ou diferente')

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  await test('subAdmin cria Site em workspace acessível → 201', async () => {
    const res = await mkSite(s.subAdmin, alfa.id, sandboxAlfa, 'Site do subAdmin')

    return status(res, 201)
  })

  for (const [label, session, ws] of [
    ['adminAlfa', s.adminAlfa, alfa],
    ['userAlfa', s.userAlfa, alfa],
    ['convidado', s.convidado, privado]
  ]) {
    await test(`${label} tenta criar Site → 403`, async () => status(await mkSite(session, ws.id, null, 'Não pode'), 403))
  }

  await test('criar Site sem sessão → 401 (ou redirect para /login)', async () => {
    const res = await mkSite(null, alfa.id, sandboxAlfa, 'Sem sessão')

    return { ok: isUnauthenticated(res), detail: describe(res) }
  })

  await test('subAdmin sem acesso ao workspace privado tenta criar Site → 403/404', async () => {
    const res = await mkSite(s.subAdmin, privado.id, sandboxes.privado.id, 'Fora do escopo')

    return { ok: [403, 404].includes(res.status), detail: describe(res) }
  })

  await test('pasta de outro workspace → 404', async () => {
    const res = await mkSite(s.superAdmin, alfa.id, sandboxes.beta.id, 'Pasta alheia')

    return status(res, 404)
  })

  await test('nome inválido ("a/b" e vazio) → 400', async () => {
    const [slash, empty] = await Promise.all([
      mkSite(s.superAdmin, alfa.id, sandboxAlfa, 'a/b'),
      mkSite(s.superAdmin, alfa.id, sandboxAlfa, '   ')
    ])

    return { ok: slash.status === 400 && empty.status === 400, detail: `${slash.status}/${empty.status}` }
  })

  await test('nome repetido no mesmo local (sem diferenciar maiúsculas) → 409', async () => {
    const res = await mkSite(s.superAdmin, alfa.id, sandboxAlfa, 'SITE a')

    return status(res, 409)
  })

  await test('nome igual ao de um arquivo da mesma pasta → 409', async () => {
    // Arquivo próprio do teste: os alvos estáveis são renomeados e movidos por testes anteriores
    const up = await upload(s.superAdmin, alfa.id, sandboxAlfa, [
      { name: 'colisao.pdf', type: 'application/pdf', buffer: makePdf('Colisão') }
    ])

    if (up.status !== 201) return { ok: false, detail: `upload ${describe(up)}` }

    return status(await mkSite(s.superAdmin, alfa.id, sandboxAlfa, 'colisao.pdf'), 409)
  })

  section('Site: leitura, árvore de páginas e isolamento')

  // Árvore: Início (0) · Mapeamentos (1) › Entrada de Materiais (0) › Checklist (0) · Gestão Operacional (2)
  let mapeamentos = null
  let sanitizedPage = null

  await test('prepara a árvore de páginas (3 níveis) e uma página com conteúdo hostil', async () => {
    mapeamentos = await addPage(siteA.id, null, 'Mapeamentos', 1)

    const entrada = await addPage(siteA.id, mapeamentos.id, 'Entrada de Materiais', 0)

    await addPage(siteA.id, entrada.id, 'Checklist', 0)
    await addPage(siteA.id, null, 'Gestão Operacional', 2)

    sanitizedPage = await addPage(siteA.id, null, 'Conteúdo hostil', 3, [
      textBlock(
        'ok-1',
        { type: 'text', text: 'bom', marks: [{ type: 'link', attrs: { href: 'https://ok.example/a' } }] },
        { type: 'text', text: 'mau', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }
      ),
      textBlock('id inválido!', { type: 'text', text: 'segundo' }),
      { id: 'arq', type: 'file', fileId: 'qualquer' },
      { id: 'html', type: 'html', html: '<script>alert(1)</script>' },
      'lixo',
      null
    ])

    return !!sanitizedPage
  })

  await test('GET do Site: árvore sem conteúdo, ordenada, com página inicial e permissões', async () => {
    const res = await api(s.superAdmin, 'GET', `/api/documents/sites/${siteA.id}`)
    const data = res.body?.data
    const titles = (data?.pages ?? []).map(page => page.title)
    const home = (data?.pages ?? []).find(page => page.title === 'Início')
    const problems = []

    if (res.status !== 200) return { ok: false, detail: describe(res) }
    const expectedTitles = ['Início', 'Mapeamentos', 'Entrada de Materiais', 'Checklist', 'Gestão Operacional', 'Conteúdo hostil']

    if (titles.length !== 6 || expectedTitles.some(title => !titles.includes(title)))
      problems.push(`páginas: ${titles.join(', ')}`)
    if (data.homePageId !== home?.id) problems.push('homePageId não é a primeira página raiz')
    if (data.pages.some(page => 'content' in page)) problems.push('a árvore traz conteúdo')
    if (JSON.stringify(res.body).includes('storageKey')) problems.push('expõe storageKey')
    if (!data.permissions?.canEdit || !Array.isArray(data.location)) problems.push('permissões/local ausentes')

    const roots = data.pages.filter(page => !page.parentId).map(page => page.title)

    if (roots.join('|') !== 'Início|Mapeamentos|Gestão Operacional|Conteúdo hostil') problems.push(`raízes: ${roots.join(', ')}`)

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  for (const [label, session] of [
    ['adminAlfa', s.adminAlfa],
    ['userAlfa', s.userAlfa]
  ]) {
    await test(`${label} (mesmo workspace) lê o Site e vê permissões só de leitura`, async () => {
      const res = await api(session, 'GET', `/api/documents/sites/${siteA.id}`)
      const permissions = res.body?.data?.permissions

      return {
        ok: res.status === 200 && permissions?.canCreate === false && permissions?.canEdit === false && permissions?.canDelete === false,
        detail: describe(res)
      }
    })
  }

  await test('userBeta (outro workspace) não lê o Site nem as páginas → 403', async () => {
    const [site, page] = await Promise.all([
      api(s.userBeta, 'GET', `/api/documents/sites/${siteA.id}`),
      api(s.userBeta, 'GET', `/api/documents/sites/${siteA.id}/pages/${mapeamentos.id}`)
    ])

    return { ok: site.status === 403 && page.status === 403, detail: `${site.status}/${page.status}` }
  })

  await test('convidado de outro workspace não lê o Site → 403', async () => {
    return status(await api(s.convidado, 'GET', `/api/documents/sites/${siteA.id}`), 403)
  })

  await test('ler Site e página sem sessão → 401 (ou redirect para /login)', async () => {
    const [site, page] = await Promise.all([
      api(null, 'GET', `/api/documents/sites/${siteA.id}`),
      api(null, 'GET', `/api/documents/sites/${siteA.id}/pages/${mapeamentos.id}`)
    ])

    return { ok: isUnauthenticated(site) && isUnauthenticated(page), detail: `${site.status}/${page.status}` }
  })

  await test('id de um arquivo que não é Site em /sites/:id → 404', async () => {
    return status(await api(s.superAdmin, 'GET', `/api/documents/sites/${targets.alfa.file.id}`), 404)
  })

  await test('página: conteúdo, versão e título', async () => {
    const res = await api(s.userAlfa, 'GET', `/api/documents/sites/${siteA.id}/pages/${mapeamentos.id}`)
    const data = res.body?.data

    return {
      ok: res.status === 200 && data?.title === 'Mapeamentos' && data?.version === 1 && Array.isArray(data?.content) && data?.siteId === siteA.id,
      detail: describe(res)
    }
  })

  await test('página: o servidor limpa o conteúdo (link javascript:, tipos desconhecidos, ids inválidos)', async () => {
    const res = await api(s.userAlfa, 'GET', `/api/documents/sites/${siteA.id}/pages/${sanitizedPage.id}`)
    const content = res.body?.data?.content ?? []
    const json = JSON.stringify(content)
    const problems = []

    if (res.status !== 200) return { ok: false, detail: describe(res) }
    if (json.includes('javascript:') || json.includes('<script') || json.includes('lixo')) problems.push('conteúdo perigoso passou')
    if (!json.includes('https://ok.example/a')) problems.push('link válido foi removido')

    // Ficam o bloco de texto válido, o de texto com id inválido (id gerado) e o de arquivo; o tipo "html", a string
    // e o null saem. O bloco de arquivo com id inexistente resolve como indisponível, sem nenhum metadado
    if (content.length !== 3) problems.push(`${content.length} blocos (esperado 3)`)
    if (content.some(block => !/^[A-Za-z0-9_-]{1,64}$/.test(block.id))) problems.push('id de bloco inválido')
    if (JSON.stringify(res.body?.files?.qualquer) !== JSON.stringify({ id: 'qualquer', available: false }))
      problems.push(`files: ${JSON.stringify(res.body?.files)}`)

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  await test('página de OUTRO site e página inexistente → 404', async () => {
    const other = (await mkSite(s.superAdmin, alfa.id, sandboxAlfa, 'Site B')).body
    const otherPageId = other?.pageId

    const [foreign, missing] = await Promise.all([
      api(s.superAdmin, 'GET', `/api/documents/sites/${siteA.id}/pages/${otherPageId}`),
      api(s.superAdmin, 'GET', `/api/documents/sites/${siteA.id}/pages/inexistente`)
    ])

    return { ok: !!otherPageId && foreign.status === 404 && missing.status === 404, detail: `${foreign.status}/${missing.status}` }
  })

  await test('abrir o Site registra DOCUMENT_FILE_VIEW; a criação registra DOCUMENT_SITE_CREATE', async () => {
    const [view, created] = await Promise.all([
      prisma.auditLog.findFirst({ where: { action: 'DOCUMENT_FILE_VIEW', entityId: siteA.id } }),
      prisma.auditLog.findFirst({ where: { action: 'DOCUMENT_SITE_CREATE', entityId: siteA.id } })
    ])

    return {
      ok: !!view && created?.entityType === 'document_file' && created?.metadata?.name === 'Site A' && created?.tenantId === alfa.id,
      detail: `view=${!!view} create=${JSON.stringify(created?.metadata)}`
    }
  })

  section('Site: operações do Drive (listar, buscar, renomear, mover, preview)')

  await test('listagem traz o Site como item sem tamanho e sem preview; a busca o encontra pelo nome', async () => {
    const [list, search] = await Promise.all([
      api(s.userAlfa, 'GET', `/api/documents?workspaceId=${alfa.id}&folderId=${sandboxAlfa}`),
      api(s.userAlfa, 'GET', `/api/documents?workspaceId=${alfa.id}&q=${encodeURIComponent('Site A')}`)
    ])

    const item = (list.body?.data ?? []).find(entry => entry.id === siteA.id)
    const hit = (search.body?.data ?? []).find(entry => entry.id === siteA.id)

    return {
      ok: item?.isSite === true && item.mimeType === SITE_MIME && item.size === 0 && item.previewable === false && !!hit,
      detail: `${describe(list)} | busca=${!!hit}`
    }
  })

  await test('/preview, /download e /preview-data do Site → 415 (nunca 404 nem 500)', async () => {
    const codes = []

    for (const route of ['preview', 'download', 'preview-data'])
      codes.push((await api(s.superAdmin, 'GET', `/api/documents/files/${siteA.id}/${route}`)).status)

    return { ok: codes.every(code => code === 415), detail: codes.join('/') }
  })

  await test('renomear sem ponto ("Site A2") mantém o nome exato, sem extensão nem ponto final', async () => {
    const res = await api(s.superAdmin, 'PATCH', `/api/documents/files/${siteA.id}`, { json: { name: 'Site A2' } })

    return { ok: res.status === 200 && res.body?.name === 'Site A2' && res.body?.isSite === true, detail: describe(res) }
  })

  await test('renomear com ponto ("Plano.v2") e com falsa extensão ("Plano.docx"): continua Site, sem preview', async () => {
    const dotted = await api(s.superAdmin, 'PATCH', `/api/documents/files/${siteA.id}`, { json: { name: 'Plano.v2' } })
    const fake = await api(s.superAdmin, 'PATCH', `/api/documents/files/${siteA.id}`, { json: { name: 'Plano.docx' } })
    const previewData = await api(s.superAdmin, 'GET', `/api/documents/files/${siteA.id}/preview-data`)
    const list = await api(s.userAlfa, 'GET', `/api/documents?workspaceId=${alfa.id}&folderId=${sandboxAlfa}`)
    const item = (list.body?.data ?? []).find(entry => entry.id === siteA.id)
    const problems = []

    if (dotted.status !== 200 || dotted.body?.name !== 'Plano.v2') problems.push(`ponto: ${describe(dotted)}`)
    if (fake.status !== 200 || fake.body?.name !== 'Plano.docx' || fake.body?.isSite !== true) problems.push(`docx: ${describe(fake)}`)
    if (previewData.status !== 415) problems.push(`preview-data com nome .docx → ${previewData.status}`)
    if (item?.isSite !== true) problems.push('deixou de ser Site na listagem')

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  await test('renomear para nome já usado por outro arquivo → 409; adminAlfa não renomeia → 403', async () => {
    const [conflict, forbidden] = await Promise.all([
      api(s.superAdmin, 'PATCH', `/api/documents/files/${siteA.id}`, { json: { name: 'Site B' } }),
      api(s.adminAlfa, 'PATCH', `/api/documents/files/${siteA.id}`, { json: { name: 'Qualquer' } })
    ])

    return { ok: conflict.status === 409 && forbidden.status === 403, detail: `${conflict.status}/${forbidden.status}` }
  })

  await test('mover o Site para outra pasta: as páginas continuam e o local muda', async () => {
    const before = await prisma.documentSitePage.count({ where: { siteId: siteA.id } })

    const res = await api(s.superAdmin, 'POST', `/api/documents/files/${siteA.id}/move`, {
      json: { targetFolderId: targets.alfa.folder.id }
    })

    const after = await prisma.documentSitePage.count({ where: { siteId: siteA.id } })
    const read = await api(s.userAlfa, 'GET', `/api/documents/sites/${siteA.id}`)

    return {
      ok:
        res.status === 200 &&
        res.body?.folderId === targets.alfa.folder.id &&
        before === after &&
        read.body?.data?.folderId === targets.alfa.folder.id &&
        read.body?.data?.location?.at(-1)?.id === targets.alfa.folder.id,
      detail: describe(res)
    }
  })

  section('Site: páginas, conteúdo, referências e concorrência')

  const pagesRoute = siteId => `/api/documents/sites/${siteId}/pages`
  const mkPage = (session, siteId, body) => api(session, 'POST', pagesRoute(siteId), { json: body })
  const patchPage = (session, siteId, pageId, body) => api(session, 'PATCH', `${pagesRoute(siteId)}/${pageId}`, { json: body })
  const movePage = (session, siteId, pageId, body) => api(session, 'POST', `${pagesRoute(siteId)}/${pageId}/move`, { json: body })
  const siteTree = async siteId => (await api(s.superAdmin, 'GET', `/api/documents/sites/${siteId}`)).body?.data
  const readPage = (session, siteId, pageId) => api(session, 'GET', `${pagesRoute(siteId)}/${pageId}`)
  const titles = pages => pages.map(page => page.title).join('|')

  const textOf = (id, text) => ({
    id,
    type: 'text',
    doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
  })

  const pgRes = (await mkSite(s.superAdmin, alfa.id, sandboxAlfa, 'Site de páginas')).body
  const pgId = pgRes.data.id
  const homeId = pgRes.pageId
  const otherRes = (await mkSite(s.superAdmin, alfa.id, sandboxAlfa, 'Outro site de páginas')).body
  const otherPageId = otherRes.pageId

  for (const [label, session] of [
    ['adminAlfa', s.adminAlfa],
    ['userAlfa', s.userAlfa],
    ['convidado', s.convidado],
    ['userBeta (outro workspace)', s.userBeta]
  ]) {
    await test(`${label}: criar, editar, mover e excluir páginas → 403`, async () => {
      const responses = [
        await mkPage(session, pgId, { title: 'x' }),
        await patchPage(session, pgId, homeId, { title: 'x' }),
        await movePage(session, pgId, homeId, { parentId: null, index: 0 }),
        await api(session, 'DELETE', `${pagesRoute(pgId)}/${homeId}`)
      ]

      return { ok: responses.every(res => res.status === 403), detail: responses.map(res => res.status).join('/') }
    })
  }

  await test('sem sessão: criar, editar, mover e excluir páginas → 401 (ou redirect para /login)', async () => {
    const responses = [
      await mkPage(null, pgId, { title: 'x' }),
      await patchPage(null, pgId, homeId, { title: 'x' }),
      await movePage(null, pgId, homeId, { parentId: null, index: 0 }),
      await api(null, 'DELETE', `${pagesRoute(pgId)}/${homeId}`)
    ]

    return { ok: responses.every(isUnauthenticated), detail: responses.map(res => res.status).join('/') }
  })

  let secA = null
  let subA1 = null
  let subA1a = null

  await test('criar página raiz, subpágina e terceiro nível (superAdmin e subAdmin) → 201 com posição no fim', async () => {
    const root = await mkPage(s.superAdmin, pgId, { title: 'Seção A' })
    const sub = await mkPage(s.subAdmin, pgId, { title: 'Sub A1', parentId: root.body?.data?.id })
    const leaf = await mkPage(s.superAdmin, pgId, { title: 'Sub A1a', parentId: sub.body?.data?.id })

    secA = root.body?.data
    subA1 = sub.body?.data
    subA1a = leaf.body?.data

    const problems = []

    if (root.status !== 201 || secA?.position !== 1 || secA?.parentId !== null || secA?.version !== 1) problems.push(`raiz ${describe(root)}`)
    if (sub.status !== 201 || subA1?.parentId !== secA?.id) problems.push(`sub ${describe(sub)}`)
    if (leaf.status !== 201 || leaf.body?.data?.content?.length !== 0) problems.push(`terceiro nível ${describe(leaf)}`)

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  await test('quarto nível → 400; pai inexistente ou de outro site → 404; título vazio ou longo → 400', async () => {
    const [deep, missing, foreign, empty, long] = await Promise.all([
      mkPage(s.superAdmin, pgId, { title: 'Nível 4', parentId: subA1a.id }),
      mkPage(s.superAdmin, pgId, { title: 'x', parentId: 'inexistente' }),
      mkPage(s.superAdmin, pgId, { title: 'x', parentId: otherPageId }),
      mkPage(s.superAdmin, pgId, { title: '   ' }),
      mkPage(s.superAdmin, pgId, { title: 'a'.repeat(121) })
    ])

    const codes = [deep, missing, foreign, empty, long].map(res => res.status)

    return { ok: codes.join('/') === '400/404/404/400/400', detail: codes.join('/') }
  })

  await test('limite de 100 páginas: a 100ª entra, a 101ª → 409', async () => {
    const limitSite = (await mkSite(s.superAdmin, alfa.id, sandboxAlfa, 'Site no limite')).body.data.id

    await prisma.documentSitePage.createMany({
      data: Array.from({ length: 98 }, (_, index) => ({ siteId: limitSite, title: `P${index}`, position: index + 1, content: [] }))
    })

    const hundredth = await mkPage(s.superAdmin, limitSite, { title: 'Centésima' })
    const over = await mkPage(s.superAdmin, limitSite, { title: 'Excedente' })

    return { ok: hundredth.status === 201 && over.status === 409, detail: `${hundredth.status}/${over.status}` }
  })

  await test('renomear: título muda, versão do conteúdo não; vazio e corpo sem campos → 400; auditoria registra', async () => {
    const renamed = await patchPage(s.superAdmin, pgId, secA.id, { title: 'Seção A2' })
    const [empty, nothing] = await Promise.all([patchPage(s.superAdmin, pgId, secA.id, { title: '' }), patchPage(s.superAdmin, pgId, secA.id, {})])
    const audit = await prisma.auditLog.findFirst({ where: { action: 'DOCUMENT_SITE_PAGE_RENAME', entityId: pgId } })
    const problems = []

    if (renamed.status !== 200 || renamed.body?.data?.title !== 'Seção A2' || renamed.body?.data?.version !== 1)
      problems.push(`rename ${describe(renamed)}`)
    if (empty.status !== 400 || nothing.status !== 400) problems.push(`vazio/sem campos ${empty.status}/${nothing.status}`)
    if (audit?.after?.title !== 'Seção A2' || audit?.metadata?.name !== 'Site de páginas') problems.push('auditoria RENAME')

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  await test('página de OUTRO site em PATCH, DELETE e move → 404 (nunca altera o outro site)', async () => {
    const responses = [
      await patchPage(s.superAdmin, pgId, otherPageId, { title: 'invasão' }),
      await api(s.superAdmin, 'DELETE', `${pagesRoute(pgId)}/${otherPageId}`),
      await movePage(s.superAdmin, pgId, otherPageId, { parentId: null, index: 0 })
    ]

    const untouched = await prisma.documentSitePage.findUnique({ where: { id: otherPageId } })

    return {
      ok: responses.every(res => res.status === 404) && untouched?.title === 'Início',
      detail: responses.map(res => res.status).join('/')
    }
  })

  // Arquivos de teste para os blocos
  const png = (await upload(s.superAdmin, alfa.id, sandboxAlfa, [{ name: 'img-site.png', type: 'image/png', buffer: makePng() }])).body.data[0]
  const pdf = (await upload(s.superAdmin, alfa.id, sandboxAlfa, [{ name: 'doc-site.pdf', type: 'application/pdf', buffer: makePdf('Doc do site') }])).body.data[0]

  const goodBlocks = () => [
    textOf('t1', 'Olá'),
    { id: 'i1', type: 'image', fileId: png.id, alt: 'Logo', caption: 'Legenda', width: 'full' },
    { id: 'f1', type: 'file', fileId: pdf.id, label: 'Manual', description: 'PDF do manual' },
    { id: 'l1', type: 'link', url: 'https://example.com/ref', label: 'Referência', description: '' }
  ]

  let version = 1

  await test('salvar conteúdo (texto, imagem, arquivo, link) → 200, versão 2, referências resolvidas, "Modificado em" avança', async () => {
    const before = (await prisma.documentFile.findUnique({ where: { id: pgId } })).updatedAt
    const res = await patchPage(s.superAdmin, pgId, secA.id, { content: goodBlocks(), baseVersion: 1 })
    const after = (await prisma.documentFile.findUnique({ where: { id: pgId } })).updatedAt
    const problems = []

    if (res.status !== 200) return { ok: false, detail: describe(res) }

    version = res.body.data.version

    if (version !== 2 || res.body.data.content.length !== 4) problems.push(`versão ${version}, ${res.body.data.content.length} blocos`)
    if (!res.body.files?.[png.id]?.available || !res.body.files?.[pdf.id]?.available) problems.push('referências não resolvidas')
    if (JSON.stringify(res.body).includes('storageKey')) problems.push('expõe storageKey')
    if (after <= before) problems.push('Modificado em não avançou')

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  await test('versão antiga → 409 com a versão atual; sem baseVersion → 400', async () => {
    const [stale, missing] = await Promise.all([
      patchPage(s.superAdmin, pgId, secA.id, { content: goodBlocks(), baseVersion: 1 }),
      patchPage(s.superAdmin, pgId, secA.id, { content: goodBlocks() })
    ])

    return {
      ok: stale.status === 409 && stale.body?.currentVersion === version && missing.status === 400,
      detail: `${describe(stale)} | ${missing.status}`
    }
  })

  await test('duas gravações simultâneas com a mesma versão: exatamente uma 200 e uma 409', async () => {
    const [first, second] = await Promise.all([
      patchPage(s.superAdmin, pgId, secA.id, { content: [textOf('c1', 'um')], baseVersion: version }),
      patchPage(s.subAdmin, pgId, secA.id, { content: [textOf('c2', 'dois')], baseVersion: version })
    ])

    const codes = [first.status, second.status].sort()

    if (codes.join('/') === '200/409') version += 1

    return { ok: codes.join('/') === '200/409', detail: codes.join('/') }
  })

  await test('renomear não invalida a gravação em andamento (só o conteúdo tem versão)', async () => {
    await patchPage(s.superAdmin, pgId, secA.id, { title: 'Seção A3' })

    const res = await patchPage(s.superAdmin, pgId, secA.id, { content: goodBlocks(), baseVersion: version })

    if (res.status === 200) version = res.body.data.version

    return { ok: res.status === 200 && res.body.data.title === 'Seção A3', detail: describe(res) }
  })

  await test('conteúdo inválido → 400: não é lista, 201 blocos, ids repetidos ou inválidos, tipo e link inválidos', async () => {
    const attempts = {
      'não é lista': { content: 'texto' },
      '201 blocos': { content: Array.from({ length: 201 }, (_, index) => textOf(`b${index}`, 'x')) },
      'ids repetidos': { content: [textOf('dup', 'a'), textOf('dup', 'b')] },
      'id inválido': { content: [textOf('id inválido!', 'a')] },
      'tipo desconhecido': { content: [{ id: 'h1', type: 'html', html: '<b>x</b>' }] },
      'link javascript:': { content: [{ id: 'l2', type: 'link', url: 'javascript:alert(1)' }] },
      'link sem endereço': { content: [{ id: 'l3', type: 'link', url: '' }] }
    }

    const failures = []

    for (const [label, body] of Object.entries(attempts)) {
      const res = await patchPage(s.superAdmin, pgId, secA.id, { ...body, baseVersion: version })

      if (res.status !== 400) failures.push(`${label}: ${res.status}`)
    }

    return { ok: !failures.length, detail: failures.join('; ') }
  })

  await test('conteúdo acima de 512 KB (bytes UTF-8) → 413', async () => {
    const res = await patchPage(s.superAdmin, pgId, secA.id, {
      content: [textOf('grande', 'é'.repeat(300 * 1024))],
      baseVersion: version
    })

    return status(res, 413)
  })

  await test('referências inválidas → 400: outro workspace, PDF em bloco de imagem, um Site, id inexistente', async () => {
    const attempts = {
      'arquivo de outro workspace': [{ id: 'f9', type: 'file', fileId: targets.beta.file.id }],
      'PDF em bloco de imagem': [{ id: 'i9', type: 'image', fileId: pdf.id }],
      'Site como arquivo': [{ id: 'f8', type: 'file', fileId: pgId }],
      'id inexistente': [{ id: 'f7', type: 'file', fileId: 'inexistente123' }]
    }

    const failures = []

    for (const [label, content] of Object.entries(attempts)) {
      const res = await patchPage(s.superAdmin, pgId, secA.id, { content, baseVersion: version })

      if (res.status !== 400) failures.push(`${label}: ${res.status}`)
    }

    return { ok: !failures.length, detail: failures.join('; ') }
  })

  await test('texto com marca de link javascript: é gravado sem o link perigoso', async () => {
    const block = {
      id: 'x1',
      type: 'text',
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'clique', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }
        ]
      }
    }

    const res = await patchPage(s.superAdmin, pgId, secA.id, { content: [block], baseVersion: version })

    if (res.status === 200) version = res.body.data.version

    return { ok: res.status === 200 && !JSON.stringify(res.body.data.content).includes('javascript:'), detail: describe(res) }
  })

  await test('restaurar os blocos com arquivos; leitura por admin e user traz os metadados (sem storageKey)', async () => {
    const saved = await patchPage(s.superAdmin, pgId, secA.id, { content: goodBlocks(), baseVersion: version })

    if (saved.status === 200) version = saved.body.data.version

    const [admin, user] = await Promise.all([readPage(s.adminAlfa, pgId, secA.id), readPage(s.userAlfa, pgId, secA.id)])
    const ok = [admin, user].every(res => res.status === 200 && res.body.files?.[png.id]?.available && res.body.files?.[png.id]?.name === 'img-site.png')

    return { ok: saved.status === 200 && ok && !JSON.stringify(admin.body).includes('storageKey'), detail: describe(saved) }
  })

  await test('arquivo movido continua resolvendo; arquivo excluído vira { id, available: false } sem metadado', async () => {
    const moved = await api(s.superAdmin, 'POST', `/api/documents/files/${pdf.id}/move`, { json: { targetFolderId: targets.alfa.folder.id } })
    const afterMove = await readPage(s.userAlfa, pgId, secA.id)
    const removed = await api(s.superAdmin, 'DELETE', `/api/documents/files/${png.id}`)
    const afterDelete = await readPage(s.userAlfa, pgId, secA.id)
    const problems = []

    if (moved.status !== 200 || !afterMove.body?.files?.[pdf.id]?.available) problems.push('arquivo movido não resolve')
    if (removed.status !== 200) problems.push(`excluir imagem ${removed.status}`)
    if (JSON.stringify(afterDelete.body?.files?.[png.id]) !== JSON.stringify({ id: png.id, available: false }))
      problems.push(`excluído: ${JSON.stringify(afterDelete.body?.files?.[png.id])}`)

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  await test('auditoria: criar, renomear e salvar conteúdo (uma entrada por usuário a cada 15 min)', async () => {
    const [created, updates] = await Promise.all([
      prisma.auditLog.count({ where: { action: 'DOCUMENT_SITE_PAGE_CREATE', entityId: pgId } }),
      prisma.auditLog.count({ where: { action: 'DOCUMENT_SITE_PAGE_UPDATE', entityId: pgId, userId: (await prisma.user.findUnique({ where: { email: MOCK_USERS.superAdmin.email } })).id } })
    ])

    return { ok: created >= 3 && updates === 1, detail: `criações=${created} salvamentos(superAdmin)=${updates}` }
  })

  await test('mover: reordenar, renumerar 0..n-1, subir e descer', async () => {
    const r3 = (await mkPage(s.superAdmin, pgId, { title: 'R3' })).body.data
    const r4 = (await mkPage(s.superAdmin, pgId, { title: 'R4' })).body.data

    const toFront = await movePage(s.superAdmin, pgId, r4.id, { parentId: null, index: 1 })
    const roots = (await siteTree(pgId)).pages.filter(page => !page.parentId).sort((a, b) => a.position - b.position)
    const problems = []

    if (toFront.status !== 200) problems.push(`mover ${describe(toFront)}`)
    if (titles(roots) !== 'Início|R4|Seção A3|R3') problems.push(`ordem ${titles(roots)}`)
    if (roots.map(page => page.position).join(',') !== '0,1,2,3') problems.push(`posições ${roots.map(page => page.position)}`)

    const down = await movePage(s.superAdmin, pgId, r4.id, { parentId: null, index: 2 })
    const after = (await siteTree(pgId)).pages.filter(page => !page.parentId).sort((a, b) => a.position - b.position)

    if (down.status !== 200 || titles(after) !== 'Início|Seção A3|R4|R3') problems.push(`descer ${titles(after)}`)

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  await test('mover: ciclo, nível além de 3, destino de outro site ou inexistente → 400', async () => {
    const r3 = (await siteTree(pgId)).pages.find(page => page.title === 'R3')

    const [cycle, deep, foreign, missing, self] = await Promise.all([
      movePage(s.superAdmin, pgId, secA.id, { parentId: subA1a.id }),
      movePage(s.superAdmin, pgId, secA.id, { parentId: r3.id }),
      movePage(s.superAdmin, pgId, secA.id, { parentId: otherPageId }),
      movePage(s.superAdmin, pgId, secA.id, { parentId: 'inexistente' }),
      movePage(s.superAdmin, pgId, secA.id, { parentId: secA.id })
    ])

    const codes = [cycle, deep, foreign, missing, self].map(res => res.status)

    return { ok: codes.every(code => code === 400), detail: codes.join('/') }
  })

  await test('mover um bloco de páginas para a raiz e depois excluir com subpáginas (cascata)', async () => {
    const leafToRoot = await movePage(s.superAdmin, pgId, subA1a.id, { parentId: null, index: 99 })
    const child = (await mkPage(s.superAdmin, pgId, { title: 'Folha', parentId: subA1.id })).body.data
    const removed = await api(s.superAdmin, 'DELETE', `${pagesRoute(pgId)}/${subA1.id}`)
    const rows = await prisma.documentSitePage.count({ where: { id: { in: [subA1.id, child.id] } } })
    const gone = await readPage(s.superAdmin, pgId, child.id)
    const problems = []

    if (leafToRoot.status !== 200) problems.push(`mover ${describe(leafToRoot)}`)
    if (removed.status !== 200 || removed.body?.deleted !== 2) problems.push(`excluir ${describe(removed)}`)
    if (rows) problems.push(`${rows} linha(s) restante(s)`)
    if (gone.status !== 404) problems.push(`página excluída lê ${gone.status}`)

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  await test('a página inicial não pode ser excluída → 400; outra raiz pode virar a inicial', async () => {
    const home = await api(s.superAdmin, 'DELETE', `${pagesRoute(pgId)}/${homeId}`)
    const moved = await movePage(s.superAdmin, pgId, secA.id, { parentId: null, index: 0 })
    const data = await siteTree(pgId)
    const problems = []

    if (home.status !== 400) problems.push(`excluir inicial ${home.status}`)
    if (moved.status !== 200 || data.homePageId !== secA.id) problems.push(`nova inicial: ${data.homePageId}`)

    const oldHome = await api(s.superAdmin, 'DELETE', `${pagesRoute(pgId)}/${homeId}`)

    if (oldHome.status !== 200) problems.push(`excluir antiga inicial ${oldHome.status}`)

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  section('Site: exclusão (sem tocar no storage) e cascata')

  await test('excluir o Site apaga DocumentFile, DocumentSite e as páginas; nenhum blob é tocado', async () => {
    const blobsBefore = countBlobs(alfa.id)
    const site = (await mkSite(s.superAdmin, alfa.id, sandboxAlfa, 'Site para excluir')).body
    const siteId = site.data.id

    await addPage(siteId, null, 'Raiz 2', 1)
    await addPage(siteId, (await addPage(siteId, null, 'Raiz 3', 2)).id, 'Filha', 0)

    const created = await siteRows([siteId])
    const res = await api(s.superAdmin, 'DELETE', `/api/documents/files/${siteId}`)
    const after = await siteRows([siteId])
    const blobsAfter = countBlobs(alfa.id)
    const problems = []

    if (created.sites !== 1 || created.pages !== 4) problems.push(`antes: ${JSON.stringify(created)}`)
    if (res.status !== 200) problems.push(`resposta ${describe(res)}`)
    if (after.files || after.sites || after.pages) problems.push(`linhas restantes: ${JSON.stringify(after)}`)
    if (blobsBefore !== null && blobsBefore !== blobsAfter) problems.push(`blobs ${blobsBefore} → ${blobsAfter}`)

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  await test('adminAlfa e userAlfa não excluem o Site → 403', async () => {
    const [admin, user] = await Promise.all([
      api(s.adminAlfa, 'DELETE', `/api/documents/files/${siteA.id}`),
      api(s.userAlfa, 'DELETE', `/api/documents/files/${siteA.id}`)
    ])

    return { ok: admin.status === 403 && user.status === 403, detail: `${admin.status}/${user.status}` }
  })

  await test('excluir uma pasta com Sites e arquivo: cascata nas páginas, blob do arquivo removido, sem órfãos', async () => {
    const x = (await createFolder(s.superAdmin, { workspaceId: alfa.id, parentId: sandboxAlfa, name: 'Com sites' })).body
    const y = (await createFolder(s.superAdmin, { workspaceId: alfa.id, parentId: x.id, name: 'Interna' })).body
    const one = (await mkSite(s.superAdmin, alfa.id, x.id, 'Site 1')).body
    const two = (await mkSite(s.superAdmin, alfa.id, y.id, 'Site 2')).body

    const pdf = (
      await upload(s.superAdmin, alfa.id, y.id, [{ name: 'doc.pdf', type: 'application/pdf', buffer: makePdf('Doc') }])
    ).body.data[0]

    await addPage(one.data.id, null, 'Extra 1', 1)
    await addPage(two.data.id, null, 'Extra 2', 1)

    const pdfKey = (await prisma.documentFile.findUnique({ where: { id: pdf.id }, select: { storageKey: true } })).storageKey
    const ids = [one.data.id, two.data.id, pdf.id]
    const siteIds = [one.data.id, two.data.id]
    const blobBefore = blobExists(pdfKey)
    const res = await api(s.superAdmin, 'DELETE', `/api/documents/folders/${x.id}`)
    const rows = await siteRows(ids)
    const siteRowsLeft = await siteRows(siteIds)
    const folders = await prisma.documentFolder.count({ where: { id: { in: [x.id, y.id] } } })
    const blobAfter = blobExists(pdfKey)
    const problems = []

    if (res.status !== 200 || res.body?.deleted?.folders !== 2 || res.body?.deleted?.files !== 3) problems.push(`resposta ${describe(res)}`)
    if (rows.files || siteRowsLeft.sites || siteRowsLeft.pages) problems.push(`órfãos: ${JSON.stringify({ rows, siteRowsLeft })}`)
    if (folders) problems.push(`${folders} pasta(s) restante(s)`)
    if (storageMode !== 'skip' && (blobBefore !== true || blobAfter !== false)) problems.push(`blob do PDF: antes ${blobBefore}, depois ${blobAfter}`)

    return { ok: !problems.length, detail: problems.join('; ') }
  })

  // 15. Acesso por cargo ───────────────────
  section('Acesso por cargo (pastas, arquivos e Sites)')

  const accessRoot = (await createFolder(s.superAdmin, { workspaceId: alfa.id, name: `[SMOKE] ${runId} acesso` })).body
  const hiddenRoot = (await createFolder(s.superAdmin, { workspaceId: alfa.id, name: `[SMOKE] ${runId} restrito` })).body

  const otherRole = await prisma.customRole.create({
    data: { name: `[SMOKE ${runId}] Outro cargo`, workspaceId: alfa.id }
  })

  const userAlfaRow = await prisma.user.findUnique({
    where: { email: MOCK_USERS.userAlfa.email },
    select: { id: true, customRoleId: true }
  })

  // Por padrão o cargo pode ver e baixar; `canDownload: false` deixa só ver
  const setAccess = (session, kind, id, roleIds, canDownload = true) =>
    api(session, 'PUT', `/api/documents/${kind}/${id}/access`, {
      json: { roles: roleIds.map(roleId => ({ roleId, canDownload })) }
    })

  const grantRows = ids => prisma.rolePermission.count({ where: { resourceId: { in: ids } } })

  const listIds = async (session, folderId, q = '') => {
    const folderParam = folderId ? `&folderId=${folderId}` : ''
    const queryParam = q ? `&q=${encodeURIComponent(q)}` : ''
    const res = await api(session, 'GET', `/api/documents?workspaceId=${alfa.id}&pageSize=100${folderParam}${queryParam}`)

    return { res, ids: (res.body?.data ?? []).map(item => item.id) }
  }

  const treeIds = async session => {
    const res = await api(session, 'GET', `/api/documents/folders?workspaceId=${alfa.id}`)

    return (res.body?.data ?? []).map(folder => folder.id)
  }

  const download = (session, id) => api(session, 'GET', `/api/documents/files/${id}/download`)

  try {
    const subFolder = (await createFolder(s.superAdmin, { workspaceId: alfa.id, parentId: accessRoot.id, name: 'Sub' }))
      .body

    const docA = (await upload(s.superAdmin, alfa.id, accessRoot.id, [txt('docA.txt', 'conteudo A')])).body.data[0]

    const deep = (await upload(s.superAdmin, alfa.id, subFolder.id, [txt('profundo.txt', 'conteudo profundo')])).body
      .data[0]

    const secret = (await upload(s.superAdmin, alfa.id, hiddenRoot.id, [txt('segredo.txt', 'so admin')])).body.data[0]

    await test('sem cargos, o item fica restrito: userAlfa não lista, não abre nem baixa (403); admin e subAdmin veem', async () => {
      const inside = await listIds(s.userAlfa, accessRoot.id)
      const root = await listIds(s.userAlfa, null)
      const folderGet = await api(s.userAlfa, 'GET', `/api/documents/folders/${accessRoot.id}`)
      const previewData = await api(s.userAlfa, 'GET', `/api/documents/files/${docA.id}/preview-data`)
      const tree = await treeIds(s.userAlfa)
      const admin = await listIds(s.adminAlfa, accessRoot.id)
      const sub = await listIds(s.subAdmin, accessRoot.id)
      const problems = []

      if (inside.res.status !== 403) problems.push(`pasta: ${inside.res.status}`)
      if (root.ids.includes(accessRoot.id)) problems.push('pasta aparece na raiz')
      if (folderGet.status !== 403) problems.push(`GET pasta: ${folderGet.status}`)
      if ((await download(s.userAlfa, docA.id)).status !== 403) problems.push('baixou arquivo restrito')
      if (previewData.status !== 403) problems.push(`preview-data: ${previewData.status}`)
      if (tree.includes(accessRoot.id) || tree.includes(subFolder.id)) problems.push('árvore expõe pastas restritas')
      if (!admin.ids.includes(docA.id) || !admin.ids.includes(subFolder.id)) problems.push('adminAlfa não vê tudo')
      if (!sub.ids.includes(docA.id)) problems.push('subAdmin não vê tudo')

      return { ok: !problems.length, detail: problems.join('; ') }
    })

    await test('liberar o cargo na pasta: o conteúdo herda (subpasta, arquivos), baixa e busca recursiva acham', async () => {
      const put = await setAccess(s.superAdmin, 'folders', accessRoot.id, [roles.alfa.id])
      const root = await listIds(s.userAlfa, null)
      const inside = await listIds(s.userAlfa, accessRoot.id)
      const subList = await listIds(s.userAlfa, subFolder.id)
      const found = await listIds(s.userAlfa, null, 'profundo')
      const tree = await treeIds(s.userAlfa)
      const problems = []

      if (put.status !== 200) return { ok: false, detail: describe(put) }
      if (!root.ids.includes(accessRoot.id)) problems.push('pasta não aparece na raiz')
      if (!inside.ids.includes(docA.id) || !inside.ids.includes(subFolder.id)) problems.push('conteúdo não herdou')
      if (!subList.ids.includes(deep.id)) problems.push('subpasta não herdou')
      if ((await download(s.userAlfa, deep.id)).status !== 200) problems.push('não baixou arquivo herdado')
      if (!found.ids.includes(deep.id)) problems.push('busca não achou')
      if (!tree.includes(subFolder.id)) problems.push('árvore sem a subpasta')
      if (inside.res.body?.permissions?.canEdit) problems.push('userAlfa ganhou permissão de edição')
      if ('accessRoles' in (inside.res.body?.data?.[0] ?? {})) problems.push('userAlfa recebeu accessRoles')

      return { ok: !problems.length, detail: problems.join('; ') }
    })

    await test('o admin vê os cargos de cada item na listagem (accessRoles)', async () => {
      const root = await listIds(s.superAdmin, null)
      const row = root.res.body?.data?.find(item => item.id === accessRoot.id)

      return {
        ok: row?.accessRoles?.length === 1 && row.accessRoles[0].id === roles.alfa.id,
        detail: JSON.stringify(row?.accessRoles)
      }
    })

    await test('filho com cargo próprio de outro cargo some para quem só tem o cargo da pasta', async () => {
      const put = await setAccess(s.superAdmin, 'folders', subFolder.id, [otherRole.id])
      const inside = await listIds(s.userAlfa, accessRoot.id)
      const subList = await listIds(s.userAlfa, subFolder.id)
      const found = await listIds(s.userAlfa, null, 'profundo')
      const problems = []

      if (put.status !== 200) return { ok: false, detail: describe(put) }
      if (inside.ids.includes(subFolder.id)) problems.push('subpasta continua listada')
      if (subList.res.status !== 403) problems.push(`subpasta: ${subList.res.status}`)
      if ((await download(s.userAlfa, deep.id)).status !== 403) problems.push('baixou arquivo da subpasta restrita')
      if (found.ids.includes(deep.id)) problems.push('busca vaza arquivo restrito')
      if (!inside.ids.includes(docA.id)) problems.push('arquivo irmão sumiu')

      return { ok: !problems.length, detail: problems.join('; ') }
    })

    await test('liberar só a subpasta mostra o caminho até ela: a pasta de cima lista apenas o caminho (Drive)', async () => {
      await prisma.user.update({ where: { id: userAlfaRow.id }, data: { customRoleId: otherRole.id } })

      try {
        const [rootList, topList, subList, topGet, deepDownload, docDownload] = await Promise.all([
          listIds(s.userAlfa, null),
          listIds(s.userAlfa, accessRoot.id),
          listIds(s.userAlfa, subFolder.id),
          api(s.userAlfa, 'GET', `/api/documents/folders/${accessRoot.id}`),
          download(s.userAlfa, deep.id),
          download(s.userAlfa, docA.id)
        ])

        const problems = []

        if (!rootList.ids.includes(accessRoot.id)) problems.push('pasta de passagem não aparece na raiz')
        if (topList.res.status !== 200 || topList.ids.join() !== subFolder.id) problems.push(`pasta de cima: ${topList.ids}`)
        if (!subList.ids.includes(deep.id)) problems.push('subpasta liberada não lista o arquivo')
        if (topGet.status !== 200 || topGet.body?.counts !== null) problems.push(`GET pasta: ${describe(topGet)}`)
        if (deepDownload.status !== 200) problems.push('não baixou o arquivo liberado')
        if (docDownload.status !== 403) problems.push('baixou arquivo irmão não liberado')

        return { ok: !problems.length, detail: problems.join('; ') }
      } finally {
        await prisma.user.update({ where: { id: userAlfaRow.id }, data: { customRoleId: userAlfaRow.customRoleId } })
      }
    })

    await test('cargo próprio no arquivo sobrepõe a herança da pasta', async () => {
      const put = await setAccess(s.superAdmin, 'files', docA.id, [otherRole.id])
      const inside = await listIds(s.userAlfa, accessRoot.id)

      return {
        ok: put.status === 200 && (await download(s.userAlfa, docA.id)).status === 403 && !inside.ids.includes(docA.id),
        detail: describe(put)
      }
    })

    await test('esvaziar os cargos do filho e do arquivo volta a herdar da pasta', async () => {
      const first = await setAccess(s.superAdmin, 'folders', subFolder.id, [])
      const second = await setAccess(s.superAdmin, 'files', docA.id, [])
      const info = await api(s.superAdmin, 'GET', `/api/documents/folders/${subFolder.id}/access`)
      const problems = []

      if (first.status !== 200 || second.status !== 200) problems.push(`${first.status}/${second.status}`)
      if ((await download(s.userAlfa, deep.id)).status !== 200) problems.push('subpasta não voltou a herdar')
      if ((await download(s.userAlfa, docA.id)).status !== 200) problems.push('arquivo não voltou a herdar')

      if (info.body?.data?.roles?.length !== 0 || info.body?.data?.inherited?.id !== accessRoot.id)
        problems.push(`GET access: ${JSON.stringify(info.body?.data)}`)

      if (info.body?.data?.inherited?.roles?.[0]?.id !== roles.alfa.id) problems.push('cargo herdado errado')

      return { ok: !problems.length, detail: problems.join('; ') }
    })

    await test('Site: herda a pasta; referência a arquivo restrito vem indisponível (admin vê o mesmo arquivo)', async () => {
      const site = (await mkSite(s.superAdmin, alfa.id, accessRoot.id, 'Site acesso')).body

      const page = await addPage(site.data.id, null, 'Início', 0, [
        { id: 'a1', type: 'file', fileId: docA.id, label: 'Aberto', description: '' },
        { id: 'a2', type: 'file', fileId: secret.id, label: 'Segredo', description: '' }
      ])

      const pageRoute = `/api/documents/sites/${site.data.id}/pages/${page.id}`
      const asUser = await api(s.userAlfa, 'GET', pageRoute)
      const asAdmin = await api(s.adminAlfa, 'GET', pageRoute)
      const siteGet = await api(s.userAlfa, 'GET', `/api/documents/sites/${site.data.id}`)
      const problems = []

      if (siteGet.status !== 200 || asUser.status !== 200)
        return { ok: false, detail: `${siteGet.status}/${asUser.status}` }

      if (!asUser.body.files?.[docA.id]?.available) problems.push('arquivo liberado ficou indisponível')

      const hidden = asUser.body.files?.[secret.id]

      if (hidden?.available !== false || Object.keys(hidden ?? {}).sort().join() !== 'available,id')
        problems.push(`restrito vazou: ${JSON.stringify(hidden)}`)

      if (!asAdmin.body.files?.[secret.id]?.available) problems.push('admin não vê o arquivo')

      // Restringir o Site a outro cargo: nem o Site nem as páginas abrem
      const put = await setAccess(s.superAdmin, 'files', site.data.id, [otherRole.id])
      const closedSite = await api(s.userAlfa, 'GET', `/api/documents/sites/${site.data.id}`)
      const closedPage = await api(s.userAlfa, 'GET', pageRoute)

      if (put.status !== 200 || closedSite.status !== 403 || closedPage.status !== 403)
        problems.push(`Site restrito: ${put.status}/${closedSite.status}/${closedPage.status}`)

      return { ok: !problems.length, detail: problems.join('; ') }
    })

    // Arquivo liberado sozinho (estilo Google Drive): as pastas até ele aparecem só como caminho
    const soloRoot = (await createFolder(s.superAdmin, { workspaceId: alfa.id, name: `[SMOKE] ${runId} solo` })).body

    try {
      const innerFolder = (
        await createFolder(s.superAdmin, { workspaceId: alfa.id, parentId: soloRoot.id, name: 'Interna' })
      ).body

      const [um, dois] = (
        await upload(s.superAdmin, alfa.id, soloRoot.id, [txt('um.txt', 'um'), txt('dois.txt', 'dois')])
      ).body.data

      const tres = (await upload(s.superAdmin, alfa.id, innerFolder.id, [txt('tres.txt', 'tres')])).body.data[0]
      const rowOf = (listing, id) => listing.res.body?.data?.find(item => item.id === id)

      await test('liberar só um arquivo: a pasta abre e lista apenas ele; irmãos e subpastas ficam ocultos', async () => {
        const put = await setAccess(s.superAdmin, 'files', um.id, [roles.alfa.id])
        const root = await listIds(s.userAlfa, null)
        const inside = await listIds(s.userAlfa, soloRoot.id)
        const folderGet = await api(s.userAlfa, 'GET', `/api/documents/folders/${soloRoot.id}`)
        const hiddenSearch = await listIds(s.userAlfa, null, 'dois')
        const foundSearch = await listIds(s.userAlfa, null, 'um.txt')
        const tree = await treeIds(s.userAlfa)
        const problems = []

        if (put.status !== 200) return { ok: false, detail: describe(put) }
        if (!root.ids.includes(soloRoot.id)) problems.push('pasta não aparece na raiz')
        if (inside.res.status !== 200 || inside.ids.join() !== um.id) problems.push(`conteúdo da pasta: ${inside.ids}`)
        if (folderGet.status !== 200 || folderGet.body?.counts !== null) problems.push(`GET pasta: ${describe(folderGet)}`)
        if (hiddenSearch.ids.includes(dois.id)) problems.push('busca vaza o arquivo irmão')
        if (!foundSearch.ids.includes(um.id)) problems.push('busca não acha o arquivo liberado')
        if (!tree.includes(soloRoot.id) || tree.includes(innerFolder.id)) problems.push('árvore de pastas errada')
        if ((await download(s.userAlfa, um.id)).status !== 200) problems.push('não baixou o liberado')
        if ((await download(s.userAlfa, dois.id)).status !== 403) problems.push('baixou o irmão')
        if ((await download(s.userAlfa, tres.id)).status !== 403) problems.push('baixou arquivo de subpasta oculta')
        if ((await listIds(s.userAlfa, innerFolder.id)).res.status !== 403) problems.push('abriu subpasta oculta')

        return { ok: !problems.length, detail: problems.join('; ') }
      })

      await test('só ver não baixa: abre e pré-visualiza, mas o download é 403 e a lista marca canDownload=false', async () => {
        const put = await setAccess(s.superAdmin, 'files', um.id, [roles.alfa.id], false)
        const asUser = await listIds(s.userAlfa, soloRoot.id)
        const asAdmin = await listIds(s.adminAlfa, soloRoot.id)
        const meta = await api(s.userAlfa, 'GET', `/api/documents/files/${um.id}`)
        const preview = await api(s.userAlfa, 'GET', `/api/documents/files/${um.id}/preview-data`)
        const auditWhere = { action: 'DOCUMENT_FILE_DOWNLOAD', entityId: um.id, userId: userAlfaRow.id }
        const loggedBefore = await prisma.auditLog.count({ where: auditWhere })
        const blocked = await download(s.userAlfa, um.id)
        const problems = []

        if (put.status !== 200) return { ok: false, detail: describe(put) }
        if (rowOf(asUser, um.id)?.canDownload !== false) problems.push('lista deveria marcar canDownload=false')
        if (rowOf(asAdmin, um.id)?.canDownload !== true) problems.push('admin deveria baixar')
        if (meta.status !== 200 || meta.body?.canDownload !== false) problems.push(`GET arquivo: ${describe(meta)}`)
        if (preview.status !== 200) problems.push(`preview-data: ${preview.status}`)
        if (blocked.status !== 403 || blocked.buffer.length > 300) problems.push(`download: ${describe(blocked)}`)

        if ((await prisma.auditLog.count({ where: auditWhere })) !== loggedBefore)
          problems.push('download negado gerou log de download')

        return { ok: !problems.length, detail: problems.join('; ') }
      })

      await test('pasta liberada só para ver: tudo dentro herda "só ver"; arquivo com cargo próprio pode baixar', async () => {
        await setAccess(s.superAdmin, 'files', um.id, [])
        await setAccess(s.superAdmin, 'folders', soloRoot.id, [roles.alfa.id], false)

        const inside = await listIds(s.userAlfa, soloRoot.id)
        const problems = []

        if (![um.id, dois.id, innerFolder.id].every(id => inside.ids.includes(id))) problems.push('não herdou tudo')
        if ((await listIds(s.userAlfa, innerFolder.id)).ids.join() !== tres.id) problems.push('subpasta não lista o arquivo')
        if ((await download(s.userAlfa, dois.id)).status !== 403) problems.push('baixou com só ver herdado')
        if ((await download(s.userAlfa, tres.id)).status !== 403) problems.push('baixou na subpasta com só ver')

        await setAccess(s.superAdmin, 'files', tres.id, [roles.alfa.id], true)

        if ((await download(s.userAlfa, tres.id)).status !== 200) problems.push('cargo próprio não deu o download')
        if ((await download(s.userAlfa, dois.id)).status !== 403) problems.push('vazou o download para o irmão')

        return { ok: !problems.length, detail: problems.join('; ') }
      })

      await test('pasta liberada com download: tudo dentro baixa', async () => {
        await setAccess(s.superAdmin, 'files', tres.id, [])
        await setAccess(s.superAdmin, 'folders', soloRoot.id, [roles.alfa.id], true)

        const statuses = [
          (await download(s.userAlfa, um.id)).status,
          (await download(s.userAlfa, dois.id)).status,
          (await download(s.userAlfa, tres.id)).status
        ]

        return { ok: statuses.every(code => code === 200), detail: statuses.join('/') }
      })

      // Liberação em lote: vários itens (de pastas diferentes) de uma vez, sem repetir item por item
      const bulk = (session, items, mode, roleEntries) =>
        api(session, 'POST', '/api/documents/access', { json: { items, mode, roles: roleEntries } })

      const asFiles = (...files) => files.map(file => ({ kind: 'file', id: file.id }))
      const alfaRole = canDownload => [{ roleId: roles.alfa.id, canDownload }]

      await test('lote (adicionar): vários arquivos de pastas diferentes de uma vez; reaplicar muda o nível sem duplicar', async () => {
        await setAccess(s.superAdmin, 'folders', soloRoot.id, [])

        const added = await bulk(s.superAdmin, asFiles(um, dois, tres), 'add', alfaRole(false))
        const inside = await listIds(s.userAlfa, soloRoot.id)
        const innerList = await listIds(s.userAlfa, innerFolder.id)
        const problems = []

        if (added.status !== 200 || added.body?.data?.updated !== 3) return { ok: false, detail: describe(added) }
        if (![um.id, dois.id, innerFolder.id].every(id => inside.ids.includes(id))) problems.push('pasta não mostra os liberados')
        if (innerList.ids.join() !== tres.id) problems.push('subpasta não mostra só o liberado')
        if ((await download(s.userAlfa, um.id)).status !== 403) problems.push('baixou com só ver')

        const upgraded = await bulk(s.superAdmin, asFiles(um, dois, tres), 'add', alfaRole(true))
        const info = await api(s.superAdmin, 'GET', `/api/documents/files/${um.id}/access`)

        if (upgraded.status !== 200) problems.push(`reaplicar: ${upgraded.status}`)
        if (info.body?.data?.roles?.length !== 1 || info.body.data.roles[0].canDownload !== true)
          problems.push(`cargos de um.txt: ${JSON.stringify(info.body?.data?.roles)}`)

        for (const file of [um, dois, tres])
          if ((await download(s.userAlfa, file.id)).status !== 200) problems.push(`não baixou ${file.id}`)

        return { ok: !problems.length, detail: problems.join('; ') }
      })

      await test('lote (adicionar) preserva os outros cargos de cada item; (remover) retira só os escolhidos', async () => {
        await setAccess(s.superAdmin, 'files', dois.id, [otherRole.id], false)
        await bulk(s.superAdmin, asFiles(dois), 'add', alfaRole(true))

        const both = (await api(s.superAdmin, 'GET', `/api/documents/files/${dois.id}/access`)).body?.data?.roles ?? []
        const removed = await bulk(s.superAdmin, asFiles(um, dois), 'remove', alfaRole(false))
        const afterDois = (await api(s.superAdmin, 'GET', `/api/documents/files/${dois.id}/access`)).body?.data?.roles ?? []
        const inside = await listIds(s.userAlfa, soloRoot.id)
        const problems = []

        if (both.length !== 2) problems.push(`após adicionar: ${both.map(role => role.name)}`)
        if (removed.status !== 200) problems.push(`remover: ${removed.status}`)
        if (afterDois.length !== 1 || afterDois[0].id !== otherRole.id) problems.push('remover tirou o cargo errado')
        if (inside.ids.includes(um.id) || inside.ids.includes(dois.id)) problems.push('itens removidos continuam visíveis')

        return { ok: !problems.length, detail: problems.join('; ') }
      })

      await test('lote (substituir): lista vazia limpa os cargos dos itens; pasta no lote libera o conteúdo', async () => {
        const cleared = await bulk(s.superAdmin, asFiles(dois, tres), 'replace', [])

        const grantsLeft = await grantRows([dois.id, tres.id])
        const folderBulk = await bulk(s.superAdmin, [{ kind: 'folder', id: soloRoot.id }], 'replace', alfaRole(false))
        const inside = await listIds(s.userAlfa, soloRoot.id)
        const problems = []

        if (cleared.status !== 200 || grantsLeft !== 0) problems.push(`limpar: ${cleared.status}/${grantsLeft}`)
        if (folderBulk.status !== 200 || ![um.id, dois.id, innerFolder.id].every(id => inside.ids.includes(id)))
          problems.push('pasta em lote não liberou o conteúdo')

        return { ok: !problems.length, detail: problems.join('; ') }
      })

      await test('lote: ajustar nível e remover cargos na mesma chamada (removeRoleIds); remover sem adicionar também vale', async () => {
        await bulk(s.superAdmin, asFiles(um, dois), 'replace', [
          { roleId: roles.alfa.id, canDownload: true },
          { roleId: otherRole.id, canDownload: true }
        ])

        const rolesOf = async file =>
          ((await api(s.superAdmin, 'GET', `/api/documents/files/${file.id}/access`)).body?.data?.roles ?? []).map(
            role => `${role.name}:${role.canDownload}`
          )

        const mixed = await api(s.superAdmin, 'POST', '/api/documents/access', {
          json: { items: asFiles(um, dois), mode: 'add', roles: alfaRole(false), removeRoleIds: [otherRole.id] }
        })

        const afterMixed = [await rolesOf(um), await rolesOf(dois)]

        const onlyRemove = await api(s.superAdmin, 'POST', '/api/documents/access', {
          json: { items: asFiles(um), mode: 'add', roles: [], removeRoleIds: [roles.alfa.id] }
        })

        const invalid = await api(s.superAdmin, 'POST', '/api/documents/access', {
          json: { items: asFiles(um), mode: 'replace', roles: [], removeRoleIds: [roles.alfa.id] }
        })

        const problems = []

        if (mixed.status !== 200) problems.push(`misto: ${describe(mixed)}`)

        if (afterMixed.some(list => list.length !== 1 || !list[0].endsWith(':false')))
          problems.push(`após misto: ${JSON.stringify(afterMixed)}`)

        if (onlyRemove.status !== 200 || (await rolesOf(um)).length !== 0)
          problems.push(`só remover: ${onlyRemove.status}`)

        if (invalid.status !== 400) problems.push(`removeRoleIds com replace: ${invalid.status}`)

        return { ok: !problems.length, detail: problems.join('; ') }
      })

      await test('lote: validações (workspaces misturados, cargo de fora, corpo inválido, vazio, limite, inexistente) → 4xx sem gravar', async () => {
        const before = await grantRows([um.id, dois.id, tres.id, soloRoot.id])

        const attempts = [
          [await bulk(s.superAdmin, [...asFiles(um), ...asFiles(targets.beta.file)], 'add', alfaRole(true)), 400],
          [await bulk(s.superAdmin, asFiles(um), 'add', [{ roleId: roles.beta.id, canDownload: true }]), 400],
          [await bulk(s.superAdmin, asFiles(um), 'add', []), 400],
          [await bulk(s.superAdmin, asFiles(um), 'mudar', alfaRole(true)), 400],
          [await bulk(s.superAdmin, [], 'add', alfaRole(true)), 400],
          [await bulk(s.superAdmin, [{ kind: 'x', id: um.id }], 'add', alfaRole(true)), 400],
          [await bulk(s.superAdmin, Array.from({ length: 201 }, (_, index) => ({ kind: 'file', id: `x${index}` })), 'add', alfaRole(true)), 400],
          [await bulk(s.superAdmin, [{ kind: 'file', id: 'inexistente' }], 'add', alfaRole(true)), 404],
          [await bulk(s.adminAlfa, asFiles(um), 'add', alfaRole(true)), 403],
          [await bulk(s.userAlfa, asFiles(um), 'add', alfaRole(true)), 403],
          [await bulk(s.userBeta, asFiles(um), 'add', alfaRole(true)), 403]
        ]

        const wrong = attempts.map(([res, expected], index) => (res.status === expected ? null : `${index}:${res.status}`)).filter(Boolean)
        const after = await grantRows([um.id, dois.id, tres.id, soloRoot.id])

        return { ok: !wrong.length && before === after, detail: `fora do esperado: ${wrong.join(',')} grants ${before}→${after}` }
      })

      await test('lote: cada item vira um registro DOCUMENT_ACCESS_UPDATE com bulk=true', async () => {
        const logs = await prisma.auditLog.findMany({
          where: { action: 'DOCUMENT_ACCESS_UPDATE', entityId: { in: [um.id, dois.id, tres.id] } }
        })

        const bulkLogs = logs.filter(log => log.metadata?.bulk === true)

        return { ok: bulkLogs.length >= 3 && bulkLogs.every(log => log.tenantId === alfa.id), detail: `${bulkLogs.length}` }
      })
    } finally {
      await api(s.superAdmin, 'DELETE', `/api/documents/folders/${soloRoot.id}`)
    }

    await test('PUT /access: cargo de outro workspace, inexistente ou corpo inválido → 400; nada é gravado', async () => {
      const before = await grantRows([subFolder.id])
      const route = `/api/documents/folders/${subFolder.id}/access`

      const attempts = [
        await setAccess(s.superAdmin, 'folders', subFolder.id, [roles.beta.id]),
        await setAccess(s.superAdmin, 'folders', subFolder.id, ['cargo-inexistente']),
        await setAccess(s.superAdmin, 'folders', subFolder.id, [roles.alfa.id, roles.beta.id]),
        await api(s.superAdmin, 'PUT', route, { json: { roles: 'x' } }),
        await api(s.superAdmin, 'PUT', route, { json: { roles: [{ roleId: 1 }] } }),
        await api(s.superAdmin, 'PUT', route, { json: {} })
      ]

      return {
        ok: attempts.every(res => res.status === 400) && (await grantRows([subFolder.id])) === before,
        detail: attempts.map(res => res.status).join('/')
      }
    })

    await test('admin e user não gerenciam o acesso (GET/PUT → 403); subAdmin gerencia', async () => {
      const calls = [
        await setAccess(s.adminAlfa, 'folders', accessRoot.id, []),
        await setAccess(s.userAlfa, 'folders', accessRoot.id, []),
        await setAccess(s.userBeta, 'folders', accessRoot.id, []),
        await api(s.userAlfa, 'GET', `/api/documents/folders/${accessRoot.id}/access`),
        await api(s.adminAlfa, 'GET', `/api/documents/files/${docA.id}/access`),
        await api(s.convidado, 'GET', `/api/documents/files/${docA.id}/access`)
      ]

      const sub = await setAccess(s.subAdmin, 'folders', subFolder.id, [])
      const intact = (await listIds(s.userAlfa, accessRoot.id)).res.status === 200

      return {
        ok: calls.every(res => res.status === 403) && sub.status === 200 && intact,
        detail: `${calls.map(res => res.status).join('/')} sub=${sub.status} intacto=${intact}`
      }
    })

    await test('userBeta (outro workspace) continua sem acesso mesmo com a pasta liberada em Alfa', async () => {
      const calls = [
        await api(s.userBeta, 'GET', `/api/documents?workspaceId=${alfa.id}&folderId=${accessRoot.id}`),
        await download(s.userBeta, docA.id),
        await api(s.userBeta, 'GET', `/api/documents/folders/${accessRoot.id}`)
      ]

      return {
        ok: calls.every(res => res.status === 403 || res.status === 404),
        detail: calls.map(res => res.status).join('/')
      }
    })

    await test('a mudança de acesso é auditada (DOCUMENT_ACCESS_UPDATE) com os cargos depois', async () => {
      const log = await prisma.auditLog.findFirst({
        where: { action: 'DOCUMENT_ACCESS_UPDATE', entityId: accessRoot.id },
        orderBy: { createdAt: 'asc' }
      })

      return {
        ok: !!log && log.tenantId === alfa.id && JSON.stringify(log.after ?? {}).includes(roles.alfa.id),
        detail: JSON.stringify(log)
      }
    })

    await test('excluir arquivo e pasta apaga as concessões (sem órfãos em RolePermission)', async () => {
      await setAccess(s.superAdmin, 'files', deep.id, [roles.alfa.id])
      await setAccess(s.superAdmin, 'folders', subFolder.id, [roles.alfa.id])

      const ids = [accessRoot.id, subFolder.id, deep.id, docA.id]
      const before = await grantRows(ids)
      const delFile = await api(s.superAdmin, 'DELETE', `/api/documents/files/${deep.id}`)
      const afterFile = await grantRows([deep.id])
      const delFolder = await api(s.superAdmin, 'DELETE', `/api/documents/folders/${accessRoot.id}`)
      const afterFolder = await grantRows(ids)

      return {
        ok: before >= 3 && delFile.status === 200 && afterFile === 0 && delFolder.status === 200 && afterFolder === 0,
        detail: `antes=${before} arquivo=${delFile.status}/${afterFile} pasta=${delFolder.status}/${afterFolder}`
      }
    })
  } finally {
    await prisma.user.update({ where: { id: userAlfaRow.id }, data: { customRoleId: userAlfaRow.customRoleId } })

    for (const folder of [accessRoot, hiddenRoot])
      await api(s.superAdmin, 'DELETE', `/api/documents/folders/${folder.id}`)

    // As concessões do cargo saem junto com ele (chave estrangeira em cascata)
    await prisma.customRole.delete({ where: { id: otherRole.id } })
  }
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
