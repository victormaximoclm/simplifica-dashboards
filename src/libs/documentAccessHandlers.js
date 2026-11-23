import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { rolesBelongToWorkspace } from '@/libs/customRoleScope'
import { getAuthorizedDocumentItem, getFolderPath, withDocumentErrorHandling } from '@/libs/documentAccess'
import { getGrantedRolesByResource, replaceItemGrants } from '@/libs/documentGrants'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'

const MAX_ROLES_PER_ITEM = 100

const RESOURCE_BY_KIND = { folder: 'document_folder', file: 'document_file' }

/**
 * Cargos liberados de um item e, quando ele não tem cargos próprios, de onde herda (pasta mais próxima com cargos).
 * `roles` é o que vale para o item em si; `inherited` só aparece quando `roles` está vazio.
 */
async function describeItemAccess(kind, item) {
  const own = (await getGrantedRolesByResource([item.id])).get(item.id) ?? []

  if (own.length) return { roles: own, inherited: null }

  const parentId = kind === 'folder' ? item.parentId : item.folderId
  const chain = parentId ? (await getFolderPath(parentId)).reverse() : []
  const byFolder = await getGrantedRolesByResource(chain.map(folder => folder.id))
  const source = chain.find(folder => byFolder.get(folder.id)?.length)

  return {
    roles: [],
    inherited: source ? { id: source.id, name: source.name, roles: byFolder.get(source.id) } : null
  }
}

/**
 * GET e PUT /api/documents/{folders|files}/:id/access — quem gerencia o acesso por cargo (SuperAdmin/SubAdmin, com
 * a regra de edição do workspace). Um Site é um arquivo e usa a rota de arquivos.
 */
export function createAccessHandlers(kind) {
  const resource = RESOURCE_BY_KIND[kind]

  async function handleGet(req, { params }) {
    const { id } = await params
    const requestId = getRequestId(req)
    const session = await getServerSession(authOptions)
    const access = await getAuthorizedDocumentItem({ kind, id, session, action: 'edit' })

    if (!access.ok) {
      logger.warn('document-access-read-denied', { requestId, kind, itemId: id, status: access.status })

      return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
    }

    const { roles, inherited } = await describeItemAccess(kind, access.item)

    return jsonWithRequestId(
      { data: { id, kind, name: access.item.name, workspaceId: access.item.workspaceId, roles, inherited } },
      { requestId, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  async function handlePut(req, { params }) {
    const { id } = await params
    const requestId = getRequestId(req)
    const session = await getServerSession(authOptions)
    const access = await getAuthorizedDocumentItem({ kind, id, session, action: 'edit' })

    if (!access.ok) {
      logger.warn('document-access-update-denied', { requestId, kind, itemId: id, status: access.status })

      return jsonWithRequestId({ message: access.message }, { status: access.status, requestId })
    }

    const body = await req.json().catch(() => null)
    const rawRoles = body && typeof body === 'object' ? body.roles : null

    const isValidEntry = entry =>
      entry &&
      typeof entry === 'object' &&
      typeof entry.roleId === 'string' &&
      !!entry.roleId &&
      (entry.canDownload === undefined || typeof entry.canDownload === 'boolean')

    if (!Array.isArray(rawRoles) || !rawRoles.every(isValidEntry)) {
      return jsonWithRequestId(
        { message: 'Informe a lista de cargos (roles: [{ roleId, canDownload }])' },
        { status: 400, requestId }
      )
    }

    // Cargo repetido: vale a última entrada
    const byRole = new Map(rawRoles.map(entry => [entry.roleId, entry.canDownload === true]))
    const newRoles = [...byRole].map(([roleId, canDownload]) => ({ roleId, canDownload }))
    const roleIds = newRoles.map(entry => entry.roleId)

    if (roleIds.length > MAX_ROLES_PER_ITEM) {
      return jsonWithRequestId(
        { message: `Selecione no máximo ${MAX_ROLES_PER_ITEM} cargos` },
        { status: 400, requestId }
      )
    }

    // Cargo pertence a um único workspace: o do item
    if (!(await rolesBelongToWorkspace(roleIds, access.item.workspaceId))) {
      return jsonWithRequestId({ message: 'Há cargos que não pertencem a este workspace' }, { status: 400, requestId })
    }

    const before = (await getGrantedRolesByResource([id])).get(id) ?? []

    await prisma.$transaction(tx => replaceItemGrants(tx, { resourceId: id, roles: newRoles }))

    const { roles, inherited } = await describeItemAccess(kind, access.item)

    logger.info('document-access-update-success', {
      requestId,
      userId: session.user.id,
      kind,
      itemId: id,
      roleCount: roleIds.length
    })
    await createAuditLog({
      userId: session.user.id,
      tenantId: access.item.workspaceId,
      action: 'DOCUMENT_ACCESS_UPDATE',
      resource,
      resourceId: id,
      before: { roles: before.map(role => ({ roleId: role.id, canDownload: role.canDownload })) },
      after: { roles: newRoles },
      metadata: { requestId, name: access.item.name },
      requestId
    })

    return jsonWithRequestId(
      { data: { id, kind, name: access.item.name, workspaceId: access.item.workspaceId, roles, inherited } },
      { requestId }
    )
  }

  return {
    GET: withDocumentErrorHandling('document-access-read-unhandled-error', handleGet),
    PUT: withDocumentErrorHandling('document-access-update-unhandled-error', handlePut)
  }
}
