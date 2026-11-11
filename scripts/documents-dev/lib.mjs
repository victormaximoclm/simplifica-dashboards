// Utilitários compartilhados pelos scripts de desenvolvimento do módulo de Documentos.
// Uso exclusivo em ambiente LOCAL — nada aqui é importado pelo código da aplicação.
import crypto from 'crypto'
import zlib from 'zlib'

// ── Guardas de ambiente ─────────────────────

const LOCAL_DB_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', 'db', 'postgres']

// "app" = nome do serviço no docker-compose (scripts rodando no serviço `tools`)
const LOCAL_APP_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', 'app']

export const BASE_URL = (process.env.DOCS_DEV_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')

/** Encerra o processo se o ambiente não for claramente local */
export function assertLocalEnvironment({ needDatabase = true, needApp = true } = {}) {
  const fail = message => {
    console.error(`\n✖ Abortado por segurança: ${message}\n`)
    process.exit(1)
  }

  if (process.env.NODE_ENV === 'production') fail('NODE_ENV=production')

  if (needDatabase) {
    if (!process.env.DATABASE_URL) fail('DATABASE_URL não definida (rode via `pnpm documents:...`, que carrega o .env)')

    let host

    try {
      host = new URL(process.env.DATABASE_URL).hostname
    } catch {
      fail('DATABASE_URL inválida')
    }

    if (!LOCAL_DB_HOSTS.includes(host)) fail(`host do DATABASE_URL não é local: "${host}"`)
  }

  if (needApp) {
    const appHost = new URL(BASE_URL).hostname

    if (!LOCAL_APP_HOSTS.includes(appHost)) fail(`DOCS_DEV_BASE_URL não é local: "${appHost}"`)
  }
}

// ── Dados de teste ──────────────────────────

export const MOCK_PASSWORD = 'Mock@12345'
export const MOCK_EMAIL_DOMAIN = '@example.test'

export const MOCK_WORKSPACES = {
  alfa: { slug: 'mock-alfa', name: '[MOCK] Alfa', isPrivate: false },
  beta: { slug: 'mock-beta', name: '[MOCK] Beta', isPrivate: false },
  privado: { slug: 'mock-privado', name: '[MOCK] Privado', isPrivate: true }
}

/** workspace: chave de MOCK_WORKSPACES (origem do usuário) ou null */
export const MOCK_USERS = {
  superAdmin: {
    email: 'mock.superadmin@example.test',
    name: '[MOCK] Super Admin',
    role: 'superAdmin',
    workspace: null
  },
  subAdmin: { email: 'mock.subadmin@example.test', name: '[MOCK] Sub Admin', role: 'subAdmin', workspace: 'alfa' },
  adminAlfa: { email: 'mock.admin.alfa@example.test', name: '[MOCK] Admin Alfa', role: 'admin', workspace: 'alfa' },
  adminBeta: { email: 'mock.admin.beta@example.test', name: '[MOCK] Admin Beta', role: 'admin', workspace: 'beta' },
  userAlfa: { email: 'mock.user.alfa@example.test', name: '[MOCK] User Alfa', role: 'user', workspace: 'alfa' },
  userBeta: { email: 'mock.user.beta@example.test', name: '[MOCK] User Beta', role: 'user', workspace: 'beta' },
  convidado: { email: 'mock.convidado@example.test', name: '[MOCK] Convidado', role: 'user', workspace: null }
}

export const MOCK_CUSTOM_ROLE_NAME = '[MOCK] Leitor Beta'

// Conteúdo no formato JSON do editor (Tiptap), o mesmo que a UI envia para /api/documents/html
const text = (value, marks) =>
  marks ? { type: 'text', text: value, marks: marks.map(type => ({ type })) } : { type: 'text', text: value }

const paragraph = (...content) => ({ type: 'paragraph', content })
const heading = (level, value) => ({ type: 'heading', attrs: { level }, content: [text(value)] })

const bullets = (...items) => ({
  type: 'bulletList',
  content: items.map(item => ({ type: 'listItem', content: [paragraph(text(item))] }))
})

export const MOCK_HTML_DOCUMENTS = [
  {
    workspace: 'alfa',
    folder: null,
    title: 'Comunicado de boas-vindas',
    content: {
      type: 'doc',
      content: [
        paragraph(text('Olá, time! '), text('Seja bem-vindo à Simplifica.', ['bold'])),
        paragraph(
          text('Este documento foi escrito no editor do módulo de Documentos e recebeu o template da Simplifica '),
          text('automaticamente', ['italic']),
          text('.')
        ),
        heading(1, 'Primeiros passos'),
        bullets(
          'Acesse o painel com seu e-mail corporativo',
          'Confira as pastas do seu workspace',
          'Fale com o RH em caso de dúvidas'
        ),
        {
          type: 'blockquote',
          content: [paragraph(text('Dica: use a busca para achar arquivos dentro de qualquer pasta.'))]
        },
        paragraph(
          text('Mais informações em '),
          {
            type: 'text',
            text: 'simplifica.example',
            marks: [{ type: 'link', attrs: { href: 'https://simplifica.example' } }]
          },
          text('.')
        )
      ]
    }
  },
  {
    workspace: 'alfa',
    folder: 'Políticas',
    title: 'Código de conduta',
    content: {
      type: 'doc',
      content: [
        heading(1, 'Princípios'),
        {
          type: 'orderedList',
          content: ['Respeito', 'Transparência', 'Responsabilidade'].map(item => ({
            type: 'listItem',
            content: [paragraph(text(item))]
          }))
        },
        heading(2, 'Aplicação'),
        {
          type: 'paragraph',
          attrs: { textAlign: 'justify' },
          content: [text('Este código vale para todos os colaboradores e parceiros.')]
        }
      ]
    }
  },
  {
    workspace: 'alfa',
    folder: null,
    template: '[MOCK] Comunicado interno',
    title: 'Aviso de manutenção',
    content: {
      type: 'doc',
      content: [
        paragraph(
          text('No sábado, das 8h às 12h, o sistema ficará '),
          text('indisponível', ['bold']),
          text(' para manutenção.')
        ),
        bullets('Salve seu trabalho antes das 8h', 'Formulários enviados durante a janela serão recebidos depois')
      ]
    }
  }
]

// Templates HTML do workspace (criados pela API /api/documents/html-templates)
export const MOCK_HTML_TEMPLATES = [
  {
    workspace: 'alfa',
    name: '[MOCK] Comunicado interno',
    html: `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>{{titulo}}</title>
<style>
body{margin:0;font-family:Georgia,serif;background:#eef2f7;color:#1e293b}
.page{max-width:760px;margin:32px auto;background:#fff;border-top:10px solid #1d4ed8;padding:40px 48px}
.tag{display:inline-block;background:#1d4ed8;color:#fff;font:600 12px/1 Arial,sans-serif;padding:6px 10px;letter-spacing:.08em}
h1{font-size:30px;margin:16px 0 4px}
.meta{font:13px Arial,sans-serif;color:#64748b;margin-bottom:28px}
footer{margin-top:40px;border-top:1px solid #e2e8f0;padding-top:12px;font:12px Arial,sans-serif;color:#94a3b8}
</style>
</head>
<body>
<div class="page">
<span class="tag">COMUNICADO INTERNO</span>
<h1>{{titulo}}</h1>
<div class="meta">{{workspace}} · {{data}} · {{autor}}</div>
{{conteudo}}
<footer>Uso interno — não encaminhar para fora da empresa.</footer>
</div>
</body>
</html>`
  }
]

// ── HTTP com cookies (fluxo real do NextAuth) ─

export class CookieJar {
  constructor() {
    this.cookies = new Map()
  }

  store(response) {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';')
      const index = pair.indexOf('=')
      const name = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()

      if (/max-age=0|expires=thu, 01 jan 1970/i.test(raw) || value === '') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  has(name) {
    return this.cookies.has(name)
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Login pelo fluxo real: GET /api/auth/csrf → POST /api/auth/callback/credentials.
 * O /api/login tem rate limit (8/min por IP); em caso de bloqueio espera a janela e tenta de novo.
 */
export async function login(email, password = MOCK_PASSWORD, { retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const jar = new CookieJar()
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)

    jar.store(csrfRes)

    const { csrfToken } = await csrfRes.json()

    const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', cookie: jar.header() },
      body: new URLSearchParams({ csrfToken, email, password, json: 'true', callbackUrl: BASE_URL })
    })

    jar.store(res)

    const sessionCookie = jar.has('next-auth.session-token') || jar.has('__Secure-next-auth.session-token')

    if (sessionCookie) return { email, jar }

    const location = res.headers.get('location') || (await res.json().catch(() => ({}))).url || ''
    const error = decodeURIComponent(new URL(location, BASE_URL).searchParams.get('error') || `HTTP ${res.status}`)

    // O 429 do /api/login chega como "CredentialsSignin" (o authorize do NextAuth devolve null para status
    // diferentes de 200/401/403), então ele também pode significar rate limit: espera a janela e tenta de novo
    if (/Muitas tentativas|CredentialsSignin/i.test(error) && attempt < retries) {
      console.log(`  (login recusado para ${email}, possivelmente rate limit de 8/min; aguardando 61s)`)
      await sleep(61_000)
      continue
    }

    throw new Error(`Login falhou para ${email}: ${error}`)
  }
}

