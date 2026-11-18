import { beforeEach, describe, expect, it, vi } from "vitest"

import { processCleanupExpiredJob } from "./cleanup-expired.js"

vi.mock("@workspace/logger", () => ({
  getContextLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}))

describe("processCleanupExpiredJob", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("deletes expired auth rows and purges old messages and audit", async () => {
    const now = new Date("2026-11-18T12:00:00.000Z")
    const purgeAuditBefore = vi.fn(async (_cutoff: Date) => 4)
    const deleteChain = {
      where: vi.fn(() => {
        const result = Promise.resolve(undefined)
        return Object.assign(result, {
          returning: vi.fn(async () => [{ id: "x" }]),
        })
      }),
    }
    const db = {
      delete: vi.fn(() => deleteChain),
      select: vi.fn(() => ({
        from: () => ({
          where: async () => [{ value: 2 }],
        }),
      })),
    }

    await processCleanupExpiredJob({
      db: db as never,
      now: () => now,
      purgeAuditBefore,
    })

    expect(db.delete).toHaveBeenCalledTimes(4)
    expect(purgeAuditBefore).toHaveBeenCalledTimes(1)
    const cutoff = purgeAuditBefore.mock.calls[0]?.[0]
    expect(cutoff).toBeInstanceOf(Date)
    expect(cutoff?.getUTCFullYear()).toBe(2024)
    expect(cutoff?.getUTCMonth()).toBe(10)
  })
})
