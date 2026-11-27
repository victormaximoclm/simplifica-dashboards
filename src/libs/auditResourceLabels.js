import { formPublicUrl } from '@/libs/formlinkservice'
import { prisma } from '@/libs/prisma'

/**
 * Nome legível do recurso de cada linha do AuditLog (coluna "Nome do Recurso" das telas de audit).
 * Usa o nome atual; se o item já foi excluído, o nome que ficou registrado no próprio log.
 */

const idsOf = (rows, entityType) => [
  ...new Set(rows.filter(r => r.entityType === entityType && r.entityId).map(r => r.entityId))
]

const findNames = (ids, query) => (ids.length ? query(ids) : Promise.resolve([]))

// Envios por link público guardam publicLinkId; criar e revogar link guardam linkId
const publicLinkIdOf = r => (r.entityType === 'form' ? (r.after?.publicLinkId ?? r.after?.linkId ?? null) : null)

const loggedName = r => r.metadata?.name ?? r.after?.name ?? r.before?.name ?? r.after?.title ?? r.before?.title ?? null

export async function withResourceLabels(rows) {
  const select = { id: true, name: true }

  const linkIds = [...new Set(rows.map(publicLinkIdOf).filter(Boolean))]

  const [dashboards, users, workspaces, customRoles, forms, documentFiles, documentFolders, documentTemplates, links] =
    await Promise.all([
      findNames(idsOf(rows, 'dashboard'), ids =>
        prisma.dashboard.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } })
      ),
      findNames(idsOf(rows, 'user'), ids =>
        prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })
      ),
      findNames(idsOf(rows, 'workspace'), ids => prisma.workspace.findMany({ where: { id: { in: ids } }, select })),
      findNames(idsOf(rows, 'custom_role'), ids => prisma.customRole.findMany({ where: { id: { in: ids } }, select })),
      findNames(idsOf(rows, 'form'), ids =>
        prisma.form.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } })
      ),
      findNames(idsOf(rows, 'document_file'), ids =>
        prisma.documentFile.findMany({ where: { id: { in: ids } }, select })
      ),
      findNames(idsOf(rows, 'document_folder'), ids =>
        prisma.documentFolder.findMany({ where: { id: { in: ids } }, select })
      ),
      findNames(idsOf(rows, 'document_html_template'), ids =>
        prisma.documentHtmlTemplate.findMany({ where: { id: { in: ids } }, select })
      ),
      findNames(linkIds, ids =>
        prisma.formPublicLink.findMany({
          where: { id: { in: ids } },
          select: { id: true, token: true, permanent: true }
        })
      )
    ])

  const labels = {
    dashboard: new Map(dashboards.map(d => [d.id, d.title])),
    user: new Map(users.map(u => [u.id, u.name || u.email || u.id])),
    workspace: new Map(workspaces.map(w => [w.id, w.name])),
    custom_role: new Map(customRoles.map(cr => [cr.id, cr.name])),
    form: new Map(forms.map(f => [f.id, f.title]))
  }

  const documentNameById = new Map(
    [...documentFiles, ...documentFolders, ...documentTemplates].map(item => [item.id, item.name])
  )

  const linkById = new Map(links.map(link => [link.id, link]))

  // Link público usado no envio (ou criado/revogado). Link já excluído: fica só o id.
  const publicLinkOf = r => {
    const id = publicLinkIdOf(r)

    if (!id) return null
    const link = linkById.get(id)

    return link ? { id, url: formPublicUrl(link.token), permanent: link.permanent } : { id, url: null, permanent: null }
  }

  return rows.map(r => {
    let resourceLabel = null

    if (r.entityType?.startsWith('document_')) resourceLabel = documentNameById.get(r.entityId) || loggedName(r)
    else if (r.entityType === 'form') resourceLabel = labels.form.get(r.entityId) || loggedName(r)
    else if (labels[r.entityType] && r.entityId) resourceLabel = labels[r.entityType].get(r.entityId) || null

    return { ...r, resourceLabel, publicLink: publicLinkOf(r) }
  })
}

/** Filtro de busca das telas de audit: ação, ID, nome registrado no log ou nome atual do arquivo/formulário */
export async function buildAuditSearchFilter(q) {
  if (!q) return {}

  const [files, forms] = await Promise.all([
    prisma.documentFile.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      select: { id: true },
      take: 500
    }),
    prisma.form.findMany({ where: { title: { contains: q, mode: 'insensitive' } }, select: { id: true }, take: 500 })
  ])

  return {
    OR: [
      { entityId: { contains: q, mode: 'insensitive' } },
      { action: { contains: q, mode: 'insensitive' } },
      { metadata: { path: ['name'], string_contains: q } },
      ...(files.length ? [{ entityType: 'document_file', entityId: { in: files.map(f => f.id) } }] : []),
      ...(forms.length ? [{ entityType: 'form', entityId: { in: forms.map(f => f.id) } }] : [])
    ]
  }
}
