export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { createNotification } from '@/libs/notifications'
import { prisma } from '@/libs/prisma'
import * as storage from '@/libs/storage'
import { createHtmlDocumentSchema, parseBody } from '@/libs/validations'
import { canCreateDocuments } from '@/libs/documentPermissions'
import { HTML_DOCUMENT_MIME } from '@/libs/documentFileTypes'
import { htmlDocumentFileName, renderHtmlDocument } from '@/libs/documentHtml'
import {
  isMissingTemplateError,
  prepareHtmlDocumentContent,
  readHtmlDocumentBody,
  resolveHtmlTemplate
} from '@/libs/documentHtmlRequest'
import {
  DocumentConflictError,
  assertNameAvailable,
  documentCreatorInclude,
  findFolderInWorkspace,
  lockDocumentParent,
  resolveDocumentsWorkspace,
  serializeFile,
  withDocumentErrorHandling
} from '@/libs/documentAccess'

// POST /api/documents/html - cria documento HTML a partir do editor (SuperAdmin/SubAdmin)
async function handlePost(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    logger.warn('document-html-create-unauthorized', { requestId })

    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (!canCreateDocuments(session.user)) {
    logger.warn('document-html-create-forbidden', { requestId, userId: session.user.id, role: session.user.role })

    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const { body, tooLarge } = await readHtmlDocumentBody(req)

  if (tooLarge) {
    return jsonWithRequestId({ message: 'O documento é grande demais' }, { status: 413, requestId })
  }

  const parsed = parseBody(createHtmlDocumentSchema, body)

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const { workspaceId, title } = parsed.data
  const folderId = parsed.data.folderId || null
  const prepared = prepareHtmlDocumentContent(parsed.data.content)

  if (!prepared.content) {
    return jsonWithRequestId({ message: prepared.message }, { status: prepared.status, requestId })
  }

  const access = await resolveDocumentsWorkspace(session, workspaceId, 'create')

  if (!access.ok) {
    logger.warn('document-html-create-denied', { requestId, userId: session.user.id, workspaceId })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const { workspace } = access

  if (folderId && !(await findFolderInWorkspace(folderId, workspace.id))) {
    return jsonWithRequestId({ message: 'Pasta de destino não encontrada' }, { status: 404, requestId })
  }

  const chosen = await resolveHtmlTemplate(parsed.data.templateId, workspace.id)

  if (chosen.status) {
    return jsonWithRequestId({ message: chosen.message }, { status: chosen.status, requestId })
  }

  const templateId = chosen.template?.id ?? null

  const name = htmlDocumentFileName(title)

  const buffer = Buffer.from(
    renderHtmlDocument({
      title,
      content: prepared.content,
      author: session.user.name || session.user.email,
      workspaceName: workspace.name,
      template: chosen.template?.html
    }),
    'utf8'
  )

  const storageKey = storage.generateStorageKey(workspace.id)

  try {
    await storage.put(storageKey, buffer)
  } catch (error) {
    logger.error('document-html-create-storage-error', { requestId, error: error.message })

    return jsonWithRequestId({ message: 'Erro ao gravar documento' }, { status: 500, requestId })
  }

  let file

  try {
    file = await prisma.$transaction(async tx => {
      await lockDocumentParent(tx, workspace.id, folderId)
      await assertNameAvailable(tx, { kind: 'file', workspaceId: workspace.id, parentId: folderId, name })

      return tx.documentFile.create({
        data: {
          name,
          folderId,
          workspaceId: workspace.id,
          mimeType: HTML_DOCUMENT_MIME,
          size: buffer.length,
          storageKey,
          createdById: session.user.id,
          htmlContent: { create: { title, content: prepared.content, templateId } }
        },
        include: documentCreatorInclude
      })
    })
  } catch (error) {
    await storage.delete(storageKey).catch(cleanupError => {
      logger.error('document-html-create-cleanup-error', { requestId, error: cleanupError.message })
    })

    if (error instanceof DocumentConflictError) {
      return jsonWithRequestId({ message: error.message }, { status: 409, requestId })
    }

    if (isMissingTemplateError(error)) {
      return jsonWithRequestId(
        { message: 'O template escolhido foi removido; escolha outro' },
        { status: 409, requestId }
      )
    }

    logger.error('document-html-create-error', { requestId, error: error.message })

    return jsonWithRequestId({ message: 'Erro ao salvar documento' }, { status: 500, requestId })
  }

  await createNotification({
    type: 'document_uploaded',
    title: 'Novo documento',
    message: `${session.user.name || session.user.email} criou "${file.name}" em ${workspace.name}`,
    workspaceId: workspace.id,
    createdById: session.user.id
  })

  logger.info('document-html-create-success', {
    requestId,
    userId: session.user.id,
    fileId: file.id,
    workspaceId: workspace.id,
    size: file.size
  })
  await createAuditLog({
    userId: session.user.id,
    tenantId: workspace.id,
    action: 'DOCUMENT_HTML_CREATE',
    resource: 'document_file',
    resourceId: file.id,
    after: { name: file.name, title, folderId: file.folderId, size: file.size, templateId },
    metadata: { requestId },
    requestId
  })

  return jsonWithRequestId({ data: serializeFile(file) }, { status: 201, requestId })
}

export const POST = withDocumentErrorHandling('document-html-create-unhandled-error', handlePost)
