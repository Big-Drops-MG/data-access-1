import { beforeEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => {
  const limit = vi.fn()
  const where = vi.fn(() => ({ limit }))
  const leftJoin = vi.fn(() => ({ where }))
  const from = vi.fn(() => ({ leftJoin }))
  const select = vi.fn(() => ({ from }))
  return {
    limit,
    where,
    leftJoin,
    from,
    select,
    getDb: vi.fn(() => ({ select })),
  }
})

vi.mock("@workspace/db/client", () => ({
  getDb: db.getDb,
}))

import { userHasTwoFactorEnrolled } from "./two-factor-enrollment"

describe("userHasTwoFactorEnrolled", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.limit.mockReset()
    db.where.mockImplementation(() => ({ limit: db.limit }))
    db.leftJoin.mockImplementation(() => ({ where: db.where }))
    db.from.mockImplementation(() => ({ leftJoin: db.leftJoin }))
    db.select.mockImplementation(() => ({ from: db.from }))
    db.getDb.mockImplementation(() => ({ select: db.select }))
  })

  it("returns true when the user flag is on and a factor row exists", async () => {
    db.limit.mockResolvedValue([{ twoFactorEnabled: true, factorId: "tf_1" }])
    await expect(userHasTwoFactorEnrolled("user-1")).resolves.toBe(true)
  })

  it("returns false for new users with no factor", async () => {
    db.limit.mockResolvedValue([{ twoFactorEnabled: false, factorId: null }])
    await expect(userHasTwoFactorEnrolled("user-1")).resolves.toBe(false)
  })

  it("returns false when the flag is on but the factor row is missing", async () => {
    db.limit.mockResolvedValue([{ twoFactorEnabled: true, factorId: null }])
    await expect(userHasTwoFactorEnrolled("user-1")).resolves.toBe(false)
  })
})
