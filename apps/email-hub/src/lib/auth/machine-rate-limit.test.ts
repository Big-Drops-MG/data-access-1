import { describe, expect, it } from "vitest"

import {
  createMachineRateLimiter,
  machineRateLimitKey,
  type SlidingWindowRedis,
} from "@/lib/auth/machine-rate-limit"

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

describe("createMachineRateLimiter", () => {
  it("allows requests under the limit and keys by client id", async () => {
    const redis = memoryRedis()
    const consume = createMachineRateLimiter(redis, 3)
    expect(await consume("k1")).toBe("ok")
    expect(await consume("k1")).toBe("ok")
    expect(await consume("k1")).toBe("ok")
    expect(await consume("k1")).toBe("limited")
    expect(machineRateLimitKey("k1")).toBe("rl:ext:k1")
    expect(await consume("k2")).toBe("ok")
  })

  it("returns unavailable when Redis throws", async () => {
    const consume = createMachineRateLimiter({
      zremrangebyscore: async () => {
        throw new Error("down")
      },
      zadd: async () => 1,
      zcard: async () => 1,
      pexpire: async () => 1,
    })
    expect(await consume("k1")).toBe("unavailable")
  })
})
