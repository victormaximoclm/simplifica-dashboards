import Redis from 'ioredis'

let redisClient
const localStores = new Map()

function getRedisClient() {
  if (redisClient) return redisClient
  const redisUrl = process.env.REDIS_URL

  if (!redisUrl) {
    return null
  }

  redisClient = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  })

  return redisClient
}

function checkInMemory({ bucket, keyValue, interval, limit }) {
  if (!localStores.has(bucket)) {
    localStores.set(bucket, new Map())
  }

  const tokenStore = localStores.get(bucket)
  const now = Date.now()
  const record = tokenStore.get(keyValue)

  if (!record || now - record.start > interval) {
    tokenStore.set(keyValue, { start: now, count: 1 })
    return { success: true, remaining: limit - 1, limit, reset: Math.ceil(interval / 1000) }
  }

  record.count += 1
  const remaining = Math.max(0, limit - record.count)
  const reset = Math.max(0, Math.ceil((interval - (now - record.start)) / 1000))

  if (record.count > limit) {
    return { success: false, remaining: 0, limit, reset }
  }

  return { success: true, remaining, limit, reset }
}

/**
 * Creates a rate limiter with the given options.
 * @param {{ interval: number, limit: number }} opts
 *   interval – window size in ms (e.g. 60_000 for 1 min)
 *   limit    – max requests per window
 */
export function createRateLimit({ interval = 60_000, limit = 10 } = {}) {
  const bucket = `${interval}:${limit}`

  return {
    /**
     * @param {Request} req
     * @param {string} [customKey]
     * @returns {Promise<{ success: boolean, remaining: number, limit: number, reset: number }>}
     */
    async check(req, customKey) {
      const client = getRedisClient()
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
      const keyValue = String(customKey || ip)

      if (!client) {
        return checkInMemory({ bucket, keyValue, interval, limit })
      }

      if (client.status !== 'ready') {
        await client.connect()
      }

      const redisKey = `ratelimit:${bucket}:${keyValue}`
      const count = await client.incr(redisKey)

      if (count === 1) {
        await client.pexpire(redisKey, interval)
      }

      const ttl = await client.pttl(redisKey)
      const reset = Math.max(0, Math.ceil(ttl / 1000))
      const remaining = Math.max(0, limit - count)

      if (count > limit) {
        return { success: false, remaining: 0, limit, reset }
      }

      return { success: true, remaining, limit, reset }
    }
  }
}

// Pre-configured limiters
export const loginLimiter = createRateLimit({ interval: 60_000, limit: 8 }) // 8 attempts/min
export const setupLimiter = createRateLimit({ interval: 60_000, limit: 5 }) // 5 attempts/min
export const apiLimiter = createRateLimit({ interval: 60_000, limit: 60 }) // 60 req/min
