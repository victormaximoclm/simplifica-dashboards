export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { createNotification } from '@/libs/notifications'
import { prisma } from '@/libs/prisma'
import * as storage from '@/libs/storage'
import { parseBody, uploadFieldsSchema } from '@/libs/validations'
import { canCreateDocuments } from '@/libs/documentPermissions'
import { getFileExtension } from '@/libs/documentFileTypes'
import {
  DOCUMENTS_MAX_REQUEST_BYTES,
  DocumentConflictError,
  MAX_FILES_PER_UPLOAD,
  assertNameAvailable,
  documentCreatorInclude,
  findFolderInWorkspace,
  getMaxFileSizeBytes,
  getMaxFileSizeMb,
  lockDocumentParent,
  matchesFileSignature,
  resolveDocumentsWorkspace,
  serializeFile,
  validateUploadFile,
  withDocumentErrorHandling
} from '@/libs/documentAccess'

async function removeBlobs(keys, requestId) {
  const results = await Promise.allSettled(keys.map(key => storage.delete(key)))
  const failed = results.filter(result => result.status === 'rejected')

  if (failed.length) {
    logger.error('document-file-upload-cleanup-error', { requestId, failed: failed.length })
  }
}

// POST /api/documents/files - upload multipart (campos: workspaceId, folderId, files[]) (SuperAdmin/SubAdmin)
async function handlePost(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    logger.warn('document-file-upload-unauthorized', { requestId })

    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (!canCreateDocuments(session.user)) {
    logger.warn('document-file-upload-forbidden', { requestId, userId: session.user.id, role: session.user.role })

    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const maxBytes = getMaxFileSizeBytes()
  const maxMb = getMaxFileSizeMb()
  const contentLength = Number(req.headers.get('content-length') || 0)

  if (contentLength > DOCUMENTS_MAX_REQUEST_BYTES) {
    return jsonWithRequestId(
      { message: `O envio excede o tamanho máximo permitido (${maxMb} MB por arquivo)` },
      { status: 413, requestId }
    )
  }

  let formData

  try {
    formData = await req.formData()
  } catch {
    return jsonWithRequestId(
      { message: 'Não foi possível ler os arquivos enviados. Verifique o tamanho e tente novamente.' },
      { status: 400, requestId }
    )
  }

  const parsed = parseBody(uploadFieldsSchema, {
    workspaceId: formData.get('workspaceId'),
    folderId: formData.get('folderId')
  })

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const { workspaceId } = parsed.data
  const folderId = parsed.data.folderId || null

  const access = await resolveDocumentsWorkspace(session, workspaceId, 'create')

  if (!access.ok) {
    logger.warn('document-file-upload-denied', { requestId, userId: session.user.id, workspaceId })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const { workspace } = access

  if (folderId && !(await findFolderInWorkspace(folderId, workspace.id))) {
    return jsonWithRequestId({ message: 'Pasta de destino não encontrada' }, { status: 404, requestId })
  }

  const uploads = formData.getAll('files').filter(entry => typeof entry === 'object' && entry !== null)

  if (!uploads.length) {
    return jsonWithRequestId({ message: 'Nenhum arquivo enviado' }, { status: 400, requestId })
  }

  if (uploads.length > MAX_FILES_PER_UPLOAD) {
    return jsonWithRequestId(
      { message: `Envie no máximo ${MAX_FILES_PER_UPLOAD} arquivos por vez` },
      { status: 400, requestId }
    )
  }

  // Valida tudo antes de gravar qualquer coisa (o envio é tudo ou nada)
  const validated = []
  const seenNames = new Set()

  for (const upload of uploads) {
    const check = validateUploadFile(upload, maxBytes)

    if (!check.ok) {
      return jsonWithRequestId({ message: check.message }, { status: check.status, requestId })
    }

    const normalizedName = check.name.toLowerCase()

    if (seenNames.has(normalizedName)) {
      return jsonWithRequestId(
        { message: `O arquivo "${check.name}" foi enviado mais de uma vez` },
        { status: 409, requestId }
      )
    }

    seenNames.add(normalizedName)

    const buffer = Buffer.from(await upload.arrayBuffer())

    if (buffer.length > maxBytes) {
      return jsonWithRequestId(
        { message: `"${check.name}" excede o tamanho máximo de ${maxMb} MB` },
        { status: 413, requestId }
      )
    }

    if (!matchesFileSignature(getFileExtension(check.name), buffer)) {
      return jsonWithRequestId(
        { message: `O conteúdo de "${check.name}" não corresponde ao tipo do arquivo` },
        { status: 415, requestId }
      )
    }

    validated.push({ name: check.name, mimeType: check.fileType.mime, buffer })
  }

  const writtenKeys = []

  try {
    for (const item of validated) {
      item.storageKey = storage.generateStorageKey(workspace.id)
      await storage.put(item.storageKey, item.buffer)
      writtenKeys.push(item.storageKey)
    }
  } catch (error) {
    logger.error('document-file-upload-storage-error', { requestId, error: error.message })
    await removeBlobs(writtenKeys, requestId)

    return jsonWithRequestId({ message: 'Erro ao gravar arquivo' }, { status: 500, requestId })
  }

  let files

  try {
    files = await prisma.$transaction(async tx => {
      await lockDocumentParent(tx, workspace.id, folderId)

      const created = []

      for (const item of validated) {
        await assertNameAvailable(tx, { kind: 'file', workspaceId: workspace.id, parentId: folderId, name: item.name })

        created.push(
          await tx.documentFile.create({
            data: {
              name: item.name,
              folderId,
              workspaceId: workspace.id,
              mimeType: item.mimeType,
              size: item.buffer.length,
              storageKey: item.storageKey,
              createdById: session.user.id
            },
            include: documentCreatorInclude
          })
        )
      }

      return created
    })
  } catch (error) {
    await removeBlobs(writtenKeys, requestId)

    if (error instanceof DocumentConflictError) {
      return jsonWithRequestId({ message: error.message }, { status: 409, requestId })
    }

    logger.error('document-file-upload-error', { requestId, error: error.message })

    return jsonWithRequestId({ message: 'Erro ao salvar arquivo' }, { status: 500, requestId })
  }

  await createNotification({
    type: 'document_uploaded',
    title: files.length === 1 ? 'Novo documento' : 'Novos documentos',
    message:
      files.length === 1
        ? `${session.user.name || session.user.email} enviou "${files[0].name}" em ${workspace.name}`
        : `${session.user.name || session.user.email} enviou ${files.length} arquivos em ${workspace.name}`,
    workspaceId: workspace.id,
    createdById: session.user.id
  })

  for (const file of files) {
    logger.info('document-file-upload-success', {
      requestId,
      userId: session.user.id,
      fileId: file.id,
      workspaceId: workspace.id,
      size: file.size
    })
    await createAuditLog({
      userId: session.user.id,
      tenantId: workspace.id,
      action: 'DOCUMENT_FILE_UPLOAD',
      resource: 'document_file',
      resourceId: file.id,
      after: { name: file.name, folderId: file.folderId, mimeType: file.mimeType, size: file.size },
      metadata: { requestId },
      requestId
    })
  }

  return jsonWithRequestId({ data: files.map(serializeFile) }, { status: 201, requestId })
}

export const POST = withDocumentErrorHandling('document-file-upload-unhandled-error', handlePost)
