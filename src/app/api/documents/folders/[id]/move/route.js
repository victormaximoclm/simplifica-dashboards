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
  MAX_FOLDER_DEPTH,
  assertNameAvailable,
  documentCreatorInclude,
  findFolderInWorkspace,
  getAuthorizedDocumentItem,
  getFolderPath,
  getFolderSubtree,
  lockDocumentParent,
  serializeFolder,
  withDocumentErrorHandling
} from '@/libs/documentAccess'

// POST /api/documents/folders/:id/move - move pasta para outra pasta ou para a raiz (SuperAdmin/SubAdmin)
async function handlePost(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (!canEditDocuments(session.user)) {
    logger.warn('document-folder-move-forbidden', { requestId, userId: session.user.id, role: session.user.role })

    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const parsed = parseBody(moveSchema, await req.json().catch(() => null))

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const access = await getAuthorizedDocumentItem({ kind: 'folder', id, session, action: 'edit' })

  if (!access.ok) {
    logger.warn('document-folder-move-denied', { requestId, userId: session.user.id, folderId: id })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const existing = access.item
  const targetFolderId = parsed.data.targetFolderId || null

  if (targetFolderId === existing.parentId) {
    return jsonWithRequestId(serializeFolder(existing), { requestId })
  }

  const { ids: subtreeIds, height } = await getFolderSubtree(id)

  if (targetFolderId) {
    if (subtreeIds.includes(targetFolderId)) {
      return jsonWithRequestId(
        { message: 'Não é possível mover uma pasta para dentro dela mesma ou de uma subpasta' },
        { status: 400, requestId }
      )
    }

    const target = await findFolderInWorkspace(targetFolderId, existing.workspaceId)

    if (!target) {
      return jsonWithRequestId({ message: 'Pasta de destino não encontrada' }, { status: 404, requestId })
    }
  }

  const targetDepth = targetFolderId ? (await getFolderPath(targetFolderId)).length : 0

  if (targetDepth + height > MAX_FOLDER_DEPTH) {
    return jsonWithRequestId(
      { message: `O destino ultrapassaria o limite de ${MAX_FOLDER_DEPTH} níveis de pastas` },
      { status: 400, requestId }
    )
  }

  let folder

  try {
    folder = await prisma.$transaction(async tx => {
      await lockDocumentParent(tx, existing.workspaceId, targetFolderId)
      await assertNameAvailable(tx, {
        kind: 'folder',
        workspaceId: existing.workspaceId,
        parentId: targetFolderId,
        name: existing.name,
        excludeId: id
      })

      return tx.documentFolder.update({
        where: { id },
        data: { parentId: targetFolderId },
        include: documentCreatorInclude
      })
    })
  } catch (error) {
    if (error instanceof DocumentConflictError) {
      return jsonWithRequestId({ message: error.message }, { status: 409, requestId })
    }

    logger.error('document-folder-move-error', { requestId, folderId: id, error: error.message })

    return jsonWithRequestId({ message: 'Erro ao mover pasta' }, { status: 500, requestId })
  }

  logger.info('document-folder-move-success', { requestId, userId: session.user.id, folderId: id, targetFolderId })
  await createAuditLog({
    userId: session.user.id,
    tenantId: folder.workspaceId,
    action: 'DOCUMENT_FOLDER_MOVE',
    resource: 'document_folder',
    resourceId: id,
    before: { parentId: existing.parentId },
    after: { parentId: folder.parentId },
    metadata: { requestId },
    requestId
  })

  return jsonWithRequestId(serializeFolder(folder), { requestId })
}

export const POST = withDocumentErrorHandling('document-folder-move-unhandled-error', handlePost)
