import { randomBytes } from "node:crypto"

import { Redis } from "ioredis"

export type RateLimitResult = "ok" | "limited" | "unavailable"

export type SlidingWindowRedis = {
  zremrangebyscore(key: string, min: number, max: number): Promise<number>
  zadd(key: string, score: number, member: string): Promise<number>
  zcard(key: string): Promise<number>
  pexpire(key: string, ms: number): Promise<number>
}

let redisClient: Promise<Redis> | undefined

export function createSlidingWindowLimiter(
  redis: SlidingWindowRedis,
  options: {
    limit: number
    windowMs: number
    keyFor: (id: string) => string
  }
): (id: string) => Promise<RateLimitResult> {
  const { limit, windowMs, keyFor } = options
  return async (id) => {
    const key = keyFor(id)
    const now = Date.now()
    const windowStart = now - windowMs
    const member = `${now}:${randomBytes(6).toString("hex")}`

    try {
      await redis.zremrangebyscore(key, 0, windowStart)
      await redis.zadd(key, now, member)
      const count = await redis.zcard(key)
      await redis.pexpire(key, windowMs)
      return count > limit ? "limited" : "ok"
    } catch {
      return "unavailable"
    }
  }
}

export function wrapRedisAsSlidingWindow(client: Redis): SlidingWindowRedis {
  return {
    zremrangebyscore: (key, min, max) => client.zremrangebyscore(key, min, max),
    zadd: (key, score, member) => client.zadd(key, score, member),
    zcard: (key) => client.zcard(key),
    pexpire: (key, ms) => client.pexpire(key, ms),
  }
}

function dropRedis(client: Redis): void {
  redisClient = undefined
  client.disconnect()
}

export async function getRateLimitRedisFromEnv(): Promise<Redis> {
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

export async function consumeSlidingWindowFromEnv(
  id: string,
  options: {
    limit: number
    windowMs: number
    keyFor: (id: string) => string
  }
): Promise<RateLimitResult> {
  try {
    const client = await getRateLimitRedisFromEnv()
    return createSlidingWindowLimiter(
      wrapRedisAsSlidingWindow(client),
      options
    )(id)
  } catch {
    return "unavailable"
  }
}

export function resetRateLimitRedisForTests(): void {
  redisClient = undefined
}
