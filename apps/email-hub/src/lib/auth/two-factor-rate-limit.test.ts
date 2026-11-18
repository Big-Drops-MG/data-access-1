import { describe, expect, it, vi } from "vitest"

import {
  createTwoFactorRateLimiter,
  twoFactorRateLimitKey,
} from "./two-factor-rate-limit"

describe("two-factor rate limit", () => {
  it("allows 5 requests per user then limits", async () => {
    const store = new Map<string, { score: number; member: string }[]>()
    const redis = {
      zremrangebyscore: vi.fn(async () => 0),
      zadd: vi.fn(async (key: string, score: number, member: string) => {
        const rows = store.get(key) ?? []
        rows.push({ score, member })
        store.set(key, rows)
        return 1
      }),
      zcard: vi.fn(async (key: string) => (store.get(key) ?? []).length),
      pexpire: vi.fn(async () => 1),
    }
    const limit = createTwoFactorRateLimiter(redis, 5)
    for (let i = 0; i < 5; i += 1) {
      expect(await limit("user-1")).toBe("ok")
    }
    expect(await limit("user-1")).toBe("limited")
    expect(twoFactorRateLimitKey("user-1")).toBe("rl:2fa:user-1")
    expect(await limit("user-2")).toBe("ok")
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
    expect(await createTwoFactorRateLimiter(redis)("user-1")).toBe(
      "unavailable"
    )
  })
})
