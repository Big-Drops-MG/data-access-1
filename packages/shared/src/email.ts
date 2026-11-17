import { createHash } from "node:crypto"

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function hashEmail(email: string): string {
  return createHash("sha256")
    .update(normaliseEmail(email), "utf8")
    .digest("hex")
}

export function md5HashEmail(email: string): string {
  return createHash("md5").update(normaliseEmail(email), "utf8").digest("hex")
}

export function isMd5Hex(value: string): boolean {
  return /^[a-f0-9]{32}$/i.test(value.trim())
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
