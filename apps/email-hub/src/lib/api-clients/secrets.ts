import { createHash, randomBytes } from "node:crypto"

const SECRET_BYTES = 32

/** 256-bit secret. Returned once; only a hash and ciphertext are stored. */
export function generateApiClientSecret(): string {
  return randomBytes(SECRET_BYTES).toString("base64url")
}

/** Public prefix. It is not derived from the secret. */
export function generateKeyPrefix(): string {
  return `eh_${randomBytes(4).toString("hex")}`
}

export function hashApiClientSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex")
}
