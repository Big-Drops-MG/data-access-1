import { session, twoFactor, user, verification } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { writeAudit } from "@workspace/shared"
import { APIError } from "better-auth/api"
import { and, eq, like, or } from "drizzle-orm"

import { logAuthEvent } from "./auth-events"
import { deleteTrustedDevicesForUser } from "./trusted-device"
import {
  applyFailedVerification,
  applySuccessfulVerification,
  emptyLockoutState,
  getLockoutStatus,
  type TwoFactorLockoutState,
} from "./two-factor-policy"

export const TWO_FACTOR_ADMIN_RESET_REQUIRED_MESSAGE =
  "Two-factor authentication is locked. An Admin must reset 2FA."

export const TWO_FACTOR_TEMPORARILY_LOCKED_MESSAGE =
  "Too many failed attempts. Try again later."

function rowToState(row: {
  failedVerificationCount: number
  failureWindowStartedAt: Date | null
  lockedUntil: Date | null
  consecutiveLockoutCount: number
  lastCountedLockoutUntil: Date | null
}): TwoFactorLockoutState {
  return {
    failedVerificationCount: row.failedVerificationCount,
    failureWindowStartedAt: row.failureWindowStartedAt,
    lockedUntil: row.lockedUntil,
    consecutiveLockoutCount: row.consecutiveLockoutCount,
    lastCountedLockoutUntil: row.lastCountedLockoutUntil,
  }
}

async function loadLockoutState(
  userId: string
): Promise<TwoFactorLockoutState | null> {
  const [row] = await getDb()
    .select({
      failedVerificationCount: twoFactor.failedVerificationCount,
      failureWindowStartedAt: twoFactor.failureWindowStartedAt,
      lockedUntil: twoFactor.lockedUntil,
      consecutiveLockoutCount: twoFactor.consecutiveLockoutCount,
      lastCountedLockoutUntil: twoFactor.lastCountedLockoutUntil,
    })
    .from(twoFactor)
    .where(eq(twoFactor.userId, userId))
    .limit(1)
  return row ? rowToState(row) : null
}

async function persistLockoutState(
  userId: string,
  state: TwoFactorLockoutState
): Promise<void> {
  await getDb()
    .update(twoFactor)
    .set({
      failedVerificationCount: state.failedVerificationCount,
      failureWindowStartedAt: state.failureWindowStartedAt,
      lockedUntil: state.lockedUntil,
      consecutiveLockoutCount: state.consecutiveLockoutCount,
      lastCountedLockoutUntil: state.lastCountedLockoutUntil,
    })
    .where(eq(twoFactor.userId, userId))
}

/** Reject verify when temporarily locked or Admin reset is required. */
export async function assertTwoFactorVerifyAllowed(
  userId: string,
  now: Date = new Date()
): Promise<void> {
  const state = (await loadLockoutState(userId)) ?? emptyLockoutState()
  const status = getLockoutStatus(state, now)
  if (status === "admin_required") {
    throw new APIError("FORBIDDEN", {
      message: TWO_FACTOR_ADMIN_RESET_REQUIRED_MESSAGE,
      code: "TWO_FACTOR_ADMIN_RESET_REQUIRED",
    })
  }
  if (status === "temporary") {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: TWO_FACTOR_TEMPORARILY_LOCKED_MESSAGE,
      code: "ACCOUNT_TEMPORARILY_LOCKED",
      lockedUntil: state.lockedUntil?.toISOString(),
    })
  }
}

export async function recordTwoFactorVerificationFailure(
  userId: string,
  now: Date = new Date()
): Promise<void> {
  const current = (await loadLockoutState(userId)) ?? emptyLockoutState()
  const result = applyFailedVerification(current, now)
  await persistLockoutState(userId, result.state)
  for (const event of result.events) {
    logAuthEvent(event, { user_id: userId })
  }
}

export async function recordTwoFactorVerificationSuccess(
  userId: string
): Promise<void> {
  const current = (await loadLockoutState(userId)) ?? emptyLockoutState()
  await persistLockoutState(userId, applySuccessfulVerification(current))
  logAuthEvent("auth.login", { user_id: userId })
}

export async function resetTwoFactorForAdmin(
  userId: string,
  audit: { actorId: string; requestId?: string | null }
): Promise<void> {
  const db = getDb()
  await db.transaction(async (tx) => {
    await tx.delete(twoFactor).where(eq(twoFactor.userId, userId))
    await tx
      .delete(verification)
      .where(
        and(
          eq(verification.value, userId),
          or(
            like(verification.identifier, "trust-device-%"),
            like(verification.identifier, "2fa-%")
          )
        )
      )
    await tx.delete(session).where(eq(session.userId, userId))
    await deleteTrustedDevicesForUser(userId, tx)
    await tx
      .update(user)
      .set({ twoFactorEnabled: false })
      .where(eq(user.id, userId))
    await writeAudit(tx, {
      actor: { type: "user", id: audit.actorId },
      action: "user.two_factor_reset",
      objectType: "user",
      objectId: userId,
      requestId: audit.requestId,
      before: null,
      after: { twoFactorEnabled: false },
    })
  })
}
