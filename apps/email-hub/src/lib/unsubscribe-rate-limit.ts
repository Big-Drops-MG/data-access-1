import {
  consumeSlidingWindowFromEnv,
  createSlidingWindowLimiter,
  resetRateLimitRedisForTests,
  type RateLimitResult,
  type SlidingWindowRedis,
} from "@/lib/rate-limit/sliding-window-redis"

const WINDOW_MS = 60_000
export const UNSUBSCRIBE_RATE_LIMIT_PER_MINUTE = 30

export type UnsubscribeRateLimitResult = RateLimitResult

export type { SlidingWindowRedis }

export function unsubscribeRateLimitKey(ip: string): string {
  return `rl:u:${ip}`
}

export function createUnsubscribeRateLimiter(
  redis: SlidingWindowRedis,
  limit: number = UNSUBSCRIBE_RATE_LIMIT_PER_MINUTE
): (ip: string) => Promise<UnsubscribeRateLimitResult> {
  return createSlidingWindowLimiter(redis, {
    limit,
    windowMs: WINDOW_MS,
    keyFor: unsubscribeRateLimitKey,
  })
}

export async function consumeUnsubscribeRateLimitFromEnv(
  ip: string
): Promise<UnsubscribeRateLimitResult> {
  return consumeSlidingWindowFromEnv(ip, {
    limit: UNSUBSCRIBE_RATE_LIMIT_PER_MINUTE,
    windowMs: WINDOW_MS,
    keyFor: unsubscribeRateLimitKey,
  })
}

export function resetUnsubscribeRateLimitRedisForTests(): void {
  resetRateLimitRedisForTests()
}
