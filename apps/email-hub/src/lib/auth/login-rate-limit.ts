import {
  consumeSlidingWindowFromEnv,
  createSlidingWindowLimiter,
  type RateLimitResult,
  type SlidingWindowRedis,
} from "@/lib/rate-limit/sliding-window-redis"

const WINDOW_MS = 60_000
export const LOGIN_RATE_LIMIT_PER_MINUTE = 10

export type LoginRateLimitResult = RateLimitResult

export function loginRateLimitKey(ip: string): string {
  return `rl:login:${ip}`
}

export function isLoginOrSsoAuthPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "")
  const relative = path.startsWith("/api/auth")
    ? path.slice("/api/auth".length) || "/"
    : path
  return relative.startsWith("/sign-in/") || relative.startsWith("/callback/")
}

export function createLoginRateLimiter(
  redis: SlidingWindowRedis,
  limit: number = LOGIN_RATE_LIMIT_PER_MINUTE
): (ip: string) => Promise<LoginRateLimitResult> {
  return createSlidingWindowLimiter(redis, {
    limit,
    windowMs: WINDOW_MS,
    keyFor: loginRateLimitKey,
  })
}

export async function consumeLoginRateLimitFromEnv(
  ip: string
): Promise<LoginRateLimitResult> {
  return consumeSlidingWindowFromEnv(ip, {
    limit: LOGIN_RATE_LIMIT_PER_MINUTE,
    windowMs: WINDOW_MS,
    keyFor: loginRateLimitKey,
  })
}
