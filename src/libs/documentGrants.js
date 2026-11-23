import { prisma } from '@/libs/prisma'
import { getDocumentViewMode } from '@/libs/documentPermissions'

/**
 * Acesso por cargo a pastas e arquivos (Sites inclusos). Mesmo modelo de Dashboards: linhas
 * RolePermission(customRoleId, módulo "documents", action, resourceId = id da pasta/arquivo), com duas ações:
 * "view" (ver) e "download" (baixar, sempre junto com "view"). O padrão é restrito.
 *
 * Regras (para quem está em modo 'grants', ver getDocumentViewMode), parecidas com as do Google Drive:
 * - Liberar uma pasta libera tudo dentro dela (subpastas e arquivos), com o mesmo nível (ver ou ver e baixar).
 * - Item sem cargos próprios herda da pasta onde está; com cargos próprios, vale só o que foi dado a ele.
 *   Na raiz, sem cargos = restrito (só admin e acima).
 * - Liberar só um arquivo (ou uma subpasta) mostra o caminho até ele: as pastas acima aparecem apenas como
 *   passagem e listam somente o que o cargo pode ver. Os outros itens delas ficam ocultos.
 * - Ver não é baixar: o download exige a ação "download" no item (ou herdada da pasta).
 * Criar, editar, mover e excluir continuam só com SuperAdmin/SubAdmin (documentPermissions.js).
 */

export const DOCUMENTS_MODULE_KEY = 'documents'

const MAX_DEPTH = 50

export const getDocumentsModule = (client = prisma) => client.module.findUnique({ where: { key: DOCUMENTS_MODULE_KEY } })

const NO_ID = { in: [] }

const ALL_VIEWER = {
  mode: 'all',
  canSeeFolder: () => true,
  canSeeFile: () => true,
  canDownloadFile: () => true,
  folderWhere: () => ({}),
  fileWhere: () => ({})
}

const NONE_VIEWER = {
  mode: 'none',
  canSeeFolder: () => false,
  canSeeFile: () => false,
  canDownloadFile: () => false,
  folderWhere: () => ({ id: NO_ID }),
  fileWhere: () => ({ id: NO_ID })
}

/**
 * Quem enxerga o quê neste workspace, resolvido uma vez por requisição (nada de consulta por item):
 * `canSeeFolder(id)`, `canSeeFile({ id, folderId })`, `canDownloadFile({ id, folderId })` e os filtros do Prisma
 * `folderWhere()`/`fileWhere()` para as listagens (combine com AND).
 */
export async function getDocumentViewer(user, workspace, client = prisma) {
  const mode = getDocumentViewMode(user, workspace)

  if (mode === 'all') return ALL_VIEWER
  if (mode === 'none') return NONE_VIEWER

  const [dbUser, documentsModule] = await Promise.all([
    client.user.findUnique({ where: { id: user.id }, select: { customRoleId: true } }),
    getDocumentsModule(client)
  ])

  const myRoleId = dbUser?.customRoleId

  if (!myRoleId || !documentsModule) return NONE_VIEWER

  const [folders, grants] = await Promise.all([
    client.documentFolder.findMany({ where: { workspaceId: workspace.id }, select: { id: true, parentId: true } }),

    // Só cargos deste workspace contam (o cargo do usuário pertence a um único workspace)
    client.rolePermission.findMany({
      where: {
        moduleId: documentsModule.id,
        action: { in: ['view', 'download'] },
        resourceId: { not: null },
        customRole: { workspaceId: workspace.id }
      },
      select: { resourceId: true, customRoleId: true, action: true }
    })
  ])

  const parentOf = new Map(folders.map(folder => [folder.id, folder.parentId]))
  const granted = new Set() // itens com algum cargo próprio
  const viewMine = new Set() // itens que o cargo do usuário vê
  const downloadMine = new Set() // itens que o cargo do usuário também baixa

  for (const grant of grants) {
    if (grant.action === 'view') granted.add(grant.resourceId)

    if (grant.customRoleId !== myRoleId) continue

    if (grant.action === 'view') viewMine.add(grant.resourceId)
    else downloadMine.add(grant.resourceId)
  }

  const ownAccess = id => (viewMine.has(id) ? { download: downloadMine.has(id) } : null)
  const folderMemo = new Map()

  // Acesso à pasta: o que ela tem de próprio ou, sem cargos próprios, o que herda da pasta de cima
  function folderAccess(id, depth = 0) {
    if (!parentOf.has(id) || depth > MAX_DEPTH) return null

    if (!folderMemo.has(id)) {
      folderMemo.set(id, null) // corta laços em árvore corrompida

      const parentId = parentOf.get(id)

      folderMemo.set(id, granted.has(id) ? ownAccess(id) : parentId ? folderAccess(parentId, depth + 1) : null)
    }

    return folderMemo.get(id)
  }

  const fileAccess = file => {
    if (!file) return null
    if (granted.has(file.id)) return ownAccess(file.id)

    return file.folderId ? folderAccess(file.folderId) : null
  }

  // Pastas que só servem de caminho: ficam acima de algum item liberado diretamente (pasta ou arquivo)
  const directIds = [...viewMine]
  const fileIds = directIds.filter(id => !parentOf.has(id))

  const directFiles = fileIds.length
    ? await client.documentFile.findMany({
        where: { id: { in: fileIds }, workspaceId: workspace.id },
        select: { id: true, folderId: true }
      })
    : []

  const passThrough = new Set()

  const markAncestors = startId => {
    let currentId = startId

    for (let depth = 0; currentId && depth <= MAX_DEPTH && !passThrough.has(currentId); depth++) {
      passThrough.add(currentId)
      currentId = parentOf.get(currentId) ?? null
    }
  }

  for (const id of directIds) if (parentOf.has(id)) markAncestors(parentOf.get(id))
  for (const file of directFiles) markAncestors(file.folderId)

  const allFolderIds = folders.map(folder => folder.id)
  const accessibleFolderIds = allFolderIds.filter(id => folderAccess(id))
  const visibleFolderIds = allFolderIds.filter(id => folderAccess(id) || passThrough.has(id))

  return {
    mode,
    canSeeFolder: id => !!folderAccess(id) || passThrough.has(id),
    canSeeFile: file => !!fileAccess(file),
    canDownloadFile: file => fileAccess(file)?.download === true,
    folderWhere: () => ({ id: { in: visibleFolderIds } }),
    fileWhere: () => ({
      OR: [
        { id: { in: directIds } },
        { id: { notIn: [...granted] }, folderId: { in: accessibleFolderIds } }
      ]
    })
  }
}

