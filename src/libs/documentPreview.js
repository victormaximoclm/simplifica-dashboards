import path from 'path'

import { getFileExtension } from '@/libs/documentFileTypes'
import { ZipReadError, openZip, readZipEntries } from '@/libs/zipReader'

/**
 * Pré-visualização estruturada (JSON) dos tipos que o navegador não exibe sozinho:
 * txt, csv, docx, xlsx, pptx e zip. PDF e imagens usam a rota /preview (stream inline).
 *
 * Nada aqui gera HTML: o client renderiza os dados com React, então o conteúdo do arquivo
 * nunca é injetado como marcação (sem risco de XSS).
 */

export const PREVIEW_LIMITS = {
  textChars: 500_000,
  xmlBytesPerPart: 20 * 1024 * 1024,
  rows: 200,
  columns: 30,
  sheets: 10,
  blocks: 2000,
  slides: 100,
  archiveEntries: 1000,
  cellChars: 500
}

export class DocumentPreviewError extends Error {}

export const isPreviewError = error => error instanceof DocumentPreviewError || error instanceof ZipReadError

// ── Utilitários ─────────────────────────────

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXml(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, code) => {
    const named = XML_ENTITIES[code.toLowerCase()]

    if (named) return named

    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)

    return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ''
  })
}

const getAttr = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`))

  return match ? decodeXml(match[1]) : ''
}

const clip = value => (value.length > PREVIEW_LIMITS.cellChars ? `${value.slice(0, PREVIEW_LIMITS.cellChars)}…` : value)

/** Texto de todos os <prefix:t> de um trecho de XML */
const collectText = (xml, tag) =>
  [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g'))].map(match => decodeXml(match[1])).join('')

/** UTF-8 com BOM removido; se houver bytes inválidos, assume Windows-1252/Latin-1 (comum em CSV do Excel) */
function decodeText(buffer) {
  const utf8 = buffer.toString('utf8').replace(/^﻿/, '')

  return utf8.includes('�') ? buffer.toString('latin1') : utf8
}

function parseRelationships(xml) {
  const map = {}

  for (const [tag] of xml.matchAll(/<Relationship\b[^>]*>/g)) map[getAttr(tag, 'Id')] = getAttr(tag, 'Target')

  return map
}

/** Resolve o alvo de um relacionamento OOXML relativo à pasta da parte de origem */
const resolvePart = (baseDir, target) =>
  target.startsWith('/') ? target.slice(1) : path.posix.normalize(path.posix.join(baseDir, target))

function columnIndex(ref) {
  const letters = (ref.match(/^[A-Z]+/i)?.[0] ?? '').toUpperCase()

  return [...letters].reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1
}

// ── Texto e CSV ─────────────────────────────

function previewText(buffer) {
  const text = decodeText(buffer)

  return {
    kind: 'text',
    text: text.slice(0, PREVIEW_LIMITS.textChars),
    truncated: text.length > PREVIEW_LIMITS.textChars
  }
}

function previewCsv(buffer) {
  const text = decodeText(buffer)
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const count = char => firstLine.split(char).length - 1
  const delimiter = [';', ',', '\t'].reduce((best, char) => (count(char) > count(best) ? char : best), ';')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let truncated = false

  const pushRow = () => {
    row.push(field)
    rows.push(row)
    row = []
    field = ''
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }

      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      pushRow()

      if (rows.length >= PREVIEW_LIMITS.rows) {
        truncated = i < text.length - 1
        break
      }
    } else {
      field += char
    }
  }

  if (!truncated && (field || row.length)) pushRow()

  const wide = rows.some(cells => cells.length > PREVIEW_LIMITS.columns)

  return {
    kind: 'table',
    sheets: [
      {
        name: 'CSV',
        rows: rows.map(cells => cells.slice(0, PREVIEW_LIMITS.columns).map(clip)),
        truncated: truncated || wide
      }
    ]
  }
}

// ── DOCX ────────────────────────────────────

const isOn = (properties, tag) =>
  new RegExp(`<w:${tag}(?:\\s+w:val="(?!0"|false"|none")[^"]*")?\\s*/>`).test(properties)

function parseDocxRuns(paragraphXml) {
  const runs = []

  for (const [, runXml] of paragraphXml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)) {
    const properties = runXml.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? ''
    let text = ''

    for (const [token, content] of runXml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
      if (token.startsWith('<w:tab')) text += '\t'
      else if (token.startsWith('<w:br')) text += '\n'
      else text += decodeXml(content)
    }

    if (text)
      runs.push({ text, bold: isOn(properties, 'b'), italic: isOn(properties, 'i'), underline: isOn(properties, 'u') })
  }

  return runs
}

function parseDocxParagraph(xml) {
  const style = xml.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? ''
  const headingMatch = style.match(/(?:heading|t[ií]tulo)\s*([1-6])/i)
  const heading = headingMatch ? Number(headingMatch[1]) : /^(title|t[ií]tulo)$/i.test(style) ? 1 : 0

  return { type: 'paragraph', heading, list: /<w:numPr>/.test(xml), runs: parseDocxRuns(xml) }
}

function parseDocxTable(xml) {
  return [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].slice(0, PREVIEW_LIMITS.rows).map(([rowXml]) =>
    [...rowXml.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].slice(0, PREVIEW_LIMITS.columns).map(([cellXml]) =>
      clip(
        [...cellXml.matchAll(/<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)]
          .map(([paragraphXml]) =>
            parseDocxRuns(paragraphXml)
              .map(run => run.text)
              .join('')
          )
          .join('\n')
      )
    )
  )
}

function previewDocx(buffer) {
  const zip = openZip(buffer, PREVIEW_LIMITS.xmlBytesPerPart)
  const xml = zip.readText('word/document.xml')
  const body = xml.match(/<w:body\b[^>]*>([\s\S]*)<\/w:body>/)?.[1] ?? ''
  const blocks = []
  let truncated = false

  for (const [element] of body.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)) {
    if (blocks.length >= PREVIEW_LIMITS.blocks) {
      truncated = true
      break
    }

    blocks.push(
      element.startsWith('<w:tbl') ? { type: 'table', rows: parseDocxTable(element) } : parseDocxParagraph(element)
    )
  }

  return { kind: 'document', blocks, truncated }
}

// ── XLSX ────────────────────────────────────

function parseSheet(xml, sharedStrings) {
  const rows = []
  let truncated = false
  let nextRow = 0

  for (const [rowTag, rowContent = ''] of xml.matchAll(/<row\b[^>]*\/>|<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(getAttr(rowTag, 'r')) || nextRow + 1
    const rowIndex = rowNumber - 1

    nextRow = rowNumber

    if (rowIndex >= PREVIEW_LIMITS.rows) {
      truncated = true
      break
    }

    const cells = []
    let nextColumn = 0

    for (const [, attrs, inner = ''] of rowContent.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = getAttr(` ${attrs}`, 'r')
      const column = ref ? columnIndex(ref) : nextColumn

      nextColumn = column + 1

      if (column >= PREVIEW_LIMITS.columns) {
        truncated = true
        continue
      }

      const type = getAttr(` ${attrs}`, 't')
      const raw = decodeXml(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '')

      const value =
        type === 's'
          ? (sharedStrings[Number(raw)] ?? '')
          : type === 'inlineStr'
            ? collectText(inner, 't')
            : type === 'b'
              ? raw === '1'
                ? 'VERDADEIRO'
                : 'FALSO'
              : raw

      cells[column] = clip(value)
    }

    rows[rowIndex] = Array.from(cells, cell => cell ?? '')
  }

  return { rows: Array.from(rows, row => row ?? []), truncated }
}

function previewXlsx(buffer) {
  const zip = openZip(buffer, PREVIEW_LIMITS.xmlBytesPerPart)
  const workbook = zip.readText('xl/workbook.xml')

  const relationships = zip.has('xl/_rels/workbook.xml.rels')
    ? parseRelationships(zip.readText('xl/_rels/workbook.xml.rels'))
    : {}

  const sharedStrings = zip.has('xl/sharedStrings.xml')
    ? [...zip.readText('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, item]) =>
        collectText(item, 't')
      )
    : []

  const sheetTags = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map(([tag]) => tag)

  const sheets = sheetTags.slice(0, PREVIEW_LIMITS.sheets).map(tag => {
    const target = relationships[getAttr(tag, 'r:id')]
    const name = getAttr(tag, 'name') || 'Planilha'

    if (!target) return { name, rows: [], truncated: false }

    return { name, ...parseSheet(zip.readText(resolvePart('xl', target)), sharedStrings) }
  })

  return { kind: 'table', sheets, truncatedSheets: sheetTags.length > PREVIEW_LIMITS.sheets }
}

// ── PPTX ────────────────────────────────────

function previewPptx(buffer) {
  const zip = openZip(buffer, PREVIEW_LIMITS.xmlBytesPerPart)
  const presentation = zip.readText('ppt/presentation.xml')
  const relationships = parseRelationships(zip.readText('ppt/_rels/presentation.xml.rels'))
  const slideIds = [...presentation.matchAll(/<p:sldId\b[^>]*>/g)].map(([tag]) => getAttr(tag, 'r:id'))

  const slides = slideIds.slice(0, PREVIEW_LIMITS.slides).map((relationshipId, index) => {
    const target = relationships[relationshipId]
    const xml = target ? zip.readText(resolvePart('ppt', target)) : ''

    const paragraphs = [...xml.matchAll(/<a:p\b[^>]*\/>|<a:p\b[^>]*>[\s\S]*?<\/a:p>/g)]
      .map(([paragraph]) => collectText(paragraph, 'a:t').trim())
      .filter(Boolean)

    return { number: index + 1, paragraphs }
  })

  return { kind: 'slides', slides, truncated: slideIds.length > PREVIEW_LIMITS.slides }
}

// ── ZIP ─────────────────────────────────────

function previewArchive(buffer) {
  const { entries, total } = readZipEntries(buffer)

  return {
    kind: 'archive',
    total,
    entries: entries
      .slice(0, PREVIEW_LIMITS.archiveEntries)
      .map(({ name, size, isDirectory, encrypted }) => ({ name, size, isDirectory, encrypted })),
    truncated: total > PREVIEW_LIMITS.archiveEntries
  }
}

// ── Entrada ─────────────────────────────────

// Documento do editor: o HTML vai inteiro e o client exibe num iframe com sandbox (sem scripts nem mesma origem)
function previewHtml(buffer) {
  if (buffer.length > PREVIEW_LIMITS.xmlBytesPerPart) {
    throw new DocumentPreviewError('Conteúdo grande demais para pré-visualizar')
  }

  return { kind: 'html', html: buffer.toString('utf8') }
}

const BUILDERS = {
  html: previewHtml,
  txt: previewText,
  csv: previewCsv,
  docx: previewDocx,
  xlsx: previewXlsx,
  pptx: previewPptx,
  zip: previewArchive
}

export const hasStructuredPreview = name => !!BUILDERS[getFileExtension(name)]

/** Monta a pré-visualização; lança DocumentPreviewError/ZipReadError (erros esperados, mensagem para o usuário) */
export function buildDocumentPreview({ name, buffer }) {
  const builder = BUILDERS[getFileExtension(name)]

  if (!builder) throw new DocumentPreviewError('Pré-visualização estruturada não disponível para este tipo de arquivo')

  return builder(buffer)
}
