export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog, createDedupedAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import {
  SiteContentError,
  collectSiteFileIds,
  getSiteSubtreeIds,
  pickHomePageId,
  serializeSitePage,
  validateSitePageTitle,
  validateSiteBlocks
} from '@/libs/documentSite'
import {
  assertSiteFileRefs,
  findSitePage,
  getAuthorizedSite,
  lockSite,
  readSiteJsonBody,
  resolveSiteFileRefs
} from '@/libs/documentSiteAccess'
import { withDocumentErrorHandling } from '@/libs/documentAccess'

// GET /api/documents/sites/:id/pages/:pageId - conteúdo de uma página e os arquivos que ela referencia. A página
// precisa pertencer ao Site da URL: um id de página de outro Site (ou de outro workspace) responde 404.
async function handleGet(req, { params }) {
  const { id, pageId } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedSite({ id, session, action: 'view' })

  if (!access.ok) {
    logger.warn('document-site-page-read-denied', { requestId, fileId: id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const page = await findSitePage(id, pageId)

  if (!page) {
    return jsonWithRequestId({ message: 'Página não encontrada' }, { status: 404, requestId })
  }

  const data = serializeSitePage(page)
  const files = await resolveSiteFileRefs(collectSiteFileIds(data.content), access.item.workspaceId)

  return jsonWithRequestId({ data, files }, { requestId, headers: { 'Cache-Control': 'private, no-store' } })
}

// PATCH /api/documents/sites/:id/pages/:pageId - { title } renomeia; { content, baseVersion } salva o conteúdo.
// Só o conteúdo tem controle de versão (outra pessoa pode renomear sem invalidar a edição em andamento).
async function handlePatch(req, { params }) {
  const { id, pageId } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedSite({ id, session, action: 'edit' })

  if (!access.ok) {
    logger.warn('document-site-page-update-denied', { requestId, fileId: id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const { body, tooLarge } = await readSiteJsonBody(req)

  if (tooLarge) return jsonWithRequestId({ message: 'O envio é grande demais' }, { status: 413, requestId })

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonWithRequestId({ message: 'Dados inválidos' }, { status: 400, requestId })
  }

  const hasTitle = body.title !== undefined
  const hasContent = body.content !== undefined

  if (!hasTitle && !hasContent) {
    return jsonWithRequestId({ message: 'Nada para atualizar' }, { status: 400, requestId })
  }

  let title
  let blocks

  try {
    if (hasTitle) title = validateSitePageTitle(body.title)

    if (hasContent) {
      if (!Number.isInteger(body.baseVersion)) throw new SiteContentError('Informe a versão da página (baseVersion)')

      blocks = validateSiteBlocks(body.content).blocks
      await assertSiteFileRefs(blocks, access.item.workspaceId)
    }
  } catch (error) {
    if (error instanceof SiteContentError) {
      return jsonWithRequestId({ message: error.message }, { status: error.status, requestId })
    }

    throw error
  }

  const existing = await findSitePage(id, pageId)

  if (!existing) {
    return jsonWithRequestId({ message: 'Página não encontrada' }, { status: 404, requestId })
  }

  // Com versão: o updateMany só acerta a linha se ninguém salvou no meio (sem condição de corrida)
  const result = await prisma.$transaction(async tx => {
    const data = { updatedById: session.user.id }

    if (hasTitle) data.title = title

    if (hasContent) {
      data.content = blocks
      data.version = { increment: 1 }
    }

    const updated = await tx.documentSitePage.updateMany({
      where: { id: pageId, siteId: id, ...(hasContent ? { version: body.baseVersion } : {}) },
      data
    })

    if (updated.count === 0) return { conflict: true }

    // O Site muda de data na listagem ("Modificado em")
    await tx.documentFile.update({ where: { id }, data: { updatedAt: new Date() } })

    return { page: await tx.documentSitePage.findUnique({ where: { id: pageId } }) }
  })

  if (result.conflict) {
    const current = await findSitePage(id, pageId)

    if (!current) return jsonWithRequestId({ message: 'Página não encontrada' }, { status: 404, requestId })

    return jsonWithRequestId(
      {
        message: 'Esta página foi alterada por outra pessoa. Recarregue para ver a versão mais recente.',
        currentVersion: current.version
      },
      { status: 409, requestId }
    )
  }

  const data = serializeSitePage(result.page)
  const files = await resolveSiteFileRefs(collectSiteFileIds(data.content), access.item.workspaceId)

  logger.info('document-site-page-update-success', { requestId, userId: session.user.id, fileId: id, pageId })

  if (hasTitle && title !== existing.title) {
    await createAuditLog({
      userId: session.user.id,
      tenantId: access.item.workspaceId,
      action: 'DOCUMENT_SITE_PAGE_RENAME',
      resource: 'document_file',
      resourceId: id,
      before: { pageId, title: existing.title },
      after: { pageId, title },
      metadata: { requestId, name: access.item.name },
      requestId
    })
  }

  if (hasContent) {
    // Salvar várias vezes seguidas conta uma vez a cada 15 min por usuário e Site
    await createDedupedAuditLog({
      userId: session.user.id,
      tenantId: access.item.workspaceId,
      action: 'DOCUMENT_SITE_PAGE_UPDATE',
      resource: 'document_file',
      resourceId: id,
      metadata: { requestId, name: access.item.name, pageId, pageTitle: result.page.title },
      requestId
    })
  }

  return jsonWithRequestId({ data, files }, { requestId })
}

// DELETE /api/documents/sites/:id/pages/:pageId - exclui a página e as subpáginas. A página inicial (a primeira
// raiz) não pode ser excluída: mova outra página para o início antes.
async function handleDelete(req, { params }) {
  const { id, pageId } = await params
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)
  const access = await getAuthorizedSite({ id, session, action: 'edit' })

  if (!access.ok) {
    logger.warn('document-site-page-delete-denied', { requestId, fileId: id, status: access.status })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const result = await prisma.$transaction(async tx => {
    await lockSite(tx, id)

    const pages = await tx.documentSitePage.findMany({
      where: { siteId: id },
      select: { id: true, parentId: true, title: true, position: true }
    })

    const page = pages.find(entry => entry.id === pageId)

    if (!page) return { error: { status: 404, message: 'Página não encontrada' } }

    if (pickHomePageId(pages) === pageId) {
      return {
        error: {
          status: 400,
          message: 'A página inicial não pode ser excluída. Mova outra página para o início antes.'
        }
      }
    }

    const ids = getSiteSubtreeIds(pages, pageId)

    await tx.documentSitePage.deleteMany({ where: { id: { in: ids }, siteId: id } })
    await tx.documentFile.update({ where: { id }, data: { updatedAt: new Date() } })

    return { title: page.title, deleted: ids.length }
  })

  if (result.error) {
    return jsonWithRequestId({ message: result.error.message }, { status: result.error.status, requestId })
  }

  logger.info('document-site-page-delete-success', { requestId, userId: session.user.id, fileId: id, pageId })
  await createAuditLog({
    userId: session.user.id,
    tenantId: access.item.workspaceId,
    action: 'DOCUMENT_SITE_PAGE_DELETE',
    resource: 'document_file',
    resourceId: id,
    before: { pageId, title: result.title, deletedPages: result.deleted },
    metadata: { requestId, name: access.item.name },
    requestId
  })

  return jsonWithRequestId({ message: 'Página excluída', deleted: result.deleted }, { requestId })
}

export const GET = withDocumentErrorHandling('document-site-page-read-unhandled-error', handleGet)
export const PATCH = withDocumentErrorHandling('document-site-page-update-unhandled-error', handlePatch)
export const DELETE = withDocumentErrorHandling('document-site-page-delete-unhandled-error', handleDelete)
