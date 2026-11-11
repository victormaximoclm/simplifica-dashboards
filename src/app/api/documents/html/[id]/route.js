export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import * as storage from '@/libs/storage'
import { parseBody, updateHtmlDocumentSchema } from '@/libs/validations'
import { canEditDocuments } from '@/libs/documentPermissions'
import { HTML_DOCUMENT_MIME } from '@/libs/documentFileTypes'
import { renderHtmlDocument } from '@/libs/documentHtml'
import {
  isMissingTemplateError,
  prepareHtmlDocumentContent,
  readHtmlDocumentBody,
  resolveHtmlTemplate
} from '@/libs/documentHtmlRequest'
import {
  documentCreatorInclude,
  getAuthorizedDocumentItem,
  serializeFile,
  withDocumentErrorHandling
} from '@/libs/documentAccess'

const notHtmlDocument = requestId =>
  jsonWithRequestId({ message: 'Este arquivo não é um documento editável' }, { status: 415, requestId })

// GET /api/documents/html/:id - conteúdo editável (título + JSON do editor)
async function handleGet(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedDocumentItem({ kind: 'file', id, session, action: 'view' })

  if (!access.ok) {
    logger.warn('document-html-read-denied', { requestId, fileId: id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const source =
    access.item.mimeType === HTML_DOCUMENT_MIME
      ? await prisma.documentHtmlContent.findUnique({ where: { fileId: id } })
      : null

  if (!source) return notHtmlDocument(requestId)

  return jsonWithRequestId(
    { file: serializeFile(access.item), title: source.title, content: source.content, templateId: source.templateId },
    { headers: { 'Cache-Control': 'private, no-store' }, requestId }
  )
}

// PUT /api/documents/html/:id - atualiza título/conteúdo e regrava o .html (SuperAdmin/SubAdmin)
async function handlePut(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (!canEditDocuments(session.user)) {
    logger.warn('document-html-update-forbidden', { requestId, userId: session.user.id, role: session.user.role })

    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const { body, tooLarge } = await readHtmlDocumentBody(req)

  if (tooLarge) {
    return jsonWithRequestId({ message: 'O documento é grande demais' }, { status: 413, requestId })
  }

  const parsed = parseBody(updateHtmlDocumentSchema, body)

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const prepared = prepareHtmlDocumentContent(parsed.data.content)

  if (!prepared.content) {
    return jsonWithRequestId({ message: prepared.message }, { status: prepared.status, requestId })
  }

  const access = await getAuthorizedDocumentItem({ kind: 'file', id, session, action: 'edit' })

  if (!access.ok) {
    logger.warn('document-html-update-denied', { requestId, userId: session.user.id, fileId: id })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  if (access.item.mimeType !== HTML_DOCUMENT_MIME) return notHtmlDocument(requestId)

  const { title } = parsed.data
  const chosen = await resolveHtmlTemplate(parsed.data.templateId, access.item.workspaceId)

  if (chosen.status) {
    return jsonWithRequestId({ message: chosen.message }, { status: chosen.status, requestId })
  }

  const templateId = chosen.template?.id ?? null

  const buffer = Buffer.from(
    renderHtmlDocument({
      title,
      content: prepared.content,
      author: session.user.name || session.user.email,
      workspaceName: access.workspace.name,
      template: chosen.template?.html
    }),
    'utf8'
  )

  // Grava num blob novo (o storage nunca sobrescreve) e troca a referência na transação
  const storageKey = storage.generateStorageKey(access.item.workspaceId)

  try {
    await storage.put(storageKey, buffer)
  } catch (error) {
    logger.error('document-html-update-storage-error', { requestId, fileId: id, error: error.message })

    return jsonWithRequestId({ message: 'Erro ao gravar documento' }, { status: 500, requestId })
  }

  let result
  let missingTemplate = false

  try {
    result = await prisma.$transaction(async tx => {
      // Trava a linha: com edições simultâneas, cada uma remove exatamente o blob que substituiu
      const [locked] = await tx.$queryRaw`SELECT "storageKey" FROM "DocumentFile" WHERE "id" = ${id} FOR UPDATE`
      const source = locked ? await tx.documentHtmlContent.findUnique({ where: { fileId: id } }) : null

      if (!source) return null

      const file = await tx.documentFile.update({
        where: { id },
        data: {
          size: buffer.length,
          storageKey,
          htmlContent: { update: { title, content: prepared.content, templateId } }
        },
        include: documentCreatorInclude
      })

      return {
        file,
        previousKey: locked.storageKey,
        previousTitle: source.title,
        previousTemplateId: source.templateId
      }
    })
  } catch (error) {
    logger.error('document-html-update-error', { requestId, fileId: id, error: error.message })
    result = undefined
    missingTemplate = isMissingTemplateError(error)
  }

  if (!result) {
    await storage.delete(storageKey).catch(cleanupError => {
      logger.error('document-html-update-cleanup-error', { requestId, fileId: id, error: cleanupError.message })
    })

    if (missingTemplate) {
      return jsonWithRequestId(
        { message: 'O template escolhido foi removido; escolha outro' },
        { status: 409, requestId }
      )
    }

    return result === null
      ? notHtmlDocument(requestId)
      : jsonWithRequestId({ message: 'Erro ao salvar documento' }, { status: 500, requestId })
  }

  try {
    await storage.delete(result.previousKey)
  } catch (error) {
    logger.error('document-html-update-old-blob-error', { requestId, fileId: id, error: error.message })
  }

  logger.info('document-html-update-success', { requestId, userId: session.user.id, fileId: id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: result.file.workspaceId,
    action: 'DOCUMENT_HTML_UPDATE',
    resource: 'document_file',
    resourceId: id,
    before: { title: result.previousTitle, size: access.item.size, templateId: result.previousTemplateId },
    after: { title, size: result.file.size, templateId },
    metadata: { requestId },
    requestId
  })

  return jsonWithRequestId({ data: serializeFile(result.file) }, { requestId })
}

export const GET = withDocumentErrorHandling('document-html-read-unhandled-error', handleGet)
export const PUT = withDocumentErrorHandling('document-html-update-unhandled-error', handlePut)
