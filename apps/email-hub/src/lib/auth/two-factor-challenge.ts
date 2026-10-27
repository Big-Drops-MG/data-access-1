import { cookies } from "next/headers"

import {
  TWO_FACTOR_EMAIL_COOKIE,
  TWO_FACTOR_USER_COOKIE,
} from "./two-factor-cookies"
import { getLockoutStatus } from "./two-factor-policy"
import {
  loadLockoutStateForUser,
  lockoutOrEmpty,
} from "./two-factor-lockout-read"

export type TwoFactorChallengeLockout =
  { kind: "temporary"; lockedUntil: string } | { kind: "admin_required" }

export type TwoFactorChallengeState = {
  email: string | null
  lockout: TwoFactorChallengeLockout | null
}

/**
 * Challenge context for /login/2fa-verify (email + lockout), using short-lived
 * cookies set when the OAuth after-hook starts the 2FA challenge.
 */
export async function getTwoFactorChallengeState(): Promise<TwoFactorChallengeState> {
  const jar = await cookies()
  const email = jar.get(TWO_FACTOR_EMAIL_COOKIE)?.value ?? null
  const userId = jar.get(TWO_FACTOR_USER_COOKIE)?.value ?? null

  if (!userId) {
    return { email, lockout: null }
  }

  const state = lockoutOrEmpty(await loadLockoutStateForUser(userId))
  const status = getLockoutStatus(state)
  if (status === "admin_required") {
    return { email, lockout: { kind: "admin_required" } }
  }
  if (status === "temporary" && state.lockedUntil) {
    return {
      email,
      lockout: {
        kind: "temporary",
        lockedUntil: state.lockedUntil.toISOString(),
      },
    }
  }

  return { email, lockout: null }
}
