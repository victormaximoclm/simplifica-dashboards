import { createAuditLog } from '@/libs/auditService'
import { logger } from '@/libs/logger'
import { prisma } from '@/libs/prisma'

// Chave fixa do advisory lock do Postgres: com mais de uma instância do app, só uma limpa por vez
const LOCK_KEY = 72_011_001

/**
 * Remove convites que passaram do prazo sem a conta ser criada: usuário ainda `pending`, que nunca entrou e cujo
 * convite já expirou. O convite vale 7 dias desde o envio (invite/route.js) e cada reenvio renova o prazo, então um
 * convite reenviado recentemente não é removido. Convites sem data de expiração não são tocados.
 *
 * Cada remoção vira um USER_INVITE_EXPIRED na auditoria (Ações Críticas), feito pelo sistema.
 */
export async function cleanupExpiredInvites({ now = new Date() } = {}) {
  const result = await prisma.$transaction(async tx => {
    const [{ locked }] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`

    if (!locked) return { skipped: true, removed: [] }

    const expired = await tx.user.findMany({
      where: { status: 'pending', lastLoginAt: null, inviteTokenExpiry: { lt: now } },
      select: { id: true, role: true, workspaceId: true, customRoleId: true, inviteTokenExpiry: true }
    })

    if (expired.length === 0) return { skipped: false, removed: [] }

    // Refaz o filtro na exclusão: quem aceitou o convite entre a busca e aqui não é apagado
    await tx.user.deleteMany({
      where: { id: { in: expired.map(user => user.id) }, status: 'pending', lastLoginAt: null }
    })

    const remaining = await tx.user.findMany({
      where: { id: { in: expired.map(user => user.id) } },
      select: { id: true }
    })

    const kept = new Set(remaining.map(user => user.id))

    return { skipped: false, removed: expired.filter(user => !kept.has(user.id)) }
  })

  for (const user of result.removed) {
    await createAuditLog({
      userId: null,
      tenantId: user.workspaceId,
      action: 'USER_INVITE_EXPIRED',
      resource: 'user',
      resourceId: user.id,
      before: {
        role: user.role,
        workspaceId: user.workspaceId,
        customRoleId: user.customRoleId,
        inviteTokenExpiry: user.inviteTokenExpiry
      },
      metadata: { via: 'cron', job: 'invite-cleanup' }
    })
  }

  if (result.removed.length) {
    logger.info('invite-cleanup-removed', { count: result.removed.length })
  }

  return { skipped: result.skipped, removed: result.removed.length }
}
