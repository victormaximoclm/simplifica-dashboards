export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { serializeSitePage } from '@/libs/documentSite'
import { getAuthorizedSite } from '@/libs/documentSiteAccess'
import { withDocumentErrorHandling } from '@/libs/documentAccess'

// GET /api/documents/sites/:id/pages/:pageId - conteúdo de uma página. A página precisa pertencer ao Site da URL:
// um id de página de outro Site (ou de outro workspace) responde 404, sem revelar nada.
async function handleGet(req, { params }) {
  const { id, pageId } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedSite({ id, session, action: 'view' })

  if (!access.ok) {
    logger.warn('document-site-page-read-denied', { requestId, fileId: id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const page = await prisma.documentSitePage.findUnique({ where: { id: pageId } })

  if (!page || page.siteId !== id) {
    return jsonWithRequestId({ message: 'Página não encontrada' }, { status: 404, requestId })
  }

  return jsonWithRequestId({ data: serializeSitePage(page) }, { requestId, headers: { 'Cache-Control': 'private, no-store' } })
}

export const GET = withDocumentErrorHandling('document-site-page-read-unhandled-error', handleGet)
