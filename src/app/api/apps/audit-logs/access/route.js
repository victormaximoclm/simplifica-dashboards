export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/libs/auth'
import { buildAuditSearchFilter, withResourceLabels } from '@/libs/auditResourceLabels'
import { getRequestId, jsonWithRequestId, logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'
import { isHighAdmin } from '@/utils/roleHelpers'

// Acessos: quem entrou, viu ou baixou. O que alguém fez (inclusive enviar formulário) fica em Ações Críticas.
// Cada chave é uma opção do filtro "Tipo" da tela.
const ACCESS_TYPES = {
  login: ['USER_LOGIN'],
  dashboard: ['DASHBOARD_VIEW', 'EMBED_ACCESS_BLOCKED'],
  file_view: ['DOCUMENT_FILE_VIEW'],
  file_download: ['DOCUMENT_FILE_DOWNLOAD']
}

const ACCESS_ACTIONS = Object.values(ACCESS_TYPES).flat()

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
    action: { in: Object.hasOwn(ACCESS_TYPES, type ?? '') ? ACCESS_TYPES[type] : ACCESS_ACTIONS },
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

  logger.debug('audit-access-list', { requestId, userId: session.user.id, total })

  return jsonWithRequestId(
    {
      items,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
    },
    { requestId }
  )
}
