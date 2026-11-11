import { sanitizeHtmlDocumentContent } from '@/libs/documentHtml'

/**
 * Site do módulo de Documentos: regras de conteúdo e serialização das páginas.
 * Compartilhado entre servidor e cliente (sem imports de servidor).
 *
 * Cada página guarda uma lista de blocos em JSON. Nada que vem do banco é confiável: o servidor passa o conteúdo por
 * `sanitizeSiteBlocks` ao servir a página, e o renderizador do cliente só desenha nós permitidos.
 */

export const DOCUMENT_SITE_LIMITS = {
  maxDepth: 3,
  maxPages: 100,
  maxBlocks: 200,
  pageContentBytes: 512 * 1024,
  titleChars: 120
}

export const DOCUMENT_SITE_FIRST_PAGE_TITLE = 'Início'

/** Tipos de bloco aceitos. Arquivo, imagem e link entram junto com o editor de blocos. */
export const SITE_BLOCK_TYPES = ['text']

const BLOCK_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Reconstrói a lista de blocos só com o que o renderizador entende; descarta o resto sem lançar erro.
 * Blocos de texto passam pela mesma limpeza dos documentos HTML (nós e marcas permitidos, links http/https/mailto).
 */
export function sanitizeSiteBlocks(raw) {
  if (!Array.isArray(raw)) return []

  const blocks = []

  for (const [index, block] of raw.entries()) {
    if (blocks.length >= DOCUMENT_SITE_LIMITS.maxBlocks) break
    if (!block || typeof block !== 'object' || !SITE_BLOCK_TYPES.includes(block.type)) continue

    const id = typeof block.id === 'string' && BLOCK_ID_PATTERN.test(block.id) ? block.id : `bloco-${index}`

    if (block.type === 'text') {
      try {
        blocks.push({ id, type: 'text', doc: sanitizeHtmlDocumentContent(block.doc) })
      } catch {
        // Bloco de texto inválido ou grande demais: fica de fora
      }
    }
  }

  return blocks
}

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
