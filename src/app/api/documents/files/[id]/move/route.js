export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { moveSchema, parseBody } from '@/libs/validations'
import { canEditDocuments } from '@/libs/documentPermissions'
import {
  DocumentConflictError,
  assertNameAvailable,
  documentCreatorInclude,
  findFolderInWorkspace,
  getAuthorizedDocumentItem,
  lockDocumentParent,
  serializeFile,
  withDocumentErrorHandling
} from '@/libs/documentAccess'

// POST /api/documents/files/:id/move - move arquivo para outra pasta ou para a raiz (SuperAdmin/SubAdmin)
async function handlePost(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (!canEditDocuments(session.user)) {
    logger.warn('document-file-move-forbidden', { requestId, userId: session.user.id, role: session.user.role })

    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const parsed = parseBody(moveSchema, await req.json().catch(() => null))

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const access = await getAuthorizedDocumentItem({ kind: 'file', id, session, action: 'edit' })

  if (!access.ok) {
    logger.warn('document-file-move-denied', { requestId, userId: session.user.id, fileId: id })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const existing = access.item
  const targetFolderId = parsed.data.targetFolderId || null

  if (targetFolderId === existing.folderId) {
    return jsonWithRequestId(serializeFile(existing), { requestId })
  }

  if (targetFolderId && !(await findFolderInWorkspace(targetFolderId, existing.workspaceId))) {
    return jsonWithRequestId({ message: 'Pasta de destino não encontrada' }, { status: 404, requestId })
  }

  let file

  try {
    file = await prisma.$transaction(async tx => {
      await lockDocumentParent(tx, existing.workspaceId, targetFolderId)
      await assertNameAvailable(tx, {
        kind: 'file',
        workspaceId: existing.workspaceId,
        parentId: targetFolderId,
        name: existing.name,
        excludeId: id
      })

      return tx.documentFile.update({
        where: { id },
        data: { folderId: targetFolderId },
        include: documentCreatorInclude
      })
    })
  } catch (error) {
    if (error instanceof DocumentConflictError) {
      return jsonWithRequestId({ message: error.message }, { status: 409, requestId })
    }

    logger.error('document-file-move-error', { requestId, fileId: id, error: error.message })

    return jsonWithRequestId({ message: 'Erro ao mover arquivo' }, { status: 500, requestId })
  }

  logger.info('document-file-move-success', { requestId, userId: session.user.id, fileId: id, targetFolderId })
  await createAuditLog({
    userId: session.user.id,
    tenantId: file.workspaceId,
    action: 'DOCUMENT_FILE_MOVE',
    resource: 'document_file',
    resourceId: id,
    before: { folderId: existing.folderId },
    after: { folderId: file.folderId },
    metadata: { requestId },
    requestId
  })

  return jsonWithRequestId(serializeFile(file), { requestId })
}

export const POST = withDocumentErrorHandling('document-file-move-unhandled-error', handlePost)
