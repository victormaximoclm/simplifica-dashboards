import { HtmlDocumentContentError, sanitizeHtmlDocumentContent, sanitizeLinkHref } from '@/libs/documentHtml'

/**
 * Site do módulo de Documentos: regras de conteúdo, árvore de páginas e serialização.
 * Compartilhado entre servidor e cliente (sem imports de servidor).
 *
 * Cada página guarda uma lista de blocos em JSON (texto, imagem, arquivo e link). Nada que vem do banco é
 * confiável: o servidor passa o conteúdo por `sanitizeSiteBlocks` ao servir a página, e o renderizador do cliente
 * só desenha o que conhece. Ao gravar, `validateSiteBlocks` aplica as mesmas regras de forma estrita.
 */

export const DOCUMENT_SITE_LIMITS = {
  maxDepth: 3,
  maxPages: 100,
  maxBlocks: 200,
  pageContentBytes: 512 * 1024,
  titleChars: 120,
  labelChars: 200,
  captionChars: 300
}

export const DOCUMENT_SITE_FIRST_PAGE_TITLE = 'Início'

export const SITE_BLOCK_TYPES = ['text', 'image', 'file', 'link']
export const SITE_IMAGE_WIDTHS = ['sm', 'md', 'full']

/** Imagens que o bloco de imagem aceita (as mesmas que a pré-visualização inline do módulo exibe) */
export const SITE_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp']

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** `status`: 400 para conteúdo inválido, 413 para grande demais */
export class SiteContentError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

const utf8Bytes = value => new TextEncoder().encode(value).length

// ── Normalização dos blocos ─────────────────

/** Texto curto opcional: sem caracteres de controle e com limite de tamanho */
function cleanText(value, max, what, strict) {
  if (value === undefined || value === null || value === '') return ''

  if (typeof value !== 'string') {
    if (strict) throw new SiteContentError(`${what} inválido`)

    return ''
  }

  const text = [...value]
    .map(char => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char))
    .join('')
    .trim()

  if (text.length <= max) return text
  if (strict) throw new SiteContentError(`${what} deve ter no máximo ${max} caracteres`)

  return text.slice(0, max)
}

/**
 * Valida/limpa um bloco. Estrito: lança SiteContentError. Leniente: devolve null para o que não serve.
 * Só passam os campos conhecidos de cada tipo.
 */
function normalizeBlock(block, index, strict) {
  const fail = message => {
    if (strict) throw new SiteContentError(message)

    return null
  }

  if (!block || typeof block !== 'object' || Array.isArray(block)) return fail('Bloco inválido')
  if (!SITE_BLOCK_TYPES.includes(block.type)) return fail('Tipo de bloco inválido')

  let id = block.id

  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    if (strict) return fail('Bloco sem identificador válido')
    id = `bloco-${index}`
  }

  if (block.type === 'text') {
    try {
      return { id, type: 'text', doc: sanitizeHtmlDocumentContent(block.doc) }
    } catch (error) {
      if (strict && error instanceof HtmlDocumentContentError) throw new SiteContentError(error.message, error.status)

      return fail('Texto inválido')
    }
  }

  if (block.type === 'link') {
    const url = sanitizeLinkHref(block.url)

    if (!url) return fail('Endereço do link inválido: use https://, http:// ou mailto:')

    return {
      id,
      type: 'link',
      url,
      label: cleanText(block.label, DOCUMENT_SITE_LIMITS.labelChars, 'O título do link', strict),
      description: cleanText(block.description, DOCUMENT_SITE_LIMITS.captionChars, 'A descrição do link', strict)
    }
  }

  // file e image referenciam um arquivo do módulo SEMPRE por id (nunca por caminho ou URL)
  if (typeof block.fileId !== 'string' || !ID_PATTERN.test(block.fileId)) return fail('Arquivo do bloco inválido')

  if (block.type === 'file') {
    return {
      id,
      type: 'file',
      fileId: block.fileId,
      label: cleanText(block.label, DOCUMENT_SITE_LIMITS.labelChars, 'O título do arquivo', strict),
      description: cleanText(block.description, DOCUMENT_SITE_LIMITS.captionChars, 'A descrição do arquivo', strict)
    }
  }

  return {
    id,
    type: 'image',
    fileId: block.fileId,
    alt: cleanText(block.alt, DOCUMENT_SITE_LIMITS.captionChars, 'O texto alternativo', strict),
    caption: cleanText(block.caption, DOCUMENT_SITE_LIMITS.captionChars, 'A legenda', strict),
    width: SITE_IMAGE_WIDTHS.includes(block.width) ? block.width : 'md'
  }
}