/** Chamada à API com a sessão (ou sem, se session = null). Nunca segue redirects. */
export async function api(session, method, path, { json, form, headers = {} } = {}) {
  const init = { method, redirect: 'manual', headers: { ...headers } }

  if (session) init.headers.cookie = session.jar.header()

  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(json)
  } else if (form) {
    init.body = form
  }

  const res = await fetch(`${BASE_URL}${path}`, init)
  const buffer = Buffer.from(await res.arrayBuffer())
  let body = null

  if ((res.headers.get('content-type') || '').includes('application/json')) {
    try {
      body = JSON.parse(buffer.toString('utf8'))
    } catch {
      body = null
    }
  }

  return { status: res.status, headers: res.headers, body, buffer }
}

export async function createFolder(session, { workspaceId, parentId = null, name }) {
  return api(session, 'POST', '/api/documents/folders', { json: { name, workspaceId, parentId } })
}

/** Upload multipart pelo endpoint real (o mesmo que a UI usa) */
export async function uploadFiles(session, { workspaceId, folderId = null, files }) {
  const form = new FormData()

  form.append('workspaceId', workspaceId)
  if (folderId) form.append('folderId', folderId)

  for (const file of files) {
    form.append('files', new Blob([file.buffer], { type: file.type ?? '' }), file.name)
  }

  return api(session, 'POST', '/api/documents/files', { form })
}

