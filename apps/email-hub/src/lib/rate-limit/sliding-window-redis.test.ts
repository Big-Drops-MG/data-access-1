import { describe, expect, it, vi } from "vitest"

import {
  createSlidingWindowLimiter,
  type SlidingWindowRedis,
} from "./sliding-window-redis"

function memoryRedis(): SlidingWindowRedis & {
  store: Map<string, { score: number; member: string }[]>
} {
  const store = new Map<string, { score: number; member: string }[]>()
  return {
    store,
    async zremrangebyscore(key, min, max) {
      const rows = store.get(key) ?? []
      const next = rows.filter((row) => row.score < min || row.score > max)
      const removed = rows.length - next.length
      store.set(key, next)
      return removed
    },
    async zadd(key, score, member) {
      const rows = store.get(key) ?? []
      rows.push({ score, member })
      store.set(key, rows)
      return 1
    },
    async zcard(key) {
      return (store.get(key) ?? []).length
    },
    async pexpire() {
      return 1
    },
  }
}

describe("createSlidingWindowLimiter", () => {
  it("limits after the configured count for a key", async () => {
    const redis = memoryRedis()
    const consume = createSlidingWindowLimiter(redis, {
      limit: 2,
      windowMs: 60_000,
      keyFor: (id) => `rl:test:${id}`,
    })
    expect(await consume("a")).toBe("ok")
    expect(await consume("a")).toBe("ok")
    expect(await consume("a")).toBe("limited")
    expect(await consume("b")).toBe("ok")
  })

  it("returns unavailable when Redis throws", async () => {
    const consume = createSlidingWindowLimiter(
      {
        zremrangebyscore: vi.fn(async () => {
          throw new Error("down")
        }),
        zadd: vi.fn(async () => 1),
        zcard: vi.fn(async () => 1),
        pexpire: vi.fn(async () => 1),
      },
      {
        limit: 1,
        windowMs: 60_000,
        keyFor: (id) => id,
      }
    )
    expect(await consume("x")).toBe("unavailable")
  })
})
