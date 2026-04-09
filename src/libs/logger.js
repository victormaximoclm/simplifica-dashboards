import crypto from 'crypto'
import pino from 'pino'
import { trackServerError } from '@/libs/errorTracking'

const SENSITIVE_KEY_PARTS = ['password', 'token', 'secret', 'authorization', 'cookie', 'set-cookie', 'email']

function isSensitiveKey(key) {
  const normalized = String(key || '').toLowerCase()

  return SENSITIVE_KEY_PARTS.some(part => normalized.includes(part))
}

function maskValue(value) {
  if (typeof value === 'string') {
    if (value.length <= 6) return '***'
    return `${value.slice(0, 2)}***${value.slice(-2)}`
  }

  return '***'
}

function sanitizeMeta(input) {
  if (Array.isArray(input)) {
    return input.map(item => sanitizeMeta(item))
  }

  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => {
        if (isSensitiveKey(key)) {
          return [key, maskValue(value)]
        }

        return [key, sanitizeMeta(value)]
      })
    )
  }

  return input
}

const baseLogger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: undefined
})

export function getRequestId(req) {
  return req.headers.get('x-request-id') || crypto.randomUUID()
}

function buildEntry(level, message, meta = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  }
}

function write(level, message, meta) {
  const entry = buildEntry(level, message, sanitizeMeta(meta))
  baseLogger[level](entry, message)
}

export const logger = {
  debug(message, meta) {
    write('debug', message, meta)
  },
  info(message, meta) {
    write('info', message, meta)
  },
  warn(message, meta) {
    write('warn', message, meta)
  },
  error(message, meta) {
    write('error', message, meta)
  }
}

export function captureException(error, context = {}) {
  const safeContext = sanitizeMeta(context)
  logger.error('captured-exception', {
    error: error instanceof Error ? error.message : String(error),
    ...safeContext
  })
  trackServerError({
    source: 'api',
    level: 'error',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
    requestId: safeContext.requestId || null,
    userId: safeContext.userId || null,
    tenantId: safeContext.tenantId || null,
    metadata: safeContext
  })
}

export function jsonWithRequestId(data, { status = 200, requestId, headers = {} } = {}) {
  const response = Response.json(data, { status, headers })

  if (requestId) {
    response.headers.set('x-request-id', requestId)
  }

  return response
}

export function applyRateLimitHeaders(response, rate) {
  if (!rate) return response
  response.headers.set('X-RateLimit-Limit', String(rate.limit))
  response.headers.set('X-RateLimit-Remaining', String(rate.remaining))
  response.headers.set('X-RateLimit-Reset', String(rate.reset))
  return response
}