export async function isAppUp() {
  try {
    const res = await fetch(`${BASE_URL}/api/health`)

    return res.ok
  } catch {
    return false
  }
}

export const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex')

// ── Geradores de arquivos válidos ───────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n

  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1

  return c >>> 0
})

export function crc32(buffer) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buffer) >>> 0

  let crc = 0xffffffff

  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)

  return (crc ^ 0xffffffff) >>> 0
}

const asciiOnly = value =>
  String(value)
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')

/** PDF 1.4 com N páginas de texto e tabela xref com offsets corretos */
export function makePdf(title, pages = 1) {
  const escape = value => asciiOnly(value).replace(/[\\()]/g, char => `\\${char}`)
  const objects = []
  const pageIds = []
  const contentIds = []
  let nextId = 4

  for (let i = 0; i < pages; i++) {
    pageIds.push(nextId)
    contentIds.push(nextId + 1)
    nextId += 2
  }

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  pageIds.forEach((id, index) => {
    const stream = [
      'BT /F1 22 Tf 72 720 Td',
      `(${escape(title)}) Tj`,
      '0 -32 Td /F1 14 Tf',
      `(Pagina ${index + 1} de ${pages} - arquivo de teste [MOCK]) Tj`,
      'ET'
    ].join('\n')

    objects[id] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[index]} 0 R >>`
    objects[contentIds[index]] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
  })

  let out = '%PDF-1.4\n'
  const offsets = []

  for (let id = 1; id < nextId; id++) {
    offsets[id] = Buffer.byteLength(out, 'latin1')
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(out, 'latin1')

  out += `xref\n0 ${nextId}\n0000000000 65535 f \n`
  out += offsets
    .slice(1)
    .map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  out += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(out, 'latin1')
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)

  length.writeUInt32BE(data.length)
  crc.writeUInt32BE(crc32(body))

  return Buffer.concat([length, body, crc])
}

/** PNG RGB com degradê (seed muda as cores) */
export function makePng(width = 96, height = 64, seed = 0) {
  const rows = []

  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3)

    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = (x * 255) / width + seed * 40
      row[2 + x * 3] = (y * 255) / height
      row[3 + x * 3] = 180 - seed * 30
    }

    rows.push(row)
  }

  const header = Buffer.alloc(13)

  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

/**
 * JPEG baseline em tons de cinza 64x64 (cinza médio, 128): todos os blocos têm DC=0 e só EOB,
 * então tabelas Huffman de um símbolo cada bastam — arquivo válido e mínimo.
 */
export function makeJpeg() {
  const segment = (marker, payload) => {
    const length = Buffer.alloc(2)

    length.writeUInt16BE(payload.length + 2)

    return Buffer.concat([Buffer.from([0xff, marker]), length, payload])
  }

  const huffman = tableClass => Buffer.from([tableClass, 1, ...Array(15).fill(0), 0])

  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from([0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0])),
    segment(0xdb, Buffer.from([0x00, ...Array(64).fill(1)])),
    segment(0xc0, Buffer.from([8, 0, 64, 0, 64, 1, 1, 0x11, 0])),
    segment(0xc4, huffman(0x00)),
    segment(0xc4, huffman(0x10)),
    segment(0xda, Buffer.from([1, 1, 0x00, 0, 63, 0])),

    // 64 blocos x 2 bits ('0' = DC categoria 0, '0' = EOB) = 16 bytes zerados
    Buffer.alloc(16),
    Buffer.from([0xff, 0xd9])
  ])
}

/** WEBP lossless 1x1 (o mesmo usado pelo Modernizr para detectar suporte) */
export function makeWebp() {
  return Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64')
}

/** ZIP com nomes em UTF-8; por padrão sem compressão (método 0), ou deflate (8) com `entry.deflate: true` */
export function makeZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0

  // 01/01/2025 00:00 em formato DOS
  const dosTime = 0
  const dosDate = ((2025 - 1980) << 9) | (1 << 5) | 1

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8')
    const method = entry.deflate ? 8 : 0
    const data = entry.deflate ? zlib.deflateRawSync(raw) : raw
    const crc = crc32(raw)
    const local = Buffer.alloc(30)

    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)

    const central = Buffer.alloc(46)

    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(dosTime, 12)
    central.writeUInt16LE(dosDate, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)

    locals.push(local, name, data)
    centrals.push(central, name)
    offset += local.length + name.length + data.length
  }

  const centralBuffer = Buffer.concat(centrals)
  const end = Buffer.alloc(22)

  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, centralBuffer, end])
}

/** Conteúdo pseudoaleatório determinístico (mesma seed = mesmos bytes = mesmo SHA-256) */
export function pseudoRandomBytes(size, seed = 1) {
  const buffer = Buffer.alloc(size)
  let state = seed >>> 0 || 1

  for (let i = 0; i < size; i += 4) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    buffer.writeUInt32LE(state >>> 0, Math.min(i, size - 4))
  }

  return buffer
}

/** ZIP válido com um arquivo interno, para chegar ao tamanho desejado */
export function makeLargeZip(totalBytes, seed = 1) {
  const overhead = 22 + 30 + 46 + 2 * 'dados.bin'.length

  return makeZip([{ name: 'dados.bin', data: pseudoRandomBytes(totalBytes - overhead, seed) }])
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const xmlEscape = value => String(value).replace(/[<>&"]/g, char => `&#${char.charCodeAt(0)};`)

const contentTypes = overrides =>
  `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  overrides.map(([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`).join('') +
  '</Types>'

const relationships = rels =>
  `${XML}<Relationships xmlns="${REL_NS}">` +
  rels
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="${OFFICE_REL}/${type}" Target="${target}"/>`)
    .join('') +
  '</Relationships>'

export function makeDocx(paragraphs) {
  const body = paragraphs.map(text => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`)

  return makeZip([
    {
      name: '[Content_Types].xml',
      data: contentTypes([
        ['/word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml']
      ])
    },
    { name: '_rels/.rels', data: relationships([['rId1', 'officeDocument', 'word/document.xml']]) },
    {
      name: 'word/document.xml',
      data:
        `${XML}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:body>${body.join('')}</w:body></w:document>`
    }
  ])
}

