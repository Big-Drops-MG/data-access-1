import { twoFactor } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { eq } from "drizzle-orm"

import {
  emptyLockoutState,
  type TwoFactorLockoutState,
} from "./two-factor-policy"

/** Read lockout columns for a user (shared by UI helpers). */
export async function loadLockoutStateForUser(
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

  if (!row) {
    return null
  }

  return {
    failedVerificationCount: row.failedVerificationCount,
    failureWindowStartedAt: row.failureWindowStartedAt,
    lockedUntil: row.lockedUntil,
    consecutiveLockoutCount: row.consecutiveLockoutCount,
    lastCountedLockoutUntil: row.lastCountedLockoutUntil,
  }
}

export function lockoutOrEmpty(
  state: TwoFactorLockoutState | null
): TwoFactorLockoutState {
  return state ?? emptyLockoutState()
}
