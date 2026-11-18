import {
  consumeSlidingWindowFromEnv,
  createSlidingWindowLimiter,
  type RateLimitResult,
  type SlidingWindowRedis,
} from "@/lib/rate-limit/sliding-window-redis"

const WINDOW_MS = 60_000
export const STAFF_RATE_LIMIT_PER_MINUTE = 300

export type StaffRateLimitResult = RateLimitResult

export function staffRateLimitKey(userId: string): string {
  return `rl:staff:${userId}`
}

export function createStaffRateLimiter(
  redis: SlidingWindowRedis,
  limit: number = STAFF_RATE_LIMIT_PER_MINUTE
): (userId: string) => Promise<StaffRateLimitResult> {
  return createSlidingWindowLimiter(redis, {
    limit,
    windowMs: WINDOW_MS,
    keyFor: staffRateLimitKey,
  })
}

export async function consumeStaffRateLimitFromEnv(
  userId: string
): Promise<StaffRateLimitResult> {
  return consumeSlidingWindowFromEnv(userId, {
    limit: STAFF_RATE_LIMIT_PER_MINUTE,
    windowMs: WINDOW_MS,
    keyFor: staffRateLimitKey,
  })
}