export function makeXlsx(rows) {
  const columnName = index => String.fromCharCode(65 + index)

  const sheetRows = rows
    .map((row, r) => {
      const cells = row.map((value, c) => {
        const ref = `${columnName(c)}${r + 1}`

        return typeof value === 'number'
          ? `<c r="${ref}"><v>${value}</v></c>`
          : `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`
      })

      return `<row r="${r + 1}">${cells.join('')}</row>`
    })
    .join('')

  return makeZip([
    {
      name: '[Content_Types].xml',
      data: contentTypes([
        ['/xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'],
        ['/xl/worksheets/sheet1.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml']
      ])
    },
    { name: '_rels/.rels', data: relationships([['rId1', 'officeDocument', 'xl/workbook.xml']]) },
    {
      name: 'xl/workbook.xml',
      data:
        `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${OFFICE_REL}">` +
        '<sheets><sheet name="Planilha1" sheetId="1" r:id="rId1"/></sheets></workbook>'
    },
    { name: 'xl/_rels/workbook.xml.rels', data: relationships([['rId1', 'worksheet', 'worksheets/sheet1.xml']]) },
    {
      name: 'xl/worksheets/sheet1.xml',
      data:
        `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetData>${sheetRows}</sheetData></worksheet>`
    }
  ])
}

