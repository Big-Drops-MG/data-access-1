import { normaliseEmail } from "@workspace/shared"

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

export function isBootstrapAdminEmail(
  email: string,
  adminEmails: ReadonlySet<string> = parseAdminEmails(process.env.ADMIN_EMAILS)
): boolean {
  return adminEmails.has(normaliseEmail(email))
}
