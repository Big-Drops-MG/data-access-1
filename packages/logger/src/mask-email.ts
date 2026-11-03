const INVALID_EMAIL = "[invalid-email]"

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

/**
 * Mask a mailbox for logs: first Unicode code point, then `***`, then the domain.
 * `alexanderson@example.com` becomes `a***@example.com`.
 * Does not return the original address.
 */
export function maskEmail(email: string): string {
  if (typeof email !== "string") {
    return ""
  }

  const trimmed = email.trim().toLowerCase()
  if (trimmed === "") {
    return ""
  }

  if (hasControlCharacter(trimmed)) {
    return INVALID_EMAIL
  }

  const at = trimmed.lastIndexOf("@")
  if (at <= 0 || at === trimmed.length - 1) {
    return INVALID_EMAIL
  }

  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  if (
    local.includes(" ") ||
    domain.includes(" ") ||
    domain.includes("@") ||
    local.includes("@")
  ) {
    return INVALID_EMAIL
  }

  const first = Array.from(local)[0]
  if (!first) {
    return INVALID_EMAIL
  }

  return `${first}***@${domain}`
}
