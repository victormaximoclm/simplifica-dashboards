export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { buildAuditSearchFilter, withResourceLabels } from '@/libs/auditResourceLabels'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { isHighAdmin } from '@/utils/roleHelpers'

// Ações: o que alguém fez no sistema, inclusive enviar formulário. Entrar, ver e baixar fica no Audit de Acesso.
// Cada chave é uma opção do filtro "Tipo" da tela.
const ACTION_TYPES = {
  form_submit: ['FORM_SUBMIT', 'FORM_SUBMIT_FAILED', 'FORM_SUBMIT_REJECTED'],
  form_manage: ['FORM_CREATE', 'FORM_UPDATE', 'FORM_DELETE', 'FORM_LINK_CREATE', 'FORM_LINK_REVOKE'],
  documents: [
    'DOCUMENT_FOLDER_CREATE',
    'DOCUMENT_FOLDER_RENAME',
    'DOCUMENT_FOLDER_MOVE',
    'DOCUMENT_FOLDER_DELETE',
    'DOCUMENT_FILE_UPLOAD',
    'DOCUMENT_FILE_RENAME',
    'DOCUMENT_FILE_MOVE',
    'DOCUMENT_FILE_DELETE',
    'DOCUMENT_HTML_CREATE',
    'DOCUMENT_HTML_UPDATE',
    'DOCUMENT_SITE_CREATE',
    'DOCUMENT_SITE_PAGE_CREATE',
    'DOCUMENT_SITE_PAGE_RENAME',
    'DOCUMENT_SITE_PAGE_UPDATE',
    'DOCUMENT_SITE_PAGE_MOVE',
    'DOCUMENT_SITE_PAGE_DELETE',
    'DOCUMENT_ACCESS_UPDATE',
    'DOCUMENT_TEMPLATE_CREATE',
    'DOCUMENT_TEMPLATE_UPDATE',
    'DOCUMENT_TEMPLATE_DELETE'
  ],
  dashboards: ['DASHBOARD_CREATE', 'DASHBOARD_UPDATE', 'DASHBOARD_DELETE'],
  users: [
    'USER_INVITE',
    'USER_INVITE_RESEND',
    'USER_UPDATE',
    'USER_DELETE',
    'USER_PASSWORD_RESET',
    'CUSTOM_ROLE_CREATE',
    'CUSTOM_ROLE_UPDATE',
    'CUSTOM_ROLE_DELETE'
  ],
  workspaces: ['WORKSPACE_CREATE', 'WORKSPACE_UPDATE', 'WORKSPACE_DELETE']
}

const ACTION_ACTIONS = Object.values(ACTION_TYPES).flat()

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
  const type = searchParams.get('type') || undefined
  const from = searchParams.get('from') || undefined
  const to = searchParams.get('to') || undefined

  const createdAt =
    from || to
      ? {
          ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
          ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {})
        }
      : undefined

  const where = {
    action: { in: Object.hasOwn(ACTION_TYPES, type ?? '') ? ACTION_TYPES[type] : ACTION_ACTIONS },
    ...(tenantId ? { tenantId } : {}),
    ...(userId ? { userId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(await buildAuditSearchFilter(q))
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

  const items = await withResourceLabels(rows)

  logger.debug('audit-admin-list', { requestId, userId: session.user.id, total })

  return jsonWithRequestId(
    {
      items,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
    },
    { requestId }
  )
}
