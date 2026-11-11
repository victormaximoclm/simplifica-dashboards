export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import * as storage from '@/libs/storage'
import { parseBody, renameSchema } from '@/libs/validations'
import { canDeleteDocuments, canEditDocuments } from '@/libs/documentPermissions'
import {
  DocumentConflictError,
  assertNameAvailable,
  documentCreatorInclude,
  getAuthorizedDocumentItem,
  getFolderSubtree,
  lockDocumentParent,
  serializeFolder,
  withDocumentErrorHandling
} from '@/libs/documentAccess'

// GET /api/documents/folders/:id - dados da pasta + contagem do conteúdo (usado antes de excluir)
async function handleGet(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedDocumentItem({ kind: 'folder', id, session, action: 'view' })

  if (!access.ok) {
    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const { ids } = await getFolderSubtree(id)
  const fileCount = await prisma.documentFile.count({ where: { folderId: { in: ids } } })

  return jsonWithRequestId(
    { ...serializeFolder(access.item), counts: { folders: ids.length - 1, files: fileCount } },
    { requestId }
  )
}

// PATCH /api/documents/folders/:id - renomeia pasta (SuperAdmin/SubAdmin)
async function handlePatch(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (!canEditDocuments(session.user)) {
    logger.warn('document-folder-rename-forbidden', { requestId, userId: session.user.id, role: session.user.role })

    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const parsed = parseBody(renameSchema, await req.json().catch(() => null))

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const access = await getAuthorizedDocumentItem({ kind: 'folder', id, session, action: 'edit' })

  if (!access.ok) {
    logger.warn('document-folder-rename-denied', { requestId, userId: session.user.id, folderId: id })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const existing = access.item
  const { name } = parsed.data

  if (name === existing.name) {
    return jsonWithRequestId(serializeFolder(existing), { requestId })
  }

  let folder

  try {
    folder = await prisma.$transaction(async tx => {
      await lockDocumentParent(tx, existing.workspaceId, existing.parentId)
      await assertNameAvailable(tx, {
        kind: 'folder',
        workspaceId: existing.workspaceId,
        parentId: existing.parentId,
        name,
        excludeId: id
      })

      return tx.documentFolder.update({ where: { id }, data: { name }, include: documentCreatorInclude })
    })
  } catch (error) {
    if (error instanceof DocumentConflictError) {
      return jsonWithRequestId({ message: error.message }, { status: 409, requestId })
    }

    logger.error('document-folder-rename-error', { requestId, folderId: id, error: error.message })

    return jsonWithRequestId({ message: 'Erro ao renomear pasta' }, { status: 500, requestId })
  }

  logger.info('document-folder-rename-success', { requestId, userId: session.user.id, folderId: id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: folder.workspaceId,
    action: 'DOCUMENT_FOLDER_RENAME',
    resource: 'document_folder',
    resourceId: id,
    before: { name: existing.name },
    after: { name: folder.name },
    metadata: { requestId },
    requestId
  })

  return jsonWithRequestId(serializeFolder(folder), { requestId })
}

// DELETE /api/documents/folders/:id - exclui a pasta e todo o conteúdo (SuperAdmin/SubAdmin)
async function handleDelete(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (!canDeleteDocuments(session.user)) {
    logger.warn('document-folder-delete-forbidden', { requestId, userId: session.user.id, role: session.user.role })

    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const access = await getAuthorizedDocumentItem({ kind: 'folder', id, session, action: 'delete' })

  if (!access.ok) {
    logger.warn('document-folder-delete-denied', { requestId, userId: session.user.id, folderId: id })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const existing = access.item
  let deleted

  try {
    deleted = await prisma.$transaction(async tx => {
      const { ids } = await getFolderSubtree(id, tx)

      const files = await tx.documentFile.findMany({
        where: { folderId: { in: ids } },
        select: { id: true, storageKey: true }
      })

      await tx.documentFile.deleteMany({ where: { folderId: { in: ids } } })
      await tx.documentFolder.deleteMany({ where: { id: { in: ids } } })

      // Itens sem blob (Site) têm storageKey nulo e não entram na limpeza do storage
      return {
        folders: ids.length,
        files: files.length,
        storageKeys: files.map(file => file.storageKey).filter(Boolean)
      }
    })
  } catch (error) {
    logger.error('document-folder-delete-error', { requestId, folderId: id, error: error.message })

    return jsonWithRequestId({ message: 'Erro ao excluir pasta' }, { status: 500, requestId })
  }

  // Blobs só são apagados após o commit; falhas ficam no log sem afetar a resposta
  const blobResults = await Promise.allSettled(deleted.storageKeys.map(key => storage.delete(key)))
  const failedBlobs = blobResults.filter(result => result.status === 'rejected')

  if (failedBlobs.length) {
    logger.error('document-folder-delete-blob-error', {
      requestId,
      folderId: id,
      failed: failedBlobs.length,
      error: failedBlobs[0].reason?.message
    })
  }

  logger.info('document-folder-delete-success', {
    requestId,
    userId: session.user.id,
    folderId: id,
    folders: deleted.folders,
    files: deleted.files
  })
  await createAuditLog({
    userId: session.user.id,
    tenantId: existing.workspaceId,
    action: 'DOCUMENT_FOLDER_DELETE',
    resource: 'document_folder',
    resourceId: id,
    before: { name: existing.name, parentId: existing.parentId, workspaceId: existing.workspaceId },
    metadata: { requestId, deletedFolders: deleted.folders, deletedFiles: deleted.files },
    requestId
  })

  return jsonWithRequestId(
    { message: 'Pasta excluída', deleted: { folders: deleted.folders, files: deleted.files } },
    { requestId }
  )
}

export const GET = withDocumentErrorHandling('document-folder-read-unhandled-error', handleGet)
export const PATCH = withDocumentErrorHandling('document-folder-rename-unhandled-error', handlePatch)
export const DELETE = withDocumentErrorHandling('document-folder-delete-unhandled-error', handleDelete)
