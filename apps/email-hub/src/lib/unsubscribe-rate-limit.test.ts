import { describe, expect, it, vi } from "vitest"

import {
  createUnsubscribeRateLimiter,
  unsubscribeRateLimitKey,
} from "./unsubscribe-rate-limit"

describe("unsubscribe rate limit", () => {
  it("allows up to 30 requests then limits", async () => {
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
    const limit = createUnsubscribeRateLimiter(redis, 30)
    for (let i = 0; i < 30; i += 1) {
      expect(await limit("203.0.113.9")).toBe("ok")
    }
    expect(await limit("203.0.113.9")).toBe("limited")
    expect(unsubscribeRateLimitKey("203.0.113.9")).toBe("rl:u:203.0.113.9")
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
    expect(await createUnsubscribeRateLimiter(redis)("1.1.1.1")).toBe(
      "unavailable"
    )
  })
})
