// Simple in-memory rate limiter for API routes.
// Each key (e.g. IP) is tracked in a Map with a sliding window.
// For multi-instance deployments, replace with Redis-backed solution.

const stores = new Map()

/**
 * Creates a rate limiter with the given options.
 * @param {{ interval: number, limit: number }} opts
 *   interval – window size in ms (e.g. 60_000 for 1 min)
 *   limit    – max requests per window
 */
export function createRateLimit({ interval = 60_000, limit = 10 } = {}) {
  // Reuse or create store for this config
  const key = `${interval}:${limit}`

  if (!stores.has(key)) {
    stores.set(key, new Map())
  }

  const tokenStore = stores.get(key)

  return {
    /** @param {Request} req  @returns {{ success: boolean, remaining: number }} */
    check(req) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'

      const now = Date.now()
      const record = tokenStore.get(ip)

      if (!record || now - record.start > interval) {
        tokenStore.set(ip, { start: now, count: 1 })

        return { success: true, remaining: limit - 1 }
      }

      record.count += 1

      if (record.count > limit) {
        return { success: false, remaining: 0 }
      }

      return { success: true, remaining: limit - record.count }
    }
  }
}

// Pre-configured limiters
export const loginLimiter = createRateLimit({ interval: 60_000, limit: 8 }) // 8 attempts/min
export const setupLimiter = createRateLimit({ interval: 60_000, limit: 5 }) // 5 attempts/min
export const apiLimiter = createRateLimit({ interval: 60_000, limit: 60 }) // 60 req/min
