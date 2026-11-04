import { normaliseEmail } from "@workspace/shared"
import { APIError } from "better-auth/api"

import { isAllowedSsoEmailDomain, isBootstrapAdminEmail } from "./admin-emails"

export const SIGN_IN_REJECTED_MESSAGE = "Unable to sign in"

/** Query value Better Auth OAuth callback redirects to `/login?error=`. */
export const SIGN_IN_REJECTED_CODE = "unprovisioned"

function rejectSignIn(): never {
  throw new APIError("FORBIDDEN", {
    message: SIGN_IN_REJECTED_MESSAGE,
    code: SIGN_IN_REJECTED_CODE,
  })
}

export type GoogleProfileInput = {
  email?: string | null
  name?: string | null
  picture?: string | null
  email_verified?: boolean
}

/** Map Google OIDC profile → user fields; reject unverified / off-domain. */
export function mapGoogleProfileToUser(profile: GoogleProfileInput) {
  if (profile.email_verified !== true) {
    rejectSignIn()
  }
  const email = normaliseEmail(String(profile.email ?? ""))
  if (!isAllowedSsoEmailDomain(email)) {
    rejectSignIn()
  }
  return {
    email,
    name: String(profile.name ?? ""),
    image: profile.picture ? String(profile.picture) : undefined,
    emailVerified: true as const,
  }
}

/** First-time user create: ADMIN_EMAILS + domain only → admin/active. */
export function prepareBootstrapAdminUser<T extends { email: string }>(
  newUser: T,
  adminEmails: ReadonlySet<string>
) {
  const email = normaliseEmail(newUser.email)
  if (
    !isAllowedSsoEmailDomain(email) ||
    !isBootstrapAdminEmail(email, adminEmails)
  ) {
    rejectSignIn()
  }
  return {
    data: {
      ...newUser,
      email,
      role: "admin" as const,
      status: "active" as const,
      emailVerified: true,
    },
  }
}

/** Session create: user must exist, be active, and on the SSO domain. */
export function assertActiveStaffForSession(
  row: { status: string; email: string } | undefined
): void {
  if (!row || row.status !== "active" || !isAllowedSsoEmailDomain(row.email)) {
    rejectSignIn()
  }
}
