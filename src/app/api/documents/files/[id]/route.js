export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import * as storage from '@/libs/storage'
import { parseBody, renameSchema } from '@/libs/validations'
import { canDeleteDocuments, canEditDocuments } from '@/libs/documentPermissions'
import { getFileExtension, isSiteMime } from '@/libs/documentFileTypes'
import {
  DocumentConflictError,
  assertNameAvailable,
  documentCreatorInclude,
  getAuthorizedDocumentItem,
  lockDocumentParent,
  serializeFile,
  withDocumentErrorHandling
} from '@/libs/documentAccess'
import { deleteItemGrants } from '@/libs/documentGrants'

// GET /api/documents/files/:id - metadados do arquivo
async function handleGet(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedDocumentItem({ kind: 'file', id, session, action: 'view' })

  if (!access.ok) {
    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  return jsonWithRequestId(
    { ...serializeFile(access.item), canDownload: access.viewer.canDownloadFile(access.item) },
    { requestId }
  )
}

// PATCH /api/documents/files/:id - renomeia arquivo mantendo a extensão (SuperAdmin/SubAdmin)
async function handlePatch(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (!canEditDocuments(session.user)) {
    logger.warn('document-file-rename-forbidden', { requestId, userId: session.user.id, role: session.user.role })

    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const parsed = parseBody(renameSchema, await req.json().catch(() => null))

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const access = await getAuthorizedDocumentItem({ kind: 'file', id, session, action: 'edit' })

  if (!access.ok) {
    logger.warn('document-file-rename-denied', { requestId, userId: session.user.id, fileId: id })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const existing = access.item
  let { name } = parsed.data

  // Site: o tipo vem do mimeType e o nome é livre (ponto no nome não é extensão). Nos demais, a extensão define o
  // tipo servido no download; sem extensão, a original é mantida
  if (!isSiteMime(existing.mimeType)) {
    const originalExtension = getFileExtension(existing.name)

    if (!getFileExtension(name)) {
      name = `${name}.${originalExtension}`
    } else if (getFileExtension(name) !== originalExtension) {
      return jsonWithRequestId(
        { message: `A extensão do arquivo não pode ser alterada (.${originalExtension})` },
        { status: 400, requestId }
      )
    }
  }

  if (name.length > 255) {
    return jsonWithRequestId({ message: 'O nome deve ter no máximo 255 caracteres' }, { status: 400, requestId })
  }

  if (name === existing.name) {
    return jsonWithRequestId(serializeFile(existing), { requestId })
  }

  let file

  try {
    file = await prisma.$transaction(async tx => {
      await lockDocumentParent(tx, existing.workspaceId, existing.folderId)
      await assertNameAvailable(tx, {
        kind: 'file',
        workspaceId: existing.workspaceId,
        parentId: existing.folderId,
        name,
        excludeId: id
      })

      return tx.documentFile.update({ where: { id }, data: { name }, include: documentCreatorInclude })
    })
  } catch (error) {
    if (error instanceof DocumentConflictError) {
      return jsonWithRequestId({ message: error.message }, { status: 409, requestId })
    }

    logger.error('document-file-rename-error', { requestId, fileId: id, error: error.message })

    return jsonWithRequestId({ message: 'Erro ao renomear arquivo' }, { status: 500, requestId })
  }

  logger.info('document-file-rename-success', { requestId, userId: session.user.id, fileId: id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: file.workspaceId,
    action: 'DOCUMENT_FILE_RENAME',
    resource: 'document_file',
    resourceId: id,
    before: { name: existing.name },
    after: { name: file.name },
    metadata: { requestId },
    requestId
  })

  return jsonWithRequestId(serializeFile(file), { requestId })
}

// DELETE /api/documents/files/:id - exclui arquivo (SuperAdmin/SubAdmin)
async function handleDelete(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (!canDeleteDocuments(session.user)) {
    logger.warn('document-file-delete-forbidden', { requestId, userId: session.user.id, role: session.user.role })

    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const access = await getAuthorizedDocumentItem({ kind: 'file', id, session, action: 'delete' })

  if (!access.ok) {
    logger.warn('document-file-delete-denied', { requestId, userId: session.user.id, fileId: id })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const existing = access.item

  try {
    await prisma.$transaction(async tx => {
      await tx.documentFile.delete({ where: { id } })
      await deleteItemGrants(tx, [id]) // sem chave estrangeira: os cargos liberados saem junto
    })
  } catch (error) {
    logger.error('document-file-delete-error', { requestId, fileId: id, error: error.message })

    return jsonWithRequestId({ message: 'Erro ao excluir arquivo' }, { status: 500, requestId })
  }

  // Itens sem blob (Site) não têm o que apagar no storage; as páginas saem em cascata junto com o DocumentFile
  if (existing.storageKey) {
    try {
      await storage.delete(existing.storageKey)
    } catch (error) {
      logger.error('document-file-delete-blob-error', { requestId, fileId: id, error: error.message })
    }
  }

  logger.info('document-file-delete-success', { requestId, userId: session.user.id, fileId: id })
  await createAuditLog({
    userId: session.user.id,
    tenantId: existing.workspaceId,
    action: 'DOCUMENT_FILE_DELETE',
    resource: 'document_file',
    resourceId: id,
    before: { name: existing.name, folderId: existing.folderId, size: existing.size },
    metadata: { requestId },
    requestId
  })

  return jsonWithRequestId({ message: 'Arquivo excluído' }, { requestId })
}

export const GET = withDocumentErrorHandling('document-file-read-unhandled-error', handleGet)
export const PATCH = withDocumentErrorHandling('document-file-rename-unhandled-error', handlePatch)
export const DELETE = withDocumentErrorHandling('document-file-delete-unhandled-error', handleDelete)
