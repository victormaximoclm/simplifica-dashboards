export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { isHighAdmin } from '@/utils/roleHelpers'

const ADMIN_ACTIONS = [
  'WORKSPACE_CREATE',
  'WORKSPACE_UPDATE',
  'WORKSPACE_DELETE',
  'DASHBOARD_CREATE',
  'DASHBOARD_UPDATE',
  'DASHBOARD_DELETE',
  'CUSTOM_ROLE_CREATE',
  'CUSTOM_ROLE_UPDATE',
  'CUSTOM_ROLE_DELETE',
  'USER_INVITE',
  'USER_INVITE_RESEND',
  'USER_UPDATE',
  'USER_DELETE',
  'USER_PASSWORD_RESET',
  'DOCUMENT_FOLDER_CREATE',
  'DOCUMENT_FOLDER_RENAME',
  'DOCUMENT_FOLDER_MOVE',
  'DOCUMENT_FOLDER_DELETE',
  'DOCUMENT_FILE_UPLOAD',
  'DOCUMENT_FILE_RENAME',
  'DOCUMENT_FILE_MOVE',
  'DOCUMENT_FILE_DELETE',
  'DOCUMENT_FILE_VIEW',
  'DOCUMENT_FILE_DOWNLOAD',
  'DOCUMENT_HTML_CREATE',
  'DOCUMENT_HTML_UPDATE',
  'DOCUMENT_SITE_CREATE',
  'DOCUMENT_SITE_PAGE_CREATE',
  'DOCUMENT_SITE_PAGE_RENAME',
  'DOCUMENT_SITE_PAGE_UPDATE',
  'DOCUMENT_SITE_PAGE_MOVE',
  'DOCUMENT_SITE_PAGE_DELETE',
  'DOCUMENT_TEMPLATE_CREATE',
  'DOCUMENT_TEMPLATE_UPDATE',
  'DOCUMENT_TEMPLATE_DELETE'
]

export async function GET(req) {
  const requestId = getRequestId(req)
  const session = await getServerSession(authOptions)

  if (!session) return jsonWithRequestId({ message: 'Não autorizado' }, { status: 401, requestId })
  if (!isHighAdmin(session.user.role))
    return jsonWithRequestId({ message: 'Acesso negado' }, { status: 403, requestId })

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get('pageSize') || 20)))
  const tenantId = searchParams.get('tenantId') || undefined
  const userId = searchParams.get('userId') || undefined
  const q = searchParams.get('q') || undefined
  const from = searchParams.get('from') || undefined
  const to = searchParams.get('to') || undefined

  const createdAt =
    from || to
      ? {
          ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
          ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {})
        }
      : undefined

  // Busca também pelo nome do documento: nome atual do arquivo ou o nome guardado no log (arquivo já excluído)
  const matchingFileIds = q
    ? (
        await prisma.documentFile.findMany({
          where: { name: { contains: q, mode: 'insensitive' } },
          select: { id: true },
          take: 500
        })
      ).map(file => file.id)
    : []

  const where = {
    action: { in: ADMIN_ACTIONS },
    ...(tenantId ? { tenantId } : {}),
    ...(userId ? { userId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(q
      ? {
          OR: [
            { entityId: { contains: q, mode: 'insensitive' } },
            { action: { contains: q, mode: 'insensitive' } },
            { metadata: { path: ['name'], string_contains: q } },
            ...(matchingFileIds.length ? [{ entityType: 'document_file', entityId: { in: matchingFileIds } }] : [])
          ]
        }
      : {})
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        tenant: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.auditLog.count({ where })
  ])

  const dashboardIds = [...new Set(rows.filter(r => r.entityType === 'dashboard' && r.entityId).map(r => r.entityId))]
  const userEntityIds = [...new Set(rows.filter(r => r.entityType === 'user' && r.entityId).map(r => r.entityId))]

  const workspaceEntityIds = [
    ...new Set(rows.filter(r => r.entityType === 'workspace' && r.entityId).map(r => r.entityId))
  ]

  const customRoleIds = [
    ...new Set(rows.filter(r => r.entityType === 'custom_role' && r.entityId).map(r => r.entityId))
  ]

  const idsOf = entityType => [
    ...new Set(rows.filter(r => r.entityType === entityType && r.entityId).map(r => r.entityId))
  ]

  const documentFileIds = idsOf('document_file')
  const documentFolderIds = idsOf('document_folder')
  const documentTemplateIds = idsOf('document_html_template')

  const [dashboards, users, workspaces, customRoles, documentFiles, documentFolders, documentTemplates] =
    await Promise.all([
      dashboardIds.length
        ? prisma.dashboard.findMany({ where: { id: { in: dashboardIds } }, select: { id: true, title: true } })
        : Promise.resolve([]),
      userEntityIds.length
        ? prisma.user.findMany({ where: { id: { in: userEntityIds } }, select: { id: true, name: true, email: true } })
        : Promise.resolve([]),
      workspaceEntityIds.length
        ? prisma.workspace.findMany({ where: { id: { in: workspaceEntityIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      customRoleIds.length
        ? prisma.customRole.findMany({ where: { id: { in: customRoleIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      documentFileIds.length
        ? prisma.documentFile.findMany({ where: { id: { in: documentFileIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      documentFolderIds.length
        ? prisma.documentFolder.findMany({ where: { id: { in: documentFolderIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      documentTemplateIds.length
        ? prisma.documentHtmlTemplate.findMany({
            where: { id: { in: documentTemplateIds } },
            select: { id: true, name: true }
          })
        : Promise.resolve([])
    ])

  // Documentos: nome atual; se o item já foi excluído, o nome que ficou registrado no próprio log
  const documentNameById = new Map(
    [...documentFiles, ...documentFolders, ...documentTemplates].map(item => [item.id, item.name])
  )

  const loggedName = r => r.metadata?.name ?? r.after?.name ?? r.before?.name ?? null

  const dashboardById = new Map(dashboards.map(d => [d.id, d.title]))
  const userById = new Map(users.map(u => [u.id, u.name || u.email || u.id]))
  const workspaceById = new Map(workspaces.map(w => [w.id, w.name]))
  const customRoleById = new Map(customRoles.map(cr => [cr.id, cr.name]))

  const items = rows.map(r => {
    let resourceLabel = null

    if (r.entityType === 'dashboard' && r.entityId) resourceLabel = dashboardById.get(r.entityId) || null
    if (r.entityType === 'user' && r.entityId) resourceLabel = userById.get(r.entityId) || null
    if (r.entityType === 'workspace' && r.entityId) resourceLabel = workspaceById.get(r.entityId) || null
    if (r.entityType === 'custom_role' && r.entityId) resourceLabel = customRoleById.get(r.entityId) || null
    if (r.entityType?.startsWith('document_')) resourceLabel = documentNameById.get(r.entityId) || loggedName(r)

    return { ...r, resourceLabel }
  })

  logger.debug('audit-admin-list', { requestId, userId: session.user.id, total })

  return jsonWithRequestId(
    {
      items,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
    },
    { requestId }
  )
}
