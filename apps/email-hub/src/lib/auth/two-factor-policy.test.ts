import { describe, expect, it } from "vitest"

import {
  TWO_FACTOR_FAILURE_WINDOW_MS,
  TWO_FACTOR_LOCK_DURATION_MS,
  TWO_FACTOR_MAX_CONSECUTIVE_LOCKOUTS,
  TWO_FACTOR_MAX_FAILED_ATTEMPTS,
  applyFailedVerification,
  applySuccessfulVerification,
  emptyLockoutState,
  getLockoutStatus,
  resetLockoutForAdminReset,
  syncConsecutiveLockoutFromRow,
} from "./two-factor-policy"

describe("two-factor lockout policy", () => {
  const t0 = new Date("2026-10-20T12:00:00.000Z")

  it("stays ok for fewer than 5 failures in the window", () => {
    let state = emptyLockoutState()
    const statuses: string[] = []
    const eventLists: string[][] = []
    for (let i = 0; i < TWO_FACTOR_MAX_FAILED_ATTEMPTS - 1; i += 1) {
      const result = applyFailedVerification(
        state,
        new Date(t0.getTime() + i * 1000)
      )
      statuses.push(result.status)
      eventLists.push(result.events)
      state = result.state
    }
    expect(statuses).toEqual(
      Array.from({ length: TWO_FACTOR_MAX_FAILED_ATTEMPTS - 1 }, () => "ok")
    )
    expect(eventLists).toEqual(
      Array.from({ length: TWO_FACTOR_MAX_FAILED_ATTEMPTS - 1 }, () => [
        "auth.2fa_failed",
      ])
    )
    expect(state.failedVerificationCount).toBe(
      TWO_FACTOR_MAX_FAILED_ATTEMPTS - 1
    )
    expect(getLockoutStatus(state, t0)).toBe("ok")
  })

  it("locks for 15 minutes after 5 failures in 10 minutes", () => {
    let state = emptyLockoutState()
    const statuses: string[] = []
    let fifthEvents: string[] = []
    for (let i = 0; i < TWO_FACTOR_MAX_FAILED_ATTEMPTS; i += 1) {
      const result = applyFailedVerification(
        state,
        new Date(t0.getTime() + i * 1000)
      )
      state = result.state
      statuses.push(result.status)
      if (i === TWO_FACTOR_MAX_FAILED_ATTEMPTS - 1) {
        fifthEvents = result.events
      }
    }

    expect(statuses.slice(0, -1)).toEqual(
      Array.from({ length: TWO_FACTOR_MAX_FAILED_ATTEMPTS - 1 }, () => "ok")
    )
    expect(statuses.at(-1)).toBe("temporary")
    expect(fifthEvents).toEqual(["auth.2fa_failed", "auth.lockout"])
    expect(state.lockedUntil?.getTime()).toBe(
      t0.getTime() +
        (TWO_FACTOR_MAX_FAILED_ATTEMPTS - 1) * 1000 +
        TWO_FACTOR_LOCK_DURATION_MS
    )
    expect(state.consecutiveLockoutCount).toBe(1)
    expect(state.failedVerificationCount).toBe(0)
    expect(
      getLockoutStatus(
        state,
        new Date(
          t0.getTime() + (TWO_FACTOR_MAX_FAILED_ATTEMPTS - 1) * 1000 + 60 * 1000
        )
      )
    ).toBe("temporary")
  })

  it("resets the failure window after 10 minutes without locking", () => {
    let state = emptyLockoutState()
    for (let i = 0; i < 4; i += 1) {
      state = applyFailedVerification(
        state,
        new Date(t0.getTime() + i * 1000)
      ).state
    }
    expect(state.failedVerificationCount).toBe(4)

    const afterWindow = new Date(
      t0.getTime() + TWO_FACTOR_FAILURE_WINDOW_MS + 1000
    )
    const result = applyFailedVerification(state, afterWindow)
    expect(result.status).toBe("ok")
    expect(result.state.failedVerificationCount).toBe(1)
    expect(result.state.lockedUntil).toBeNull()
  })

  it("requires Admin reset after 3 consecutive lockouts", () => {
    let state = emptyLockoutState()
    let now = t0
    let lastResult = applyFailedVerification(state, now)

    for (
      let lockout = 0;
      lockout < TWO_FACTOR_MAX_CONSECUTIVE_LOCKOUTS;
      lockout += 1
    ) {
      for (let i = 0; i < TWO_FACTOR_MAX_FAILED_ATTEMPTS; i += 1) {
        lastResult = applyFailedVerification(state, now)
        state = lastResult.state
        now = new Date(now.getTime() + 1000)
      }
      if (lockout < TWO_FACTOR_MAX_CONSECUTIVE_LOCKOUTS - 1) {
        now = new Date((state.lockedUntil?.getTime() ?? now.getTime()) + 1000)
        state = {
          ...state,
          lockedUntil: null,
        }
      }
    }

    expect(lastResult.status).toBe("admin_required")
    expect(lastResult.events).toContain("auth.lockout_admin_required")
    expect(state.consecutiveLockoutCount).toBe(
      TWO_FACTOR_MAX_CONSECUTIVE_LOCKOUTS
    )
    expect(getLockoutStatus(state, now)).toBe("admin_required")
  })

  it("clears all counters after a successful verification", () => {
    let state = emptyLockoutState()
    for (let i = 0; i < TWO_FACTOR_MAX_FAILED_ATTEMPTS; i += 1) {
      state = applyFailedVerification(
        state,
        new Date(t0.getTime() + i * 1000)
      ).state
    }
    expect(state.consecutiveLockoutCount).toBe(1)

    state = applySuccessfulVerification(state)
    expect(state).toEqual(emptyLockoutState())
    expect(getLockoutStatus(state, t0)).toBe("ok")
  })

  it("counts a Better Auth lock episode only once via sync", () => {
    const lockedUntil = new Date(t0.getTime() + TWO_FACTOR_LOCK_DURATION_MS)
    let state = syncConsecutiveLockoutFromRow(
      { ...emptyLockoutState(), lockedUntil },
      t0
    )
    expect(state.consecutiveLockoutCount).toBe(1)
    state = syncConsecutiveLockoutFromRow(state, t0)
    expect(state.consecutiveLockoutCount).toBe(1)
  })

  it("does not count an expired lock via sync", () => {
    const lockedUntil = new Date(t0.getTime() - 1000)
    const state = syncConsecutiveLockoutFromRow(
      { ...emptyLockoutState(), lockedUntil },
      t0
    )
    expect(state.consecutiveLockoutCount).toBe(0)
  })

  it("returns empty state from resetLockoutForAdminReset", () => {
    expect(resetLockoutForAdminReset()).toEqual(emptyLockoutState())
  })

  it("keeps admin_required when another failure arrives after three lockouts", () => {
    const lockedUntil = new Date(t0.getTime() + TWO_FACTOR_LOCK_DURATION_MS)
    const state = {
      ...emptyLockoutState(),
      consecutiveLockoutCount: TWO_FACTOR_MAX_CONSECUTIVE_LOCKOUTS,
      lockedUntil,
      lastCountedLockoutUntil: lockedUntil,
    }
    const result = applyFailedVerification(state, t0)
    expect(result.status).toBe("admin_required")
    expect(result.state).toEqual(state)
  })

  it("re-asserts temporary status without double-counting the same lock", () => {
    const lockedUntil = new Date(t0.getTime() + TWO_FACTOR_LOCK_DURATION_MS)
    const state = {
      ...emptyLockoutState(),
      consecutiveLockoutCount: 1,
      lockedUntil,
      lastCountedLockoutUntil: lockedUntil,
    }
    const result = applyFailedVerification(state, t0)
    expect(result.status).toBe("temporary")
    expect(result.state.consecutiveLockoutCount).toBe(1)
  })
})
