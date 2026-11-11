// Helpers de servidor das rotas de documentos HTML (/api/documents/html)
import {
  HtmlDocumentContentError,
  HtmlTemplateError,
  isHtmlDocumentEmpty,
  sanitizeHtmlDocumentContent,
  validateHtmlTemplate
} from '@/libs/documentHtml'
import { prisma } from '@/libs/prisma'

// JSON do editor (até 1 MB depois de limpo) + folga para título/ids
const HTML_DOCUMENT_MAX_REQUEST_BYTES = 2 * 1024 * 1024

/** Lê o corpo JSON respeitando o limite: { tooLarge } ou { body } (null se não for JSON) */
export async function readHtmlDocumentBody(req) {
  if (Number(req.headers.get('content-length') || 0) > HTML_DOCUMENT_MAX_REQUEST_BYTES) return { tooLarge: true }

  const text = await req.text().catch(() => '')

  if (text.length > HTML_DOCUMENT_MAX_REQUEST_BYTES) return { tooLarge: true }

  try {
    return { body: JSON.parse(text) }
  } catch {
    return { body: null }
  }
}

/** Limpa o conteúdo do editor: { content } ou { status, message } (400 vazio/inválido, 413 grande demais) */
export function prepareHtmlDocumentContent(rawContent) {
  try {
    const content = sanitizeHtmlDocumentContent(rawContent)

    if (isHtmlDocumentEmpty(content)) return { status: 400, message: 'Escreva o conteúdo do documento' }

    return { content }
  } catch (error) {
    if (error instanceof HtmlDocumentContentError) return { status: error.status, message: error.message }

    throw error
  }
}

/** Valida o HTML de um template: { html } ou { status, message } */
export function prepareHtmlTemplate(rawHtml) {
  try {
    return { html: validateHtmlTemplate(rawHtml) }
  } catch (error) {
    if (error instanceof HtmlTemplateError) return { status: error.status, message: error.message }

    throw error
  }
}

/**
 * Template escolhido para um documento, sempre do mesmo workspace do documento.
 * { template } (null = padrão Simplifica) ou { status, message }.
 */
export async function resolveHtmlTemplate(templateId, workspaceId) {
  if (!templateId) return { template: null }

  const template = await prisma.documentHtmlTemplate.findFirst({
    where: { id: templateId, workspaceId },
    select: { id: true, name: true, html: true }
  })

  return template ? { template } : { status: 404, message: 'Template não encontrado neste workspace' }
}

// Template removido entre a escolha e a gravação (violação da FK templateId)
export const isMissingTemplateError = error => error?.code === 'P2003'

export const isUniqueViolation = error => error?.code === 'P2002'

export const htmlTemplateInclude = {
  createdBy: { select: { id: true, name: true } },
  _count: { select: { documents: true } }
}

export function serializeHtmlTemplate(template) {
  return {
    id: template.id,
    workspaceId: template.workspaceId,
    name: template.name,
    html: template.html,
    documentsCount: template._count?.documents ?? 0,
    createdBy: template.createdBy ?? null,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt
  }
}

/** Nome já usado no workspace (sem diferenciar maiúsculas); `exceptId` ignora o próprio template na edição */
export async function isHtmlTemplateNameTaken(workspaceId, name, exceptId = null) {
  const existing = await prisma.documentHtmlTemplate.findFirst({
    where: { workspaceId, name: { equals: name, mode: 'insensitive' }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true }
  })

  return !!existing
}