/** Visibilidade de um item já carregado (pasta: { id }, arquivo: { id, folderId }) */
export const canViewerSeeItem = (viewer, kind, item) =>
  kind === 'folder' ? viewer.canSeeFolder(item.id) : viewer.canSeeFile(item)

/**
 * Cargos com acesso a cada item: Map<resourceId, [{ id, name, canDownload }]> (só os itens informados).
 * Cada cargo aparece uma vez, com `canDownload` quando também baixa.
 */
export async function getGrantedRolesByResource(resourceIds, client = prisma) {
  const byResource = new Map()

  if (!resourceIds.length) return byResource

  const documentsModule = await getDocumentsModule(client)

  if (!documentsModule) return byResource

  const grants = await client.rolePermission.findMany({
    where: { moduleId: documentsModule.id, action: { in: ['view', 'download'] }, resourceId: { in: resourceIds } },
    include: { customRole: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' }
  })

  const rolesByKey = new Map()

  for (const grant of grants) {
    const key = `${grant.resourceId}:${grant.customRoleId}`

    if (!rolesByKey.has(key)) {
      const role = { ...grant.customRole, canDownload: false }

      rolesByKey.set(key, role)
      byResource.set(grant.resourceId, [...(byResource.get(grant.resourceId) ?? []), role])
    }

    if (grant.action === 'download') rolesByKey.get(key).canDownload = true
  }

  return byResource
}

/**
 * Troca, de uma vez, os cargos com acesso a um item: `roles` = [{ roleId, canDownload }]. Todo cargo recebe "view";
 * "download" só quando `canDownload`. Chame dentro de uma transação.
 */
export async function replaceItemGrants(tx, { resourceId, roles }) {
  const documentsModule = await getDocumentsModule(tx)

  if (!documentsModule) throw new Error('Módulo de documentos não cadastrado')

  await tx.rolePermission.deleteMany({
    where: { moduleId: documentsModule.id, action: { in: ['view', 'download'] }, resourceId }
  })

  const rows = roles.flatMap(({ roleId, canDownload }) =>
    ['view', ...(canDownload ? ['download'] : [])].map(action => ({
      id: `rp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      customRoleId: roleId,
      moduleId: documentsModule.id,
      action,
      resourceId
    }))
  )

  if (rows.length) await tx.rolePermission.createMany({ data: rows, skipDuplicates: true })
}

/** resourceId não tem chave estrangeira: ao excluir pastas/arquivos, apague as concessões deles (dentro da transação) */
export async function deleteItemGrants(tx, resourceIds) {
  if (!resourceIds.length) return

  const documentsModule = await getDocumentsModule(tx)

  if (!documentsModule) return

  await tx.rolePermission.deleteMany({ where: { moduleId: documentsModule.id, resourceId: { in: resourceIds } } })
}
