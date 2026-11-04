export type TwoFactorVerifyErrorKind =
  "invalid" | "temporary_lock" | "admin_required" | "generic"

export type TwoFactorVerifyError = {
  kind: TwoFactorVerifyErrorKind
  title: string
  description: string
  lockedUntil?: string
}

type ErrorLike = {
  code?: string | null
  message?: string | null
  status?: number | string | null
  lockedUntil?: string | null
}

/**
 * Map Better Auth / lockout API errors to generic verify-page copy.
 */
export function resolveTwoFactorVerifyError(
  error: ErrorLike | null | undefined
): TwoFactorVerifyError {
  const code = String(error?.code ?? "")
    .trim()
    .toUpperCase()
  const message = String(error?.message ?? "")
  const lockedUntil =
    typeof error?.lockedUntil === "string" && error.lockedUntil
      ? error.lockedUntil
      : undefined

  if (
    code === "TWO_FACTOR_ADMIN_RESET_REQUIRED" ||
    /admin must reset/i.test(message)
  ) {
    return {
      kind: "admin_required",
      title: "2FA is locked",
      description:
        "Ask an Admin to reset two-step verification, then try again.",
    }
  }

  if (
    code === "ACCOUNT_TEMPORARILY_LOCKED" ||
    /too many failed attempts/i.test(message)
  ) {
    return {
      kind: "temporary_lock",
      title: "Too many wrong codes",
      description: "Sign-in is locked for 15 minutes. Try again later.",
      lockedUntil,
    }
  }

  if (
    code === "INVALID_CODE" ||
    code === "INVALID_BACKUP_CODE" ||
    /invalid/i.test(message)
  ) {
    return {
      kind: "invalid",
      title: "Incorrect code",
      description: "Check your authenticator app and try again.",
    }
  }

  return {
    kind: "generic",
    title: "Verification didn't complete",
    description: "Try again with a fresh code from your authenticator app.",
  }
}