/** Ids dos arquivos referenciados (blocos de imagem e de arquivo), sem repetição */
export function collectSiteFileIds(blocks) {
  return [...new Set((blocks ?? []).filter(block => block.fileId).map(block => block.fileId))]
}

/**
 * Leitura: reconstrói a lista de blocos só com o que o renderizador entende; descarta o resto sem lançar erro.
 * Blocos de texto passam pela mesma limpeza dos documentos HTML (nós e marcas permitidos, links http/https/mailto).
 */
export function sanitizeSiteBlocks(raw) {
  if (!Array.isArray(raw)) return []

  const blocks = []

  for (const [index, block] of raw.entries()) {
    if (blocks.length >= DOCUMENT_SITE_LIMITS.maxBlocks) break

    const clean = normalizeBlock(block, index, false)

    if (clean) blocks.push(clean)
  }

  return blocks
}

/**
 * Gravação: valida de forma estrita e devolve { blocks } limpos. Lança SiteContentError (400 inválido, 413 grande).
 * O tamanho é medido em bytes UTF-8 do JSON já limpo (texto acentuado ocupa mais de um byte).
 */
export function validateSiteBlocks(raw) {
  if (!Array.isArray(raw)) throw new SiteContentError('O conteúdo da página deve ser uma lista de blocos')
  if (raw.length > DOCUMENT_SITE_LIMITS.maxBlocks)
    throw new SiteContentError(`A página pode ter no máximo ${DOCUMENT_SITE_LIMITS.maxBlocks} blocos`)

  const seen = new Set()
  const blocks = []

  for (const [index, block] of raw.entries()) {
    const clean = normalizeBlock(block, index, true)

    if (seen.has(clean.id)) throw new SiteContentError('Há blocos com o mesmo identificador')

    seen.add(clean.id)
    blocks.push(clean)
  }

  if (utf8Bytes(JSON.stringify(blocks)) > DOCUMENT_SITE_LIMITS.pageContentBytes) {
    throw new SiteContentError(
      `O conteúdo da página excede ${DOCUMENT_SITE_LIMITS.pageContentBytes / 1024} KB`,
      413
    )
  }

  return { blocks }
}

/** Título de página: sem caracteres de controle, 1 a 120 caracteres. Lança SiteContentError. */
export function validateSitePageTitle(raw) {
  if (typeof raw !== 'string') throw new SiteContentError('Título é obrigatório')

  const title = cleanText(raw, DOCUMENT_SITE_LIMITS.titleChars, 'O título', true)

  if (!title) throw new SiteContentError('Título é obrigatório')

  return title
}

// ── Serialização ────────────────────────────

/** Resumo para o menu: sem conteúdo */
export function serializeSitePageSummary(page) {
  return { id: page.id, parentId: page.parentId, title: page.title, position: page.position }
}

export function serializeSitePage(page) {
  return {
    ...serializeSitePageSummary(page),
    siteId: page.siteId,
    version: page.version,
    updatedAt: page.updatedAt,
    content: sanitizeSiteBlocks(page.content)
  }
}

// ── Árvore de páginas ───────────────────────

/** Ordem estável das páginas irmãs: posição e, em empate, id */
export function compareSitePages(a, b) {
  return a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** Página inicial: a primeira página raiz pela ordem */
export function pickHomePageId(pages) {
  const roots = pages.filter(page => !page.parentId).sort(compareSitePages)

  return roots[0]?.id ?? null
}

/** Caminho da raiz até a página (inclusive), usado no breadcrumb; protege contra ciclo */
export function buildSitePagePath(pages, pageId) {
  const byId = new Map(pages.map(page => [page.id, page]))
  const path = []
  const seen = new Set()
  let current = byId.get(pageId)

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift({ id: current.id, title: current.title })
    current = current.parentId ? byId.get(current.parentId) : null
  }

  return path
}