/** PPTX mínimo: apresentação + 1 slide + layout + master + tema (partes obrigatórias do OOXML) */
export function makePptx(title) {
  const P =
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    `xmlns:r="${OFFICE_REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"`

  const emptyTree =
    '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr/></p:spTree></p:cSld>'

  const ct = 'application/vnd.openxmlformats-officedocument'

  const colors = [
    'dk1',
    'lt1',
    'dk2',
    'lt2',
    'accent1',
    'accent2',
    'accent3',
    'accent4',
    'accent5',
    'accent6',
    'hlink',
    'folHlink'
  ]

  const solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
  const line = `<a:ln w="9525">${solid}</a:ln>`

  const theme =
    `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Mock"><a:themeElements>` +
    `<a:clrScheme name="Mock">${colors.map(c => `<a:${c}><a:srgbClr val="${c.startsWith('lt') ? 'FFFFFF' : 'E66C37'}"/></a:${c}>`).join('')}</a:clrScheme>` +
    '<a:fontScheme name="Mock"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    `<a:fmtScheme name="Mock"><a:fillStyleLst>${solid.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${line.repeat(3)}</a:lnStyleLst>` +
    `<a:effectStyleLst>${'<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3)}</a:effectStyleLst>` +
    `<a:bgFillStyleLst>${solid.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`

  const slide =
    `${XML}<p:sld ${P}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Titulo"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
    '<p:spPr><a:xfrm><a:off x="838200" y="2286000"/><a:ext cx="10515600" cy="1325563"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
    `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="pt-BR" sz="4000"/><a:t>${xmlEscape(title)}</a:t></a:r></a:p></p:txBody></p:sp>` +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'

  return makeZip([
    {
      name: '[Content_Types].xml',
      data: contentTypes([
        ['/ppt/presentation.xml', `${ct}.presentationml.presentation.main+xml`],
        ['/ppt/slides/slide1.xml', `${ct}.presentationml.slide+xml`],
        ['/ppt/slideLayouts/slideLayout1.xml', `${ct}.presentationml.slideLayout+xml`],
        ['/ppt/slideMasters/slideMaster1.xml', `${ct}.presentationml.slideMaster+xml`],
        ['/ppt/theme/theme1.xml', `${ct}.theme+xml`]
      ])
    },
    { name: '_rels/.rels', data: relationships([['rId1', 'officeDocument', 'ppt/presentation.xml']]) },
    {
      name: 'ppt/presentation.xml',
      data:
        `${XML}<p:presentation ${P}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
        '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/>' +
        '<p:notesSz cx="6858000" cy="9144000"/></p:presentation>'
    },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      data: relationships([
        ['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'],
        ['rId2', 'slide', 'slides/slide1.xml'],
        ['rId3', 'theme', 'theme/theme1.xml']
      ])
    },
    { name: 'ppt/slides/slide1.xml', data: slide },
    {
      name: 'ppt/slides/_rels/slide1.xml.rels',
      data: relationships([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']])
    },
    {
      name: 'ppt/slideLayouts/slideLayout1.xml',
      data: `${XML}<p:sldLayout ${P}>${emptyTree}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
    },
    {
      name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      data: relationships([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']])
    },
    {
      name: 'ppt/slideMasters/slideMaster1.xml',
      data:
        `${XML}<p:sldMaster ${P}>${emptyTree}` +
        '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" ' +
        'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>'
    },
    {
      name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      data: relationships([
        ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
        ['rId2', 'theme', '../theme/theme1.xml']
      ])
    },
    { name: 'ppt/theme/theme1.xml', data: theme }
  ])
}

export const makeCsv = rows => Buffer.from(rows.map(row => row.join(';')).join('\n') + '\n', 'utf8')

export const makeTxt = text => Buffer.from(text, 'utf8')

/** Conjunto padrão de um arquivo de cada tipo (determinístico: o smoke test recalcula os hashes) */
export function makeSampleFiles() {
  return [
    {
      name: 'Contrato de Prestação de Serviços.pdf',
      type: 'application/pdf',
      buffer: makePdf('Contrato de Prestacao de Servicos', 3)
    },
    { name: 'Logo Simpla.png', type: 'image/png', buffer: makePng(96, 64, 0) },
    { name: 'Foto da fachada.jpg', type: 'image/jpeg', buffer: makeJpeg() },
    { name: 'Ícone.webp', type: 'image/webp', buffer: makeWebp() },
    {
      name: 'Política de Férias.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: makeDocx(['Política de Férias', 'Documento de teste [MOCK].'])
    },
    {
      name: 'Orçamento 2025.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: makeXlsx([
        ['Item', 'Valor'],
        ['Licenças', 1200],
        ['Infraestrutura', 3450.5]
      ])
    },
    {
      name: 'Apresentação Comercial.pptx',
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer: makePptx('Apresentação Comercial [MOCK]')
    },
    {
      name: 'Clientes São Paulo.csv',
      type: 'text/csv',
      buffer: makeCsv([
        ['nome', 'cidade'],
        ['João', 'São Paulo'],
        ['Márcia', 'Santo André']
      ])
    },
    {
      name: 'Leia-me.txt',
      type: 'text/plain',
      buffer: makeTxt('Arquivo de teste do módulo de Documentos [MOCK].\nAcentuação: ção, é, ü.\n')
    },
    {
      name: 'Pacote de anexos.zip',
      type: 'application/zip',
      buffer: makeZip([
        { name: 'anexo-1.txt', data: 'primeiro anexo' },
        { name: 'anexo-2.txt', data: 'segundo anexo' }
      ])
    }
  ]
}
