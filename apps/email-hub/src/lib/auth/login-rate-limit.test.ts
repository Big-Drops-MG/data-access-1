import { describe, expect, it, vi } from "vitest"

import {
  createLoginRateLimiter,
  isLoginOrSsoAuthPath,
  loginRateLimitKey,
} from "./login-rate-limit"

describe("login rate limit", () => {
  it("matches login and SSO callback paths", () => {
    expect(isLoginOrSsoAuthPath("/api/auth/sign-in/social")).toBe(true)
    expect(isLoginOrSsoAuthPath("/api/auth/callback/google")).toBe(true)
    expect(isLoginOrSsoAuthPath("/sign-in/social")).toBe(true)
    expect(isLoginOrSsoAuthPath("/api/auth/get-session")).toBe(false)
    expect(isLoginOrSsoAuthPath("/api/auth/two-factor/verify-totp")).toBe(false)
  })

  it("allows 10 requests per IP then limits", async () => {
    const members = new Map<string, number>()
    const redis = {
      zremrangebyscore: vi.fn(async () => 0),
      zadd: vi.fn(async (_key: string, score: number, member: string) => {
        members.set(member, score)
        return 1
      }),
      zcard: vi.fn(async () => members.size),
      pexpire: vi.fn(async () => 1),
    }
    const limit = createLoginRateLimiter(redis, 10)
    for (let i = 0; i < 10; i += 1) {
      expect(await limit("203.0.113.9")).toBe("ok")
    }
    expect(await limit("203.0.113.9")).toBe("limited")
    expect(loginRateLimitKey("203.0.113.9")).toBe("rl:login:203.0.113.9")
  })

  it("returns unavailable when Redis throws", async () => {
    const redis = {
      zremrangebyscore: vi.fn(async () => {
        throw new Error("down")
      }),
      zadd: vi.fn(async () => 1),
      zcard: vi.fn(async () => 1),
      pexpire: vi.fn(async () => 1),
    }
    expect(await createLoginRateLimiter(redis)("1.1.1.1")).toBe("unavailable")
  })
})
