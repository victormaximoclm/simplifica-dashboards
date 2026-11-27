export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { compareSitePages, pickHomePageId, planSitePageMove, serializeSitePageSummary } from '@/libs/documentSite'
import { getAuthorizedSite, lockSite, readSiteJsonBody } from '@/libs/documentSiteAccess'
import { withDocumentErrorHandling } from '@/libs/documentAccess'
import { withActionAudit } from '@/libs/auditedAction'

// POST /api/documents/sites/:id/pages/:pageId/move - { parentId: string|null, index: number }
// Move a página para dentro de outra (ou para a raiz) na posição `index` entre as irmãs. "Subir" e "descer" são
// o mesmo movimento com o índice vizinho. As posições das irmãs são renumeradas (0..n-1).
async function handlePost(req, { params }) {
  const { id, pageId } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedSite({ id, session, action: 'edit' })

  if (!access.ok) {
    logger.warn('document-site-page-move-denied', { requestId, fileId: id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const { body, tooLarge } = await readSiteJsonBody(req)

  if (tooLarge || !body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonWithRequestId({ message: 'Dados inválidos' }, { status: 400, requestId })
  }

  if (body.parentId !== null && body.parentId !== undefined && typeof body.parentId !== 'string') {
    return jsonWithRequestId({ message: 'Página de destino inválida' }, { status: 400, requestId })
  }

  const result = await prisma.$transaction(async tx => {
    await lockSite(tx, id)

    const pages = await tx.documentSitePage.findMany({
      where: { siteId: id },
      select: { id: true, parentId: true, title: true, position: true }
    })

    const page = pages.find(entry => entry.id === pageId)

    if (!page) return { error: { status: 404, message: 'Página não encontrada' } }

    const plan = planSitePageMove(pages, pageId, body.parentId || null, body.index)

    if (plan.error) return { error: { status: 400, message: plan.error } }

    for (const update of plan.updates) {
      await tx.documentSitePage.updateMany({
        where: { id: update.id, siteId: id },
        data: { parentId: update.parentId, position: update.position, updatedById: session.user.id }
      })
    }

    if (plan.updates.length) await tx.documentFile.update({ where: { id }, data: { updatedAt: new Date() } })

    const fresh = await tx.documentSitePage.findMany({
      where: { siteId: id },
      select: { id: true, parentId: true, title: true, position: true }
    })

    return { pages: fresh.sort(compareSitePages), title: page.title, changed: plan.updates.length }
  })

  if (result.error) {
    return jsonWithRequestId({ message: result.error.message }, { status: result.error.status, requestId })
  }

  if (result.changed) {
    await createAuditLog({
      userId: session.user.id,
      tenantId: access.item.workspaceId,
      action: 'DOCUMENT_SITE_PAGE_MOVE',
      resource: 'document_file',
      resourceId: id,
      after: { pageId, title: result.title, parentId: body.parentId || null, index: body.index ?? null },
      metadata: { requestId, name: access.item.name },
      requestId
    })
  }

  return jsonWithRequestId(
    { data: { pages: result.pages.map(serializeSitePageSummary), homePageId: pickHomePageId(result.pages) } },
    { requestId }
  )
}

export const POST = withActionAudit(
  'DOCUMENT_SITE_PAGE_MOVE',
  withDocumentErrorHandling('document-site-page-move-unhandled-error', handlePost)
)
