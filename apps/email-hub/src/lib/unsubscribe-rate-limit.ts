import { randomBytes } from "node:crypto"

import { Redis } from "ioredis"

const WINDOW_MS = 60_000
export const UNSUBSCRIBE_RATE_LIMIT_PER_MINUTE = 30

export type UnsubscribeRateLimitResult = "ok" | "limited" | "unavailable"

export type SlidingWindowRedis = {
  zremrangebyscore(key: string, min: number, max: number): Promise<number>
  zadd(key: string, score: number, member: string): Promise<number>
  zcard(key: string): Promise<number>
  pexpire(key: string, ms: number): Promise<number>
}

let redisClient: Promise<Redis> | undefined

export function unsubscribeRateLimitKey(ip: string): string {
  return `rl:u:${ip}`
}

/**
 * Sliding-window counter: 30 requests / 60s per IP for `/api/u/*` (SD#14.4).
 * Redis failures return `"unavailable"` so callers fail closed with 503.
 */
export function createUnsubscribeRateLimiter(
  redis: SlidingWindowRedis,
  limit: number = UNSUBSCRIBE_RATE_LIMIT_PER_MINUTE
): (ip: string) => Promise<UnsubscribeRateLimitResult> {
  return async (ip) => {
    const key = unsubscribeRateLimitKey(ip)
    const now = Date.now()
    const windowStart = now - WINDOW_MS
    const member = `${now}:${randomBytes(6).toString("hex")}`

    try {
      await redis.zremrangebyscore(key, 0, windowStart)
      await redis.zadd(key, now, member)
      const count = await redis.zcard(key)
      await redis.pexpire(key, WINDOW_MS)
      return count > limit ? "limited" : "ok"
    } catch {
      return "unavailable"
    }
  }
}

export async function consumeUnsubscribeRateLimitFromEnv(
  ip: string
): Promise<UnsubscribeRateLimitResult> {
  try {
    const client = await sharedRateLimitRedis()
    return createUnsubscribeRateLimiter({
      zremrangebyscore: (key, min, max) =>
        client.zremrangebyscore(key, min, max),
      zadd: (key, score, member) => client.zadd(key, score, member),
      zcard: (key) => client.zcard(key),
      pexpire: (key, ms) => client.pexpire(key, ms),
    })(ip)
  } catch {
    return "unavailable"
  }
}

function dropRedis(client: Redis): void {
  redisClient = undefined
  client.disconnect()
}

async function sharedRateLimitRedis(): Promise<Redis> {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured")
  }
  if (!redisClient) {
    const client = new Redis(redisUrl, {
      connectTimeout: 2_000,
      commandTimeout: 2_000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      enableOfflineQueue: false,
      lazyConnect: true,
    })
    client.on("error", () => undefined)
    redisClient = client.connect().then(
      () => client,
      (error: unknown) => {
        dropRedis(client)
        throw error
      }
    )
  }
  return redisClient
}

/** Test helper — drop the shared client between suites. */
export function resetUnsubscribeRateLimitRedisForTests(): void {
  redisClient = undefined
}