/** Nível da página (raiz = 1) */
export const getSitePageDepth = (pages, pageId) => buildSitePagePath(pages, pageId).length

/** Ids da página e de todas as descendentes */
export function getSiteSubtreeIds(pages, pageId) {
  const childrenByParent = new Map()

  for (const page of pages) {
    const siblings = childrenByParent.get(page.parentId ?? null) ?? []

    siblings.push(page.id)
    childrenByParent.set(page.parentId ?? null, siblings)
  }

  // O Set evita laço infinito mesmo se a árvore estiver corrompida
  const seen = new Set([pageId])

  for (const id of seen) for (const childId of childrenByParent.get(id) ?? []) seen.add(childId)

  return [...seen]
}

/** Altura da subárvore da página (a própria página = 1) */
export function getSiteSubtreeHeight(pages, pageId) {
  const ids = new Set(getSiteSubtreeIds(pages, pageId))
  let height = 1

  for (const id of ids) height = Math.max(height, getSitePageDepth(pages, id) - getSitePageDepth(pages, pageId) + 1)

  return height
}

/** Árvore aninhada a partir da lista plana: [{ ...page, children: [...] }] */
export function buildSitePageTree(pages) {
  const childrenByParent = new Map()

  for (const page of [...pages].sort(compareSitePages)) {
    const key = page.parentId ?? null
    const siblings = childrenByParent.get(key) ?? []

    siblings.push(page)
    childrenByParent.set(key, siblings)
  }

  const attach = (page, depth) => {
    // O limite de profundidade impede árvore infinita se os dados estiverem corrompidos
    const children = depth < DOCUMENT_SITE_LIMITS.maxDepth ? (childrenByParent.get(page.id) ?? []) : []

    return { ...page, children: children.map(child => attach(child, depth + 1)) }
  }

  return (childrenByParent.get(null) ?? []).map(page => attach(page, 1))
}

/**
 * Planeja mover uma página para dentro de `parentId` (null = raiz) na posição `index` entre as irmãs.
 * Valida: pai existente, sem ciclo, profundidade máxima. Devolve { updates } com as posições renumeradas
 * (0..n-1) das irmãs de origem e de destino, ou { error }. Função pura: o servidor a usa sob lock e o cliente
 * a usa para desabilitar destinos inválidos.
 */
export function planSitePageMove(pages, pageId, parentId, index) {
  const page = pages.find(entry => entry.id === pageId)

  if (!page) return { error: 'Página não encontrada' }

  const targetParentId = parentId ?? null

  if (targetParentId) {
    if (!pages.some(entry => entry.id === targetParentId)) return { error: 'Página de destino não encontrada' }

    if (getSiteSubtreeIds(pages, pageId).includes(targetParentId))
      return { error: 'Uma página não pode ser movida para dentro dela mesma' }

    if (getSitePageDepth(pages, targetParentId) + getSiteSubtreeHeight(pages, pageId) > DOCUMENT_SITE_LIMITS.maxDepth)
      return { error: `O site pode ter no máximo ${DOCUMENT_SITE_LIMITS.maxDepth} níveis de páginas` }
  }

  const siblingsOf = parent =>
    pages
      .filter(entry => (entry.parentId ?? null) === parent && entry.id !== pageId)
      .sort(compareSitePages)
      .map(entry => entry.id)

  const target = siblingsOf(targetParentId)
  const at = Math.min(Math.max(Number.isInteger(index) ? index : target.length, 0), target.length)

  target.splice(at, 0, pageId)

  const updates = []
  const place = (ids, parent) => ids.forEach((id, position) => updates.push({ id, parentId: parent, position }))

  place(target, targetParentId)

  if ((page.parentId ?? null) !== targetParentId) place(siblingsOf(page.parentId ?? null), page.parentId ?? null)

  // Só o que realmente mudou
  const current = new Map(pages.map(entry => [entry.id, entry]))

  return {
    updates: updates.filter(
      update =>
        update.parentId !== (current.get(update.id).parentId ?? null) || update.position !== current.get(update.id).position
    )
  }
}
