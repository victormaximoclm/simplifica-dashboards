import { prisma } from '@/libs/prisma'
import { logger } from '@/libs/logger'

const REDACT_KEYS = ['password', 'token', 'secret', 'inviteToken', 'cookie', 'authorization', 'email']

function redact(input) {
  if (Array.isArray(input)) return input.map(redact)
  if (!input || typeof input !== 'object') return input

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => {
      const lowered = key.toLowerCase()
      if (REDACT_KEYS.some(k => lowered.includes(k.toLowerCase()))) {
        return [key, '***']
      }
      return [key, redact(value)]
    })
  )
}

export async function createAuditLog({
  userId = null,
  tenantId = null,
  action,
  entityType = null,
  entityId = null,
  resource = null,
  resourceId = null,
  before = null,
  after = null,
  metadata = null,
  requestId = null
}) {
  try {
    const normalizedAction = String(action || '')
      .trim()
      .replace(/-/g, '_')
      .toUpperCase()
    const normalizedResource = resource || entityType
    const normalizedResourceId = resourceId || entityId

    await prisma.auditLog.create({
      data: {
        userId,
        tenantId,
        action: normalizedAction,
        entityType: normalizedResource || 'unknown',
        entityId: normalizedResourceId,
        before: before ? redact(before) : null,
        after: after ? redact(after) : null,
        metadata: metadata ? redact(metadata) : null
      }
    })
  } catch (error) {
    logger.error('audit-log-write-failed', {
      requestId,
      action: normalizedAction,
      entityType: normalizedResource,
      entityId: normalizedResourceId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export async function createDedupedAuditLog({
  dedupeWindowMinutes = 15,
  ...input
}) {
  const now = new Date()
  const from = new Date(now.getTime() - dedupeWindowMinutes * 60 * 1000)
  const action = String(input.action || '')
    .trim()
    .replace(/-/g, '_')
    .toUpperCase()
  const resource = input.resource || input.entityType
  const resourceId = input.resourceId || input.entityId || null

  const existing = await prisma.auditLog.findFirst({
    where: {
      action,
      userId: input.userId || null,
      entityType: resource || 'unknown',
      entityId: resourceId,
      createdAt: { gte: from }
    },
    select: { id: true }
  })

  if (existing) {
    return { created: false, deduped: true }
  }

  await createAuditLog({
    ...input,
    action,
    resource,
    resourceId
  })

  return { created: true, deduped: false }
}
