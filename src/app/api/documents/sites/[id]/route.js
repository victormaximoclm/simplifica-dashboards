export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { DOCUMENT_SITE_LIMITS, pickHomePageId, serializeSitePageSummary } from '@/libs/documentSite'
import { getAuthorizedSite } from '@/libs/documentSiteAccess'
import {
  buildFolderPath,
  getDocumentPermissions,
  getWorkspaceFolderTree,
  recordDocumentFileAccess,
  serializeFile,
  withDocumentErrorHandling
} from '@/libs/documentAccess'

// GET /api/documents/sites/:id - dados do Site e árvore de páginas (sem conteúdo). Quem pode ver arquivos do
// workspace pode ver o Site; o conteúdo de cada página vem de /pages/:pageId.
async function handleGet(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedSite({ id, session, action: 'view' })

  if (!access.ok) {
    logger.warn('document-site-read-denied', { requestId, fileId: id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const { item: file, workspace } = access

  const [pages, folderTree] = await Promise.all([
    prisma.documentSitePage.findMany({
      where: { siteId: id },
      select: { id: true, parentId: true, title: true, position: true },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take: DOCUMENT_SITE_LIMITS.maxPages
    }),
    getWorkspaceFolderTree(file.workspaceId)
  ])

  await recordDocumentFileAccess({ session, file, kind: 'view', requestId })

  return jsonWithRequestId(
    {
      data: {
        ...serializeFile(file),
        workspaceName: workspace.name,

        // Caminho da pasta que contém o Site (botão "voltar" e breadcrumb)
        location: buildFolderPath(folderTree, file.folderId),
        pages: pages.map(serializeSitePageSummary),
        homePageId: pickHomePageId(pages),
        permissions: getDocumentPermissions(session.user, workspace)
      }
    },
    { requestId, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

export const GET = withDocumentErrorHandling('document-site-read-unhandled-error', handleGet)
