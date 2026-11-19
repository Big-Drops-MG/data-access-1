import {
  consumeSlidingWindowFromEnv,
  createSlidingWindowLimiter,
  type RateLimitResult,
  type SlidingWindowRedis,
} from "@/lib/rate-limit/sliding-window-redis"

const WINDOW_MS = 10 * 60_000
export const TWO_FACTOR_RATE_LIMIT_PER_WINDOW = 5

export type TwoFactorRateLimitResult = RateLimitResult

export function twoFactorRateLimitKey(userId: string): string {
  return `rl:2fa:${userId}`
}

export function createTwoFactorRateLimiter(
  redis: SlidingWindowRedis,
  limit: number = TWO_FACTOR_RATE_LIMIT_PER_WINDOW
): (userId: string) => Promise<TwoFactorRateLimitResult> {
  return createSlidingWindowLimiter(redis, {
    limit,
    windowMs: WINDOW_MS,
    keyFor: twoFactorRateLimitKey,
  })
}

export async function consumeTwoFactorRateLimitFromEnv(
  userId: string
): Promise<TwoFactorRateLimitResult> {
  return consumeSlidingWindowFromEnv(userId, {
    limit: TWO_FACTOR_RATE_LIMIT_PER_WINDOW,
    windowMs: WINDOW_MS,
    keyFor: twoFactorRateLimitKey,
  })
}
