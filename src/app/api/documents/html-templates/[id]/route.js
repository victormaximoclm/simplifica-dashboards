export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { parseBody, updateHtmlTemplateSchema } from '@/libs/validations'
import { canDeleteDocuments, canEditDocuments } from '@/libs/documentPermissions'
import { resolveDocumentsWorkspace, withDocumentErrorHandling } from '@/libs/documentAccess'
import {
  htmlTemplateInclude,
  isHtmlTemplateNameTaken,
  isUniqueViolation,
  prepareHtmlTemplate,
  readHtmlDocumentBody,
  serializeHtmlTemplate
} from '@/libs/documentHtmlRequest'

const PROFILE_RULES = { edit: canEditDocuments, delete: canDeleteDocuments }

const templateNotFound = requestId =>
  jsonWithRequestId({ message: 'Template não encontrado' }, { status: 404, requestId })

/** Sessão (401) → perfil (403) → template existe (404) → workspace do template permite a ação (403) */
async function authorizeTemplate(session, id, action) {
  if (!session) return { ok: false, status: 401, message: 'Não autorizado' }
  if (!PROFILE_RULES[action](session.user)) return { ok: false, status: 403, message: 'Acesso negado' }

  const template = await prisma.documentHtmlTemplate.findUnique({ where: { id }, include: htmlTemplateInclude })

  if (!template) return { ok: false, status: 404, message: 'Template não encontrado' }

  const access = await resolveDocumentsWorkspace(session, template.workspaceId, action)

  return access.ok ? { ok: true, template } : access
}

// PUT /api/documents/html-templates/:id - nome e HTML. Documentos já gerados só mudam quando forem reeditados.
async function handlePut(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await authorizeTemplate(session, id, 'edit')

  if (!access.ok) {
    logger.warn('document-template-update-denied', { requestId, templateId: id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const { body, tooLarge } = await readHtmlDocumentBody(req)

  if (tooLarge) {
    return jsonWithRequestId({ message: 'O template deve ter no máximo 512 KB' }, { status: 413, requestId })
  }

  const parsed = parseBody(updateHtmlTemplateSchema, body)

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const prepared = prepareHtmlTemplate(parsed.data.html)

  if (!prepared.html) {
    return jsonWithRequestId({ message: prepared.message }, { status: prepared.status, requestId })
  }

  const { name } = parsed.data

  const nameTaken = () =>
    jsonWithRequestId({ message: 'Já existe um template com esse nome neste workspace' }, { status: 409, requestId })

  if (await isHtmlTemplateNameTaken(access.template.workspaceId, name, id)) return nameTaken()

  let template

  try {
    template = await prisma.documentHtmlTemplate.update({
      where: { id },
      data: { name, html: prepared.html },
      include: htmlTemplateInclude
    })
  } catch (error) {
    if (isUniqueViolation(error)) return nameTaken()
    if (error?.code === 'P2025') return templateNotFound(requestId)

    throw error
  }

  logger.info('document-template-update-success', { requestId, userId: session.user.id, templateId: id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: template.workspaceId,
    action: 'DOCUMENT_TEMPLATE_UPDATE',
    resource: 'document_html_template',
    resourceId: id,
    before: { name: access.template.name, size: access.template.html.length },
    after: { name, size: prepared.html.length },
    metadata: { requestId },
    requestId
  })

  return jsonWithRequestId({ data: serializeHtmlTemplate(template) }, { requestId })
}

// DELETE /api/documents/html-templates/:id - os documentos que o usavam passam a reeditar com o padrão Simplifica
async function handleDelete(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await authorizeTemplate(session, id, 'delete')

  if (!access.ok) {
    logger.warn('document-template-delete-denied', { requestId, templateId: id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const { count } = await prisma.documentHtmlTemplate.deleteMany({ where: { id } })

  if (!count) return templateNotFound(requestId)

  logger.info('document-template-delete-success', { requestId, userId: session.user.id, templateId: id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: access.template.workspaceId,
    action: 'DOCUMENT_TEMPLATE_DELETE',
    resource: 'document_html_template',
    resourceId: id,
    before: { name: access.template.name, documentsCount: access.template._count.documents },
    metadata: { requestId },
    requestId
  })

  return jsonWithRequestId({ data: { id } }, { requestId })
}

export const PUT = withDocumentErrorHandling('document-template-update-unhandled-error', handlePut)
export const DELETE = withDocumentErrorHandling('document-template-delete-unhandled-error', handleDelete)
