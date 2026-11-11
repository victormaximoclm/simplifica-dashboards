export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { createFolderSchema, parseBody } from '@/libs/validations'
import { canCreateDocuments } from '@/libs/documentPermissions'
import {
  DocumentConflictError,
  MAX_FOLDER_DEPTH,
  assertNameAvailable,
  documentCreatorInclude,
  findFolderInWorkspace,
  getFolderPath,
  lockDocumentParent,
  resolveDocumentsWorkspace,
  serializeFolder,
  withDocumentErrorHandling
} from '@/libs/documentAccess'

// GET /api/documents/folders?workspaceId= - todas as pastas do workspace (árvore do diálogo "Mover")
async function handleGet(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  const { searchParams } = new URL(req.url)
  const access = await resolveDocumentsWorkspace(session, searchParams.get('workspaceId'), 'view')

  if (!access.ok) {
    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const folders = await prisma.documentFolder.findMany({
    where: { workspaceId: access.workspace.id },
    select: { id: true, name: true, parentId: true },
    orderBy: { name: 'asc' }
  })

  return jsonWithRequestId({ data: folders }, { requestId })
}

// POST /api/documents/folders - cria pasta (SuperAdmin/SubAdmin)
async function handlePost(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    logger.warn('document-folder-create-unauthorized', { requestId })

    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (!canCreateDocuments(session.user)) {
    logger.warn('document-folder-create-forbidden', { requestId, userId: session.user.id, role: session.user.role })

    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const parsed = parseBody(createFolderSchema, await req.json().catch(() => null))

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const { name, workspaceId } = parsed.data
  const parentId = parsed.data.parentId || null
  const access = await resolveDocumentsWorkspace(session, workspaceId, 'create')

  if (!access.ok) {
    logger.warn('document-folder-create-forbidden', {
      requestId,
      userId: session.user.id,
      role: session.user.role,
      workspaceId,
      status: access.status
    })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  if (parentId) {
    const parent = await findFolderInWorkspace(parentId, workspaceId)

    if (!parent) {
      return jsonWithRequestId({ message: 'Pasta de destino não encontrada' }, { status: 404, requestId })
    }

    const parentPath = await getFolderPath(parentId)

    if (parentPath.length + 1 > MAX_FOLDER_DEPTH) {
      return jsonWithRequestId(
        { message: `Limite de ${MAX_FOLDER_DEPTH} níveis de pastas atingido` },
        { status: 400, requestId }
      )
    }
  }

  let folder

  try {
    folder = await prisma.$transaction(async tx => {
      await lockDocumentParent(tx, workspaceId, parentId)
      await assertNameAvailable(tx, { kind: 'folder', workspaceId, parentId, name })

      return tx.documentFolder.create({
        data: { name, parentId, workspaceId, createdById: session.user.id },
        include: documentCreatorInclude
      })
    })
  } catch (error) {
    if (error instanceof DocumentConflictError) {
      return jsonWithRequestId({ message: error.message }, { status: 409, requestId })
    }

    logger.error('document-folder-create-error', { requestId, error: error.message })

    return jsonWithRequestId({ message: 'Erro ao criar pasta' }, { status: 500, requestId })
  }

  logger.info('document-folder-create-success', {
    requestId,
    userId: session.user.id,
    folderId: folder.id,
    workspaceId
  })
  await createAuditLog({
    userId: session.user.id,
    tenantId: workspaceId,
    action: 'DOCUMENT_FOLDER_CREATE',
    resource: 'document_folder',
    resourceId: folder.id,
    after: { name: folder.name, parentId: folder.parentId, workspaceId },
    metadata: { requestId },
    requestId
  })

  return jsonWithRequestId(serializeFolder(folder), { status: 201, requestId })
}

export const GET = withDocumentErrorHandling('document-folders-tree-unhandled-error', handleGet)
export const POST = withDocumentErrorHandling('document-folder-create-unhandled-error', handlePost)
