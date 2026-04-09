import { prisma } from '@/libs/prisma'

function truncate(value, max = 4000) {
  if (!value) return null
  const text = String(value)
  return text.length > max ? `${text.slice(0, max)}...` : text
}

export async function trackServerError({
  source = 'api',
  level = 'error',
  message,
  stack = null,
  path = null,
  method = null,
  requestId = null,
  userId = null,
  tenantId = null,
  metadata = null
}) {
  try {
    await prisma.errorEvent.create({
      data: {
        source,
        level,
        message: truncate(message, 800),
        stack: truncate(stack, 8000),
        path: truncate(path, 500),
        method: truncate(method, 20),
        requestId: truncate(requestId, 120),
        userId,
        tenantId,
        metadata: metadata || null
      }
    })
  } catch (error) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'error-tracking-write-failed',
        details: error instanceof Error ? error.message : String(error)
      })
    )
  }
}
