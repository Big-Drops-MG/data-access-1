import { normaliseEmail } from "@workspace/shared"

/** Google SSO is limited to this Workspace domain. */
export const ALLOWED_SSO_EMAIL_DOMAIN = "bigdropsmarketing.com"

/** Parse `ADMIN_EMAILS` (comma-separated) into a normalised allowlist. */
export function parseAdminEmails(
  value: string | undefined | null
): ReadonlySet<string> {
  if (!value?.trim()) {
    return new Set()
  }
  return new Set(
    value
      .split(",")
      .map((part) => normaliseEmail(part))
      .filter((email) => email.includes("@"))
  )
}

export function isAllowedSsoEmailDomain(email: string): boolean {
  const normalised = normaliseEmail(email)
  const at = normalised.lastIndexOf("@")
  if (at < 0) {
    return false
  }
  return normalised.slice(at + 1) === ALLOWED_SSO_EMAIL_DOMAIN
}

export function isBootstrapAdminEmail(
  email: string,
  adminEmails: ReadonlySet<string> = parseAdminEmails(process.env.ADMIN_EMAILS)
): boolean {
  return adminEmails.has(normaliseEmail(email))
}
