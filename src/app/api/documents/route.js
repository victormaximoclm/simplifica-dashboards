export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import {
  buildFolderPath,
  collectSubtreeIds,
  documentCreatorInclude,
  findFolderInWorkspace,
  getDocumentPermissions,
  getFolderPath,
  getWorkspaceFolderTree,
  resolveDocumentsWorkspace,
  serializeFile,
  serializeFolder,
  withDocumentErrorHandling
} from '@/libs/documentAccess'

// GET /api/documents?workspaceId=&folderId=&q=&page=&pageSize= - conteúdo de uma pasta (vazio = raiz);
// com q, busca recursiva na pasta e subpastas
async function handleGet(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    logger.warn('documents-list-unauthorized', { requestId })

    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  const { searchParams } = new URL(req.url)
  const folderId = searchParams.get('folderId') || null
  const q = (searchParams.get('q') || '').trim().slice(0, 255)
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get('pageSize')) || 50))

  const access = await resolveDocumentsWorkspace(session, searchParams.get('workspaceId'), 'view')

  if (!access.ok) {
    logger.warn('documents-list-denied', { requestId, userId: session.user.id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const { workspace } = access

  try {
    let folder = null

    if (folderId) {
      folder = await findFolderInWorkspace(folderId, workspace.id)

      if (!folder) {
        return jsonWithRequestId({ message: 'Pasta não encontrada' }, { status: 404, requestId })
      }
    }

    let folderWhere = { workspaceId: workspace.id, parentId: folderId }
    let fileWhere = { workspaceId: workspace.id, folderId }
    let folderTree = null

    // Com busca, procura na pasta atual e em todas as subpastas (na raiz, no workspace inteiro)
    if (q) {
      const nameFilter = { name: { contains: q, mode: 'insensitive' } }

      folderTree = await getWorkspaceFolderTree(workspace.id)

      const scope = folderId ? { in: collectSubtreeIds(folderTree, folderId) } : undefined

      folderWhere = { workspaceId: workspace.id, ...nameFilter, ...(scope && { parentId: scope }) }
      fileWhere = { workspaceId: workspace.id, ...nameFilter, ...(scope && { folderId: scope }) }
    }

    const [folderTotal, fileTotal] = await Promise.all([
      prisma.documentFolder.count({ where: folderWhere }),
      prisma.documentFile.count({ where: fileWhere })
    ])

    // Paginação única sobre "pastas primeiro, depois arquivos", ambos por nome
    const skip = (page - 1) * pageSize
    const folderSkip = Math.min(skip, folderTotal)
    const folderTake = Math.max(0, Math.min(pageSize, folderTotal - skip))
    const fileSkip = Math.max(0, skip - folderTotal)
    const fileTake = pageSize - folderTake

    const [folders, files, ancestors] = await Promise.all([
      folderTake > 0
        ? prisma.documentFolder.findMany({
            where: folderWhere,
            include: documentCreatorInclude,
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            skip: folderSkip,
            take: folderTake
          })
        : [],
      fileTake > 0
        ? prisma.documentFile.findMany({
            where: fileWhere,
            include: documentCreatorInclude,
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            skip: fileSkip,
            take: fileTake
          })
        : [],
      folderId ? getFolderPath(folderId) : []
    ])

    const total = folderTotal + fileTotal

    // Na busca, cada item informa onde está (caminho da pasta que o contém, a partir da raiz)
    const withLocation = (item, parentId) =>
      folderTree ? { ...item, location: buildFolderPath(folderTree, parentId) } : item

    logger.debug('documents-list-success', { requestId, userId: session.user.id, workspaceId: workspace.id, total })

    return jsonWithRequestId(
      {
        data: [
          ...folders.map(folder => withLocation(serializeFolder(folder), folder.parentId)),
          ...files.map(file => withLocation(serializeFile(file), file.folderId))
        ],
        search: q ? { query: q, recursive: true } : null,
        pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
        folder: folder ? { id: folder.id, name: folder.name, parentId: folder.parentId } : null,
        ancestors,
        workspace: { id: workspace.id, name: workspace.name },
        permissions: getDocumentPermissions(session.user, workspace)
      },
      { requestId }
    )
  } catch (error) {
    logger.error('documents-list-error', { requestId, error: error.message })

    return jsonWithRequestId({ message: 'Erro ao listar documentos' }, { status: 500, requestId })
  }
}

export const GET = withDocumentErrorHandling('documents-list-unhandled-error', handleGet)
