import { createHash } from "node:crypto"

import { normaliseEmail } from "./email-format.js"

export { maskEmail, normaliseEmail } from "./email-format.js"

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
