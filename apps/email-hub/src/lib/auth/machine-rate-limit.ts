import {
  MACHINE_RATE_LIMIT_PER_MINUTE,
  type MachineRateLimitResult,
} from "@/lib/auth/machine-hmac"
import {
  consumeSlidingWindowFromEnv,
  createSlidingWindowLimiter,
  resetRateLimitRedisForTests,
  type SlidingWindowRedis,
} from "@/lib/rate-limit/sliding-window-redis"

const WINDOW_MS = 60_000

export type { SlidingWindowRedis }

export function machineRateLimitKey(keyId: string): string {
  return `rl:ext:${keyId}`
}

export function createMachineRateLimiter(
  redis: SlidingWindowRedis,
  limit: number = MACHINE_RATE_LIMIT_PER_MINUTE
): (keyId: string) => Promise<MachineRateLimitResult> {
  return createSlidingWindowLimiter(redis, {
    limit,
    windowMs: WINDOW_MS,
    keyFor: machineRateLimitKey,
  })
}

export async function consumeMachineRateLimitFromEnv(
  keyId: string
): Promise<MachineRateLimitResult> {
  return consumeSlidingWindowFromEnv(keyId, {
    limit: MACHINE_RATE_LIMIT_PER_MINUTE,
    windowMs: WINDOW_MS,
    keyFor: machineRateLimitKey,
  })
}

export function resetMachineRateLimitRedisForTests(): void {
  resetRateLimitRedisForTests()
}
