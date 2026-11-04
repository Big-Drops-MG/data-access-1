import { createHash } from "node:crypto"

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** SHA-256 hex of the normalised email (suppression / recipient lookup). */
export function hashEmail(email: string): string {
  return createHash("sha256")
    .update(normaliseEmail(email), "utf8")
    .digest("hex")
}

export function maskEmail(email: string): string {
  const normalised = normaliseEmail(email)
  const at = normalised.lastIndexOf("@")
  if (at <= 0 || at === normalised.length - 1) {
    return normalised
  }

  const local = normalised.slice(0, at)
  const domain = normalised.slice(at + 1)
  return `${local.slice(0, 2)}***@${domain}`
}
