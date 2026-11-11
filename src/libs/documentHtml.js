/**
 * Documentos HTML do módulo de Documentos: o usuário escreve no editor (Tiptap) e o sistema monta
 * o arquivo .html com o template Simplifica ao redor do conteúdo.
 *
 * Compartilhado entre client (pré-visualização no editor) e servidor (arquivo gravado) — sem imports de servidor.
 *
 * Segurança: o HTML nunca vem pronto do navegador. Guardamos o JSON do editor, limpo por `sanitizeHtmlDocumentContent`
 * (só nós/marcas conhecidos, atributos validados), e o HTML é gerado aqui com todo texto escapado e links restritos a
 * http(s)/mailto. O template ainda declara CSP sem scripts.
 */

export const HTML_DOCUMENT_LIMITS = {
  titleChars: 200,
  contentBytes: 1024 * 1024,
  nodes: 20000,
  depth: 40
}

const TEXT_ALIGNS = ['left', 'center', 'right', 'justify']

const BLOCK_TAGS = {
  paragraph: 'p',
  blockquote: 'blockquote',
  bulletList: 'ul',
  orderedList: 'ol',
  listItem: 'li'
}

const LEAF_TAGS = { horizontalRule: '<hr>', hardBreak: '<br>' }

const MARK_TAGS = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code' }

// Ordem fixa das marcas no HTML (o link sempre por fora)
const MARK_ORDER = ['link', 'bold', 'italic', 'underline', 'strike', 'code']

const ALLOWED_NODES = new Set([
  'doc',
  'text',
  'heading',
  'codeBlock',
  ...Object.keys(BLOCK_TAGS),
  ...Object.keys(LEAF_TAGS)
])

/** `status`: 400 para conteúdo inválido, 413 para grande demais */
export class HtmlDocumentContentError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  )
}

/** Só http(s) e mailto; qualquer outro esquema (javascript:, data:...) é descartado */
export function sanitizeLinkHref(href) {
  const value = String(href ?? '').trim()

  if (!value || value.length > 2048) return null

  return /^(https?:\/\/|mailto:)/i.test(value) ? value : null
}

function sanitizeMarks(marks) {
  if (!Array.isArray(marks)) return undefined

  const clean = []

  for (const mark of marks) {
    if (!mark || typeof mark.type !== 'string' || clean.some(item => item.type === mark.type)) continue

    if (mark.type === 'link') {
      const href = sanitizeLinkHref(mark.attrs?.href)

      if (href) clean.push({ type: 'link', attrs: { href } })
    } else if (MARK_TAGS[mark.type]) {
      clean.push({ type: mark.type })
    }
  }

  return clean.length ? clean : undefined
}

function sanitizeAttrs(node) {
  const attrs = {}
  const textAlign = node.attrs?.textAlign

  if ((node.type === 'paragraph' || node.type === 'heading') && TEXT_ALIGNS.includes(textAlign)) {
    attrs.textAlign = textAlign
  }

  if (node.type === 'heading') {
    const level = Number(node.attrs?.level)

    attrs.level = level >= 1 && level <= 3 ? level : 2
  }

  if (node.type === 'orderedList') {
    const start = Number(node.attrs?.start)

    if (Number.isInteger(start) && start > 1 && start < 100000) attrs.start = start
  }

  return Object.keys(attrs).length ? attrs : undefined
}

/**
 * Reconstrói o JSON do editor só com o que o renderizador entende (descarta o resto).
 * Lança HtmlDocumentContentError se o conteúdo for inválido ou grande demais.
 */
