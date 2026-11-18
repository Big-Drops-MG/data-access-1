import { describe, expect, it, vi } from "vitest"

import { createStaffRateLimiter, staffRateLimitKey } from "./staff-rate-limit"

describe("staff rate limit", () => {
  it("allows 300 requests per user then limits", async () => {
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
    const limit = createStaffRateLimiter(redis, 300)
    for (let i = 0; i < 300; i += 1) {
      expect(await limit("user-1")).toBe("ok")
    }
    expect(await limit("user-1")).toBe("limited")
    expect(staffRateLimitKey("user-1")).toBe("rl:staff:user-1")
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
    expect(await createStaffRateLimiter(redis)("user-1")).toBe("unavailable")
  })
})
