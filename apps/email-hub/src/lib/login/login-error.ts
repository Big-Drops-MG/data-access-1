import { ALLOWED_SSO_EMAIL_DOMAIN } from "@/lib/auth/admin-emails"

/** Known `/login?error=` values (generic copy only — details stay in logs). */
export type LoginErrorCode = "unprovisioned" | "sso_failed"

export type LoginErrorContent = {
  code: LoginErrorCode
  title: string
  description: string
}

const UNPROVISIONED: LoginErrorContent = {
  code: "unprovisioned",
  title: "This Google account has no EmailHub access",
  description: "Ask an Admin to invite, then sign in again.",
}

const SSO_FAILED: LoginErrorContent = {
  code: "sso_failed",
  title: "Sign-in didn't complete",
  description: "Google sign-in was cancelled or failed. Try again.",
}

/**
 * Map Better Auth / app redirect error query values to generic UI copy.
 * Unknown codes fall through to the SSO-failed dead end (no internals leaked).
 */
export function resolveLoginError(
  raw: string | null | undefined
): LoginErrorContent | null {
  if (raw == null || raw.trim() === "") {
    return null
  }

  const code = raw.trim().toLowerCase()
  if (
    code === "unprovisioned" ||
    code === "forbidden" ||
    code === "unable_to_sign_in" ||
    code === "unabletosignin" ||
    code === "unable_to_create_user" ||
    code === "unable_to_create_session" ||
    code === "email_not_verified"
  ) {
    return UNPROVISIONED
  }

  if (
    code === "sso_failed" ||
    code === "access_denied" ||
    code === "oauth_failed" ||
    code === "cancelled" ||
    code === "canceled" ||
    code === "error" ||
    code === "no_code" ||
    code === "invalid_code" ||
    code === "state_not_found" ||
    code === "invalid_callback_request" ||
    code === "oauth_provider_not_found" ||
    code === "unable_to_get_user_info" ||
    code === "unable_to_link_account"
  ) {
    return SSO_FAILED
  }

  return SSO_FAILED
}

export function loginDomainHint(): string {
  return `@${ALLOWED_SSO_EMAIL_DOMAIN}`
}
