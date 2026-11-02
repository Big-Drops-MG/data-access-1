import { randomBytes } from "node:crypto"

import { Redis } from "ioredis"

import {
  MACHINE_RATE_LIMIT_PER_MINUTE,
  type MachineRateLimitResult,
} from "@/lib/auth/machine-hmac"

const WINDOW_MS = 60_000

export type SlidingWindowRedis = {
  zremrangebyscore(key: string, min: number, max: number): Promise<number>
  zadd(key: string, score: number, member: string): Promise<number>
  zcard(key: string): Promise<number>
  pexpire(key: string, ms: number): Promise<number>
}

let redisClient: Promise<Redis> | undefined

export function machineRateLimitKey(keyId: string): string {
  return `rl:ext:${keyId}`
}

/**
 * Sliding-window counter: 600 requests / 60s per key (SD#14.4).
 * Redis failures return `"unavailable"` so callers fail closed with 503.
 */
export function createMachineRateLimiter(
  redis: SlidingWindowRedis,
  limit: number = MACHINE_RATE_LIMIT_PER_MINUTE
): (keyId: string) => Promise<MachineRateLimitResult> {
  return async (keyId) => {
    const key = machineRateLimitKey(keyId)
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

export async function consumeMachineRateLimitFromEnv(
  keyId: string
): Promise<MachineRateLimitResult> {
  try {
    const client = await sharedRateLimitRedis()
    return createMachineRateLimiter({
      zremrangebyscore: (key, min, max) =>
        client.zremrangebyscore(key, min, max),
      zadd: (key, score, member) => client.zadd(key, score, member),
      zcard: (key) => client.zcard(key),
      pexpire: (key, ms) => client.pexpire(key, ms),
    })(keyId)
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
export function resetMachineRateLimitRedisForTests(): void {
  redisClient = undefined
}
