// Simple in-memory rate limiter.
// In production, prefer a distributed store (Redis/Upstash) to work across instances.
function createRateLimiter({ windowMs = 60 * 1000, max = 10 } = {}) {
  const hits = new Map()
  return {
    check(req) {
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
      const now = Date.now()
      if (!hits.has(ip)) hits.set(ip, [])
      const timestamps = hits.get(ip).filter(ts => now - ts < windowMs)
      timestamps.push(now)
      hits.set(ip, timestamps)
      return { success: timestamps.length <= max }
    }
  }
}

export const apiLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 20 })
export const loginLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 5 })
export const setupLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 2 })
