export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { createSiteSchema, parseBody } from '@/libs/validations'
import { canCreateDocuments } from '@/libs/documentPermissions'
import { DOCUMENT_SITE_MIME } from '@/libs/documentFileTypes'
import { DOCUMENT_SITE_FIRST_PAGE_TITLE } from '@/libs/documentSite'
import {
  DocumentConflictError,
  assertNameAvailable,
  documentCreatorInclude,
  findFolderInWorkspace,
  lockDocumentParent,
  resolveDocumentsWorkspace,
  serializeFile,
  withDocumentErrorHandling
} from '@/libs/documentAccess'

// POST /api/documents/sites - cria um Site (SuperAdmin/SubAdmin). O Site é um item do Drive sem blob: o conteúdo
// fica nas páginas, no banco; a primeira página é criada junto.
async function handlePost(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) {
    logger.warn('document-site-create-unauthorized', { requestId })

    return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  }

  if (!canCreateDocuments(session.user)) {
    logger.warn('document-site-create-forbidden', { requestId, userId: session.user.id, role: session.user.role })

    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  const parsed = parseBody(createSiteSchema, await req.json().catch(() => null))

  if (!parsed.success) {
    return jsonWithRequestId({ message: parsed.message }, { status: 400, requestId })
  }

  const { workspaceId, name } = parsed.data
  const folderId = parsed.data.folderId || null

  const access = await resolveDocumentsWorkspace(session, workspaceId, 'create')

  if (!access.ok) {
    logger.warn('document-site-create-denied', { requestId, userId: session.user.id, workspaceId })

    return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
  }

  const { workspace } = access

  if (folderId && !(await findFolderInWorkspace(folderId, workspace.id))) {
    return jsonWithRequestId({ message: 'Pasta de destino não encontrada' }, { status: 404, requestId })
  }

  let file

  try {
    file = await prisma.$transaction(async tx => {
      await lockDocumentParent(tx, workspace.id, folderId)
      await assertNameAvailable(tx, { kind: 'file', workspaceId: workspace.id, parentId: folderId, name })

      return tx.documentFile.create({
        data: {
          name,
          folderId,
          workspaceId: workspace.id,
          mimeType: DOCUMENT_SITE_MIME,
          size: 0,
          storageKey: null,
          createdById: session.user.id,
          site: {
            create: {
              pages: {
                create: {
                  title: DOCUMENT_SITE_FIRST_PAGE_TITLE,
                  position: 0,
                  content: [],
                  updatedById: session.user.id
                }
              }
            }
          }
        },
        include: { ...documentCreatorInclude, site: { include: { pages: { select: { id: true } } } } }
      })
    })
  } catch (error) {
    if (error instanceof DocumentConflictError) {
      return jsonWithRequestId({ message: error.message }, { status: 409, requestId })
    }

    logger.error('document-site-create-error', { requestId, error: error.message })

    return jsonWithRequestId({ message: 'Erro ao criar o site' }, { status: 500, requestId })
  }

  logger.info('document-site-create-success', {
    requestId,
    userId: session.user.id,
    fileId: file.id,
    workspaceId: workspace.id
  })
  await createAuditLog({
    userId: session.user.id,
    tenantId: workspace.id,
    action: 'DOCUMENT_SITE_CREATE',
    resource: 'document_file',
    resourceId: file.id,
    after: { name: file.name, folderId: file.folderId },
    metadata: { requestId, name: file.name },
    requestId
  })

  return jsonWithRequestId({ data: serializeFile(file), pageId: file.site.pages[0]?.id ?? null }, { status: 201, requestId })
}

export const POST = withDocumentErrorHandling('document-site-create-unhandled-error', handlePost)