export function sanitizeHtmlDocumentContent(content) {
  if (!content || typeof content !== 'object' || content.type !== 'doc') {
    throw new HtmlDocumentContentError('Conteúdo do documento inválido')
  }

  let nodes = 0

  const walk = (node, depth) => {
    if (!node || typeof node !== 'object' || !ALLOWED_NODES.has(node.type)) return null

    if (++nodes > HTML_DOCUMENT_LIMITS.nodes || depth > HTML_DOCUMENT_LIMITS.depth) {
      throw new HtmlDocumentContentError('O documento é grande demais', 413)
    }

    if (node.type === 'text') {
      const text = typeof node.text === 'string' ? node.text : ''

      if (!text) return null

      const marks = sanitizeMarks(node.marks)

      return marks ? { type: 'text', text, marks } : { type: 'text', text }
    }

    const clean = { type: node.type }
    const attrs = sanitizeAttrs(node)

    if (attrs) clean.attrs = attrs

    if (Array.isArray(node.content) && !LEAF_TAGS[node.type]) {
      const children = node.content.map(child => walk(child, depth + 1)).filter(Boolean)

      if (children.length) clean.content = children
    }

    return clean
  }

  const doc = walk(content, 0)

  if (JSON.stringify(doc).length > HTML_DOCUMENT_LIMITS.contentBytes) {
    throw new HtmlDocumentContentError('O documento é grande demais', 413)
  }

  return doc
}

/** Documento vazio = sem nenhum texto (só parágrafos vazios / linhas) */
export function isHtmlDocumentEmpty(content) {
  const hasText = node => (node?.type === 'text' ? !!node.text?.trim() : (node?.content ?? []).some(hasText))

  return !hasText(content)
}

