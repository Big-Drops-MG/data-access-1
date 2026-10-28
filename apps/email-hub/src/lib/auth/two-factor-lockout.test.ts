import { APIError } from "better-auth/api"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  TWO_FACTOR_LOCK_DURATION_MS,
  TWO_FACTOR_MAX_CONSECUTIVE_LOCKOUTS,
  TWO_FACTOR_MAX_FAILED_ATTEMPTS,
  emptyLockoutState,
} from "./two-factor-policy"

const db = vi.hoisted(() => {
  const selectLimit = vi.fn()
  const selectWhere = vi.fn(() => ({ limit: selectLimit }))
  const selectFrom = vi.fn(() => ({ where: selectWhere }))
  const select = vi.fn(() => ({ from: selectFrom }))

  const updateWhere = vi.fn()
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))

  const deleteWhere = vi.fn()
  const del = vi.fn(() => ({ where: deleteWhere }))

  const tx = {
    select,
    update,
    delete: del,
  }
  const transaction = vi.fn(async (run: (trx: typeof tx) => Promise<void>) =>
    run(tx)
  )

  return {
    select,
    selectFrom,
    selectWhere,
    selectLimit,
    update,
    updateSet,
    updateWhere,
    delete: del,
    deleteWhere,
    transaction,
    getDb: vi.fn(() => ({
      select,
      update,
      delete: del,
      transaction,
    })),
  }
})

vi.mock("@workspace/db/client", () => ({
  getDb: db.getDb,
}))

vi.mock("./auth-events", () => ({
  logAuthEvent: vi.fn(),
}))

import { logAuthEvent } from "./auth-events"
import {
  assertTwoFactorVerifyAllowed,
  recordTwoFactorVerificationFailure,
  recordTwoFactorVerificationSuccess,
  resetTwoFactorForAdmin,
  TWO_FACTOR_ADMIN_RESET_REQUIRED_MESSAGE,
  TWO_FACTOR_TEMPORARILY_LOCKED_MESSAGE,
} from "./two-factor-lockout"

describe("two-factor-lockout store", () => {
  const userId = "01900000-0000-7000-8000-000000000001"
  const t0 = new Date("2026-10-20T12:00:00.000Z")

  beforeEach(() => {
    vi.clearAllMocks()
    db.selectLimit.mockResolvedValue([])
    db.updateWhere.mockResolvedValue(undefined)
    db.deleteWhere.mockResolvedValue(undefined)
  })

  it("allows verify when there is no two_factor row", async () => {
    await expect(
      assertTwoFactorVerifyAllowed(userId, t0)
    ).resolves.toBeUndefined()
  })

  it("rejects when Admin reset is required", async () => {
    db.selectLimit.mockResolvedValue([
      {
        ...emptyLockoutState(),
        consecutiveLockoutCount: TWO_FACTOR_MAX_CONSECUTIVE_LOCKOUTS,
      },
    ])
    await expect(
      assertTwoFactorVerifyAllowed(userId, t0)
    ).rejects.toBeInstanceOf(APIError)
    await expect(
      assertTwoFactorVerifyAllowed(userId, t0)
    ).rejects.toMatchObject({
      body: { message: TWO_FACTOR_ADMIN_RESET_REQUIRED_MESSAGE },
    })
  })

  it("rejects while temporarily locked", async () => {
    db.selectLimit.mockResolvedValue([
      {
        ...emptyLockoutState(),
        lockedUntil: new Date(t0.getTime() + TWO_FACTOR_LOCK_DURATION_MS),
        consecutiveLockoutCount: 1,
        lastCountedLockoutUntil: new Date(
          t0.getTime() + TWO_FACTOR_LOCK_DURATION_MS
        ),
      },
    ])
    await expect(
      assertTwoFactorVerifyAllowed(userId, t0)
    ).rejects.toMatchObject({
      body: { message: TWO_FACTOR_TEMPORARILY_LOCKED_MESSAGE },
    })
  })

  it("persists failure state and logs events", async () => {
    await recordTwoFactorVerificationFailure(userId, t0)
    expect(db.update).toHaveBeenCalled()
    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        failedVerificationCount: 1,
        failureWindowStartedAt: t0,
      })
    )
    expect(logAuthEvent).toHaveBeenCalledWith("auth.2fa_failed", {
      user_id: userId,
    })
  })

  it("locks and logs auth.lockout on the fifth failure", async () => {
    db.selectLimit.mockResolvedValue([
      {
        failedVerificationCount: TWO_FACTOR_MAX_FAILED_ATTEMPTS - 1,
        failureWindowStartedAt: t0,
        lockedUntil: null,
        consecutiveLockoutCount: 0,
        lastCountedLockoutUntil: null,
      },
    ])
    await recordTwoFactorVerificationFailure(userId, t0)
    expect(logAuthEvent).toHaveBeenCalledWith("auth.lockout", {
      user_id: userId,
    })
    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        failedVerificationCount: 0,
        consecutiveLockoutCount: 1,
        lockedUntil: expect.any(Date),
      })
    )
  })

  it("clears counters and logs auth.login on success", async () => {
    db.selectLimit.mockResolvedValue([
      {
        failedVerificationCount: 2,
        failureWindowStartedAt: t0,
        lockedUntil: null,
        consecutiveLockoutCount: 1,
        lastCountedLockoutUntil: null,
      },
    ])
    await recordTwoFactorVerificationSuccess(userId)
    expect(db.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        failedVerificationCount: 0,
        consecutiveLockoutCount: 0,
        lockedUntil: null,
      })
    )
    expect(logAuthEvent).toHaveBeenCalledWith("auth.login", { user_id: userId })
  })

  it("deletes factor, trust rows, sessions, and trusted devices in one transaction", async () => {
    await resetTwoFactorForAdmin(userId)
    expect(db.transaction).toHaveBeenCalledTimes(1)
    expect(db.delete).toHaveBeenCalledTimes(4)
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(db.updateSet).toHaveBeenCalledWith({ twoFactorEnabled: false })
    expect(db.updateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ revokedAt: expect.any(Date) })
    )
  })
})
