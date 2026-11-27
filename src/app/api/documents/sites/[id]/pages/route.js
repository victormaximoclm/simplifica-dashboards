export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import {
  DOCUMENT_SITE_LIMITS,
  SiteContentError,
  getSitePageDepth,
  serializeSitePage,
  validateSitePageTitle
} from '@/libs/documentSite'
import { getAuthorizedSite, lockSite, readSiteJsonBody } from '@/libs/documentSiteAccess'
import { withDocumentErrorHandling } from '@/libs/documentAccess'
import { withActionAudit } from '@/libs/auditedAction'

// POST /api/documents/sites/:id/pages - cria página (ou subpágina, com parentId) no fim das irmãs
async function handlePost(req, { params }) {
  const { id } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedSite({ id, session, action: 'edit' })

  if (!access.ok) {
    logger.warn('document-site-page-create-denied', { requestId, fileId: id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const { body, tooLarge } = await readSiteJsonBody(req)

  if (tooLarge) return jsonWithRequestId({ message: 'O envio é grande demais' }, { status: 413, requestId })

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonWithRequestId({ message: 'Dados inválidos' }, { status: 400, requestId })
  }

  let title

  try {
    title = validateSitePageTitle(body.title)
  } catch (error) {
    if (error instanceof SiteContentError) {
      return jsonWithRequestId({ message: error.message }, { status: error.status, requestId })
    }

    throw error
  }

  const parentId = typeof body.parentId === 'string' && body.parentId ? body.parentId : null

  // Limite de páginas, nível máximo e posição dependem do conjunto atual: tudo dentro do lock do Site
  const result = await prisma.$transaction(async tx => {
    await lockSite(tx, id)

    const pages = await tx.documentSitePage.findMany({
      where: { siteId: id },
      select: { id: true, parentId: true, title: true, position: true }
    })

    if (pages.length >= DOCUMENT_SITE_LIMITS.maxPages) {
      return { error: { status: 409, message: `O site pode ter no máximo ${DOCUMENT_SITE_LIMITS.maxPages} páginas` } }
    }

    if (parentId) {
      if (!pages.some(page => page.id === parentId)) {
        return { error: { status: 404, message: 'Página pai não encontrada' } }
      }

      if (getSitePageDepth(pages, parentId) >= DOCUMENT_SITE_LIMITS.maxDepth) {
        return {
          error: {
            status: 400,
            message: `O site pode ter no máximo ${DOCUMENT_SITE_LIMITS.maxDepth} níveis de páginas`
          }
        }
      }
    }

    const siblings = pages.filter(page => (page.parentId ?? null) === parentId)
    const position = siblings.length ? Math.max(...siblings.map(page => page.position)) + 1 : 0

    const page = await tx.documentSitePage.create({
      data: { siteId: id, parentId, title, position, content: [], updatedById: session.user.id }
    })

    await tx.documentFile.update({ where: { id }, data: { updatedAt: new Date() } })

    return { page }
  })

  if (result.error) {
    return jsonWithRequestId({ message: result.error.message }, { status: result.error.status, requestId })
  }

  logger.info('document-site-page-create-success', {
    requestId,
    userId: session.user.id,
    fileId: id,
    pageId: result.page.id
  })
  await createAuditLog({
    userId: session.user.id,
    tenantId: access.item.workspaceId,
    action: 'DOCUMENT_SITE_PAGE_CREATE',
    resource: 'document_file',
    resourceId: id,
    after: { pageId: result.page.id, title, parentId },
    metadata: { requestId, name: access.item.name },
    requestId
  })

  return jsonWithRequestId({ data: serializeSitePage(result.page) }, { status: 201, requestId })
}

export const POST = withActionAudit(
  'DOCUMENT_SITE_PAGE_CREATE',
  withDocumentErrorHandling('document-site-page-create-unhandled-error', handlePost)
)
