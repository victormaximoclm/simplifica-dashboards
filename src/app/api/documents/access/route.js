export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { createAuditLog } from '@/libs/auditService'
import { rolesBelongToWorkspace } from '@/libs/customRoleScope'
import { canPerformDocumentAction, withDocumentErrorHandling } from '@/libs/documentAccess'
import { getGrantedRolesByResource, replaceItemGrants } from '@/libs/documentGrants'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { loadWorkspaceForAccess } from '@/libs/workspaceAccess'

const MAX_ITEMS = 200
const MAX_ROLES = 100
const MODES = ['add', 'replace', 'remove']

const isRoleEntry = entry =>
  entry &&
  typeof entry === 'object' &&
  typeof entry.roleId === 'string' &&
  !!entry.roleId &&
  (entry.canDownload === undefined || typeof entry.canDownload === 'boolean')

/** Resultado do modo sobre os cargos que o item já tinha: [{ roleId, canDownload }] */
function applyMode(mode, current, incoming, removeIds = new Set()) {
  if (mode === 'replace') return incoming

  const incomingIds = new Set(incoming.map(entry => entry.roleId))

  if (mode === 'remove') return current.filter(entry => !incomingIds.has(entry.roleId))

  // add: mantém o que já existe, aplica o nível aos cargos escolhidos e tira os de removeRoleIds
  return [...current.filter(entry => !incomingIds.has(entry.roleId) && !removeIds.has(entry.roleId)), ...incoming]
}

// POST /api/documents/access - { items: [{ kind, id }], mode: 'add'|'replace'|'remove', roles: [{ roleId, canDownload }],
// removeRoleIds?: [roleId] (só com mode 'add': adiciona/ajusta e tira cargos na mesma chamada) }
// Libera (ou retira) cargos de vários itens de uma vez, do mesmo workspace. SuperAdmin/SubAdmin, mesma regra de
// edição do acesso de um item só.
async function handlePost(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })

  const body = await req.json().catch(() => null)
  const { items, mode, roles: rawRoles, removeRoleIds: rawRemove = [] } = body && typeof body === 'object' ? body : {}

  const validItems =
    Array.isArray(items) &&
    items.length > 0 &&
    items.every(item => item && ['folder', 'file'].includes(item.kind) && typeof item.id === 'string' && item.id)

  const validRemove = Array.isArray(rawRemove) && rawRemove.every(id => typeof id === 'string' && !!id)

  if (
    !validItems ||
    !MODES.includes(mode) ||
    !Array.isArray(rawRoles) ||
    !rawRoles.every(isRoleEntry) ||
    !validRemove ||
    (rawRemove.length > 0 && mode !== 'add')
  ) {
    return jsonWithRequestId({ message: 'Dados inválidos' }, { status: 400, requestId })
  }

  // O modo "substituir" com lista vazia deixa os itens sem cargos (volta a herdar); os demais exigem alguma mudança
  if (mode !== 'replace' && rawRoles.length === 0 && rawRemove.length === 0) {
    return jsonWithRequestId({ message: 'Escolha ao menos um cargo' }, { status: 400, requestId })
  }

  const unique = [...new Map(items.map(item => [`${item.kind}:${item.id}`, item])).values()]

  if (unique.length > MAX_ITEMS) {
    return jsonWithRequestId(
      { message: `Selecione no máximo ${MAX_ITEMS} itens por vez` },
      { status: 400, requestId }
    )
  }

  const incoming = [...new Map(rawRoles.map(entry => [entry.roleId, entry.canDownload === true])).entries()].map(
    ([roleId, canDownload]) => ({ roleId, canDownload })
  )

  if (incoming.length > MAX_ROLES) {
    return jsonWithRequestId({ message: `Selecione no máximo ${MAX_ROLES} cargos` }, { status: 400, requestId })
  }

  const folderIds = unique.filter(item => item.kind === 'folder').map(item => item.id)
  const fileIds = unique.filter(item => item.kind === 'file').map(item => item.id)

  const [folders, files] = await Promise.all([
    prisma.documentFolder.findMany({ where: { id: { in: folderIds } }, select: { id: true, name: true, workspaceId: true } }),
    prisma.documentFile.findMany({ where: { id: { in: fileIds } }, select: { id: true, name: true, workspaceId: true } })
  ])

  if (folders.length !== folderIds.length || files.length !== fileIds.length) {
    return jsonWithRequestId({ message: 'Algum item não foi encontrado' }, { status: 404, requestId })
  }

  const workspaceIds = new Set([...folders, ...files].map(item => item.workspaceId))

  if (workspaceIds.size !== 1) {
    return jsonWithRequestId({ message: 'Os itens precisam ser do mesmo workspace' }, { status: 400, requestId })
  }

  const removeIds = new Set(rawRemove)
  const workspaceId = [...workspaceIds][0]
  const workspace = await loadWorkspaceForAccess(workspaceId)

  if (!canPerformDocumentAction(session.user, workspace, 'edit')) {
    logger.warn('document-access-bulk-denied', { requestId, userId: session.user.id, workspaceId })

    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })
  }

  if (!(await rolesBelongToWorkspace(incoming.map(entry => entry.roleId), workspaceId))) {
    return jsonWithRequestId({ message: 'Há cargos que não pertencem a este workspace' }, { status: 400, requestId })
  }

  const targets = [
    ...folders.map(item => ({ ...item, kind: 'folder' })),
    ...files.map(item => ({ ...item, kind: 'file' }))
  ]

  const changes = await prisma.$transaction(async tx => {
    const current = await getGrantedRolesByResource(
      targets.map(target => target.id),
      tx
    )

    const results = []

    for (const target of targets) {
      const before = (current.get(target.id) ?? []).map(role => ({ roleId: role.id, canDownload: role.canDownload }))
      const after = applyMode(mode, before, incoming, removeIds)

      await replaceItemGrants(tx, { resourceId: target.id, roles: after })
      results.push({ target, before, after })
    }

    return results
  })

  logger.info('document-access-bulk-success', {
    requestId,
    userId: session.user.id,
    workspaceId,
    mode,
    items: targets.length
  })

  for (const { target, before, after } of changes) {
    await createAuditLog({
      userId: session.user.id,
      tenantId: workspaceId,
      action: 'DOCUMENT_ACCESS_UPDATE',
      resource: target.kind === 'folder' ? 'document_folder' : 'document_file',
      resourceId: target.id,
      before: { roles: before },
      after: { roles: after },
      metadata: { requestId, name: target.name, bulk: true, mode, items: targets.length },
      requestId
    })
  }

  return jsonWithRequestId({ data: { updated: targets.length } }, { requestId })
}

export const POST = withDocumentErrorHandling('document-access-bulk-unhandled-error', handlePost)