function renderText(node) {
  let html = escapeHtml(node.text)
  const marks = [...(node.marks ?? [])].sort((a, b) => MARK_ORDER.indexOf(b.type) - MARK_ORDER.indexOf(a.type))

  for (const mark of marks) {
    if (mark.type === 'link') {
      const href = sanitizeLinkHref(mark.attrs?.href)

      if (href) html = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${html}</a>`
    } else if (MARK_TAGS[mark.type]) {
      html = `<${MARK_TAGS[mark.type]}>${html}</${MARK_TAGS[mark.type]}>`
    }
  }

  return html
}

function renderNode(node) {
  if (!node) return ''
  if (node.type === 'text') return renderText(node)
  if (LEAF_TAGS[node.type]) return LEAF_TAGS[node.type]

  const children = (node.content ?? []).map(renderNode).join('')
  const align = node.attrs?.textAlign && node.attrs.textAlign !== 'left' ? node.attrs.textAlign : null
  const style = align && TEXT_ALIGNS.includes(align) ? ` style="text-align:${align}"` : ''

  switch (node.type) {
    case 'doc':
      return children

    case 'heading': {
      // O título do documento é o <h1>; os títulos do conteúdo descem um nível
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level) || 2)) + 1

      return `<h${level}${style}>${children}</h${level}>`
    }

    case 'codeBlock':
      return `<pre><code>${children}</code></pre>`

    case 'orderedList': {
      const start = Number(node.attrs?.start)

      return `<ol${Number.isInteger(start) && start > 1 ? ` start="${start}"` : ''}>${children}</ol>`
    }

    case 'paragraph':
      return `<p${style}>${children || '<br>'}</p>`
    default:
      return BLOCK_TAGS[node.type] ? `<${BLOCK_TAGS[node.type]}>${children}</${BLOCK_TAGS[node.type]}>` : children
  }
}

export function renderHtmlDocumentBody(content) {
  return renderNode(sanitizeHtmlDocumentContent(content))
}

/** Nome do arquivo a partir do título (sem separadores de caminho nem caracteres de controle) */
export function htmlDocumentFileName(title) {
  const base =
    [...String(title ?? '')]
      .map(char => (char === '/' || char === '\\' ? '-' : char))
      .filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
      .join('')
      .trim()
      .slice(0, HTML_DOCUMENT_LIMITS.titleChars) || 'Documento'

  return `${base}.html`
}

export function formatHtmlDocumentDate(value) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo'
  })
}

// Marca da Simplifica (mesmo desenho de public/images/logos/simplifica-email-logo.svg), embutida para o arquivo
// funcionar sozinho, sem depender de recursos externos
const BRAND_MARK = `<svg width="32" height="32" viewBox="0 0 30 30" aria-hidden="true"><rect width="30" height="30" rx="8" fill="#E66C37"/><path d="M9.5 19.4C11.1 21 13.3 22 15.8 22C20.7 22 24.7 18 24.7 13.1C24.7 8.2 20.7 4.2 15.8 4.2C13.2 4.2 10.8 5.3 9.2 7.1" stroke="#fff" stroke-width="2.3" stroke-linecap="round" fill="none"/><path d="M4.8 13.3H17.4" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/></svg>`

const TEMPLATE_STYLES = `
*{box-sizing:border-box}
html{background:#f4f5f7}
body{margin:0;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#1f2937;line-height:1.65;font-size:16px}
.sheet{max-width:820px;margin:0 auto;background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,.08),0 8px 24px rgba(15,23,42,.06);overflow:hidden}
.brand{display:flex;align-items:center;gap:10px;padding:20px 48px;border-bottom:4px solid #E66C37}
.brand-name{font-weight:700;font-size:19px;letter-spacing:-.01em;color:#1f2937}
.content{padding:40px 48px 48px}
.doc-title{margin:0 0 6px;font-size:30px;line-height:1.25;letter-spacing:-.02em;color:#111827;overflow-wrap:anywhere}
.doc-meta{margin:0 0 32px;font-size:13px;color:#6b7280}
.doc-body{overflow-wrap:anywhere}
.doc-body h2{font-size:23px;line-height:1.3;margin:32px 0 10px;color:#111827}
.doc-body h3{font-size:19px;line-height:1.35;margin:26px 0 8px;color:#111827}
.doc-body h4{font-size:16px;margin:22px 0 6px;color:#111827;text-transform:uppercase;letter-spacing:.04em}
.doc-body p{margin:0 0 14px}
.doc-body ul,.doc-body ol{margin:0 0 14px;padding-left:26px}
.doc-body li>p{margin:0 0 6px}
.doc-body blockquote{margin:18px 0;padding:10px 18px;border-left:4px solid #E66C37;background:#fdf3ee;border-radius:0 8px 8px 0;color:#374151}
.doc-body blockquote p:last-child{margin-bottom:0}
.doc-body a{color:#c2531f;text-decoration:underline}
.doc-body code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em;background:#f3f4f6;padding:1px 5px;border-radius:4px}
.doc-body pre{background:#1f2937;color:#f9fafb;padding:14px 18px;border-radius:8px;overflow:auto;margin:0 0 14px}
.doc-body pre code{background:none;padding:0;color:inherit}
.doc-body hr{border:0;border-top:1px solid #e5e7eb;margin:28px 0}
.footer{padding:16px 48px;border-top:1px solid #eef0f3;font-size:12px;color:#9ca3af;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media (max-width:640px){body{padding:0}.sheet{border-radius:0;box-shadow:none}.brand,.content,.footer{padding-left:20px;padding-right:20px}.doc-title{font-size:25px}}
@media print{html,body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;max-width:none}}
`

// CSP do arquivo gerado: sem scripts, frames, formulários nem recursos externos (imagens/fontes só embutidas)
export const HTML_DOCUMENT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'"

export const HTML_TEMPLATE_LIMITS = { nameChars: 120, htmlBytes: 512 * 1024 }

/** Marcadores aceitos nos templates; `{{conteudo}}` é obrigatório */
export const HTML_TEMPLATE_PLACEHOLDERS = [
  { key: 'conteudo', label: 'Texto escrito no editor (obrigatório)' },
  { key: 'titulo', label: 'Título do documento' },
  { key: 'autor', label: 'Quem salvou por último' },
  { key: 'data', label: 'Data da última alteração' },
  { key: 'workspace', label: 'Nome do workspace' }
]

const PLACEHOLDER_KEYS = HTML_TEMPLATE_PLACEHOLDERS.map(item => item.key)
const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g

// Construções proibidas em templates. A CSP (meta no arquivo + header no download + iframe sandbox) já bloqueia
// a execução; recusar na gravação deixa o erro claro para quem escreveu o template.
const FORBIDDEN_TEMPLATE_RULES = [
  { pattern: /<\s*script\b/i, message: 'Scripts (<script>) não são permitidos' },
  {
    pattern: /<\s*(iframe|frame|frameset|object|embed|applet|portal)\b/i,
    message: 'Frames e objetos embutidos não são permitidos'
  },
  { pattern: /<\s*(form|input|button|textarea|select)\b/i, message: 'Formulários não são permitidos' },
  { pattern: /<\s*(base|link)\b/i, message: 'Use estilos dentro de <style>; <link> e <base> não são permitidos' },
  { pattern: /<\s*meta\b[^>]*http-equiv/i, message: '<meta http-equiv> não é permitido' },
  { pattern: /<[^>]*[\s/"']on[a-z]+\s*=/i, message: 'Atributos de evento (onclick, onload...) não são permitidos' },
  { pattern: /\bsrcdoc\s*=/i, message: 'O atributo srcdoc não é permitido' },
  { pattern: /(java|vb)script\s*:/i, message: 'Links javascript: não são permitidos' },
  { pattern: /@import\b/i, message: '@import não é permitido; deixe todo o CSS no próprio template' }
]

export class HtmlTemplateError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

/** Valida o HTML de um template (lança HtmlTemplateError). Retorna o HTML sem espaços nas pontas. */
export function validateHtmlTemplate(html) {
  if (typeof html !== 'string' || !html.trim()) throw new HtmlTemplateError('Informe o HTML do template')

  if (new TextEncoder().encode(html).length > HTML_TEMPLATE_LIMITS.htmlBytes) {
    throw new HtmlTemplateError('O template deve ter no máximo 512 KB', 413)
  }

  for (const rule of FORBIDDEN_TEMPLATE_RULES) {
    if (rule.pattern.test(html)) throw new HtmlTemplateError(rule.message)
  }

  const used = [...html.matchAll(PLACEHOLDER_PATTERN)].map(match => match[1])
  const unknown = [...new Set(used.filter(key => !PLACEHOLDER_KEYS.includes(key)))]

  if (unknown.length) {
    throw new HtmlTemplateError(
      `Marcador desconhecido: ${unknown.map(key => `{{${key}}}`).join(', ')}. Use ${PLACEHOLDER_KEYS.map(key => `{{${key}}}`).join(', ')}`
    )
  }

  if (!used.includes('conteudo')) throw new HtmlTemplateError('O template precisa ter o marcador {{conteudo}}')

  return html.trim()
}

/**
 * Monta o arquivo final: preenche os marcadores (valores escapados; o conteúdo vem do renderizador) e põe a CSP
 * antes de qualquer marcação do template, para valer no documento inteiro.
 */
export function applyHtmlTemplate(template, { title, bodyHtml, author, date, workspaceName }) {
  const values = {
    conteudo: bodyHtml,
    titulo: escapeHtml(title),
    autor: escapeHtml(author || '—'),
    data: escapeHtml(date),
    workspace: escapeHtml(workspaceName || '')
  }

  const filled = String(template)
    .replace(/^﻿/, '')
    .replace(/^\s*<!doctype[^>]*>/i, '')
    .replace(PLACEHOLDER_PATTERN, (match, key) => (key in values ? values[key] : ''))

  return `<!doctype html>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${HTML_DOCUMENT_CSP}">
${filled.trim()}
`
}

/** Template padrão da Simplifica, no mesmo formato dos templates criados pelos administradores */
export const DEFAULT_HTML_TEMPLATE = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Simplifica">
<title>{{titulo}}</title>
<style>${TEMPLATE_STYLES}</style>
</head>
<body>
<main class="sheet">
<header class="brand">${BRAND_MARK}<span class="brand-name">Simplifica</span></header>
<div class="content">
<h1 class="doc-title">{{titulo}}</h1>
<p class="doc-meta">Atualizado em {{data}} · por {{autor}}</p>
<article class="doc-body">{{conteudo}}</article>
</div>
<footer class="footer"><span>Documento gerado pela Simplifica</span><span>{{workspace}}</span></footer>
</main>
</body>
</html>
`

/**
 * Arquivo HTML completo. `content` é o JSON do editor (é sanitizado aqui de novo); `template` é o HTML de um
 * template do workspace (já validado) ou vazio para o padrão Simplifica.
 */
export function renderHtmlDocument({ title, content, author, workspaceName, updatedAt = new Date(), template }) {
  return applyHtmlTemplate(template || DEFAULT_HTML_TEMPLATE, {
    title: String(title ?? '').trim() || 'Documento sem título',
    bodyHtml: renderHtmlDocumentBody(content),
    author,
    date: formatHtmlDocumentDate(updatedAt),
    workspaceName
  })
}
