/**
 * SD#14.2 TOTP lockout rules:
 * - 5 wrong codes in a 10-minute window → 15-minute lock
 * - 3 consecutive lockouts → locked until Admin resets 2FA
 * Better Auth accountLockout handles the temporary lock (5 / 900s).
 * consecutiveLockoutCount tracks lockout episodes for the admin-reset gate.
 */

export const TWO_FACTOR_MAX_FAILED_ATTEMPTS = 5
/** Failure window aligned with twoFactorCookieMaxAge / SD "in 10 minutes". */
export const TWO_FACTOR_FAILURE_WINDOW_MS = 10 * 60 * 1000
export const TWO_FACTOR_LOCK_DURATION_MS = 15 * 60 * 1000
export const TWO_FACTOR_LOCK_DURATION_SECONDS = 15 * 60
export const TWO_FACTOR_MAX_CONSECUTIVE_LOCKOUTS = 3
export const TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
export const TWO_FACTOR_COOKIE_MAX_AGE_SECONDS = 10 * 60
export const TWO_FACTOR_BACKUP_CODE_COUNT = 10
export const TWO_FACTOR_TOTP_DIGITS = 6
export const TWO_FACTOR_TOTP_PERIOD_SECONDS = 30
export const TWO_FACTOR_ISSUER = "EmailHub"

export type TwoFactorLockoutState = {
  failedVerificationCount: number
  /** Start of the current failure window; null when no open window. */
  failureWindowStartedAt: Date | null
  lockedUntil: Date | null
  consecutiveLockoutCount: number
  /** lockedUntil value already counted toward consecutiveLockoutCount. */
  lastCountedLockoutUntil: Date | null
}

export type LockoutStatus = "ok" | "temporary" | "admin_required"

export type LockoutEvent =
  "auth.2fa_failed" | "auth.lockout" | "auth.lockout_admin_required"

export type FailedVerificationResult = {
  state: TwoFactorLockoutState
  events: LockoutEvent[]
  status: LockoutStatus
}

export function emptyLockoutState(): TwoFactorLockoutState {
  return {
    failedVerificationCount: 0,
    failureWindowStartedAt: null,
    lockedUntil: null,
    consecutiveLockoutCount: 0,
    lastCountedLockoutUntil: null,
  }
}

export function getLockoutStatus(
  state: TwoFactorLockoutState,
  now: Date = new Date()
): LockoutStatus {
  if (state.consecutiveLockoutCount >= TWO_FACTOR_MAX_CONSECUTIVE_LOCKOUTS) {
    return "admin_required"
  }
  if (state.lockedUntil && state.lockedUntil.getTime() > now.getTime()) {
    return "temporary"
  }
  return "ok"
}

/**
 * Apply one wrong TOTP/backup code. Implements the 10-minute failure window
 * and promotes to a 15-minute lock after five failures in that window.
 */
export function applyFailedVerification(
  state: TwoFactorLockoutState,
  now: Date = new Date()
): FailedVerificationResult {
  const events: LockoutEvent[] = ["auth.2fa_failed"]
  const statusBefore = getLockoutStatus(state, now)
  if (statusBefore === "admin_required") {
    return { state, events, status: "admin_required" }
  }
  if (statusBefore === "temporary") {
    return {
      state: countLockoutEpisode(state),
      events,
      status: "temporary",
    }
  }

  const windowExpired =
    !state.failureWindowStartedAt ||
    now.getTime() - state.failureWindowStartedAt.getTime() >=
      TWO_FACTOR_FAILURE_WINDOW_MS

  const failedVerificationCount = windowExpired
    ? 1
    : state.failedVerificationCount + 1
  const failureWindowStartedAt = windowExpired
    ? now
    : state.failureWindowStartedAt

  let next: TwoFactorLockoutState = {
    ...state,
    failedVerificationCount,
    failureWindowStartedAt,
  }

  if (failedVerificationCount < TWO_FACTOR_MAX_FAILED_ATTEMPTS) {
    return { state: next, events, status: "ok" }
  }

  const lockedUntil = new Date(now.getTime() + TWO_FACTOR_LOCK_DURATION_MS)
  next = countLockoutEpisode({
    ...next,
    failedVerificationCount: 0,
    failureWindowStartedAt: null,
    lockedUntil,
  })
  events.push("auth.lockout")

  if (next.consecutiveLockoutCount >= TWO_FACTOR_MAX_CONSECUTIVE_LOCKOUTS) {
    events.push("auth.lockout_admin_required")
    return { state: next, events, status: "admin_required" }
  }

  return { state: next, events, status: "temporary" }
}

export function applySuccessfulVerification(
  state: TwoFactorLockoutState
): TwoFactorLockoutState {
  return {
    ...state,
    failedVerificationCount: 0,
    failureWindowStartedAt: null,
    lockedUntil: null,
    consecutiveLockoutCount: 0,
    lastCountedLockoutUntil: null,
  }
}

/**
 * When Better Auth has already set lockedUntil, ensure this lock episode is
 * counted once toward the three-lockout admin-reset rule.
 */
export function syncConsecutiveLockoutFromRow(
  state: TwoFactorLockoutState,
  now: Date = new Date()
): TwoFactorLockoutState {
  if (!state.lockedUntil || state.lockedUntil.getTime() <= now.getTime()) {
    return state
  }
  return countLockoutEpisode(state)
}

export function resetLockoutForAdminReset(): TwoFactorLockoutState {
  return emptyLockoutState()
}

function countLockoutEpisode(
  state: TwoFactorLockoutState
): TwoFactorLockoutState {
  if (!state.lockedUntil) {
    return state
  }
  const alreadyCounted =
    state.lastCountedLockoutUntil?.getTime() === state.lockedUntil.getTime()
  if (alreadyCounted) {
    return state
  }
  return {
    ...state,
    consecutiveLockoutCount: state.consecutiveLockoutCount + 1,
    lastCountedLockoutUntil: state.lockedUntil,
  }
}
