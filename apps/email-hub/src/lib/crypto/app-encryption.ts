import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12
const KEY_BYTES = 32
const DEFAULT_KEY_ID = "v1"

export class AppEncryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AppEncryptionError"
  }
}

/**
 * Parse `APP_ENCRYPTION_KEY`.
 * Accepted forms: raw 32-byte base64, or `keyId:base64`.
 */
export function parseAppEncryptionKey(raw: string): {
  keyId: string
  key: Buffer
} {
  const trimmed = raw.trim()
  const colon = trimmed.indexOf(":")
  const keyId = colon > 0 ? trimmed.slice(0, colon) : DEFAULT_KEY_ID
  const material = colon > 0 ? trimmed.slice(colon + 1) : trimmed
  const key = Buffer.from(material, "base64")
  if (key.length !== KEY_BYTES) {
    throw new AppEncryptionError(
      "APP_ENCRYPTION_KEY must decode to 32 bytes (AES-256)"
    )
  }
  return { keyId, key }
}

/**
 * Encrypt plaintext. Format: `keyId.iv.tag.ciphertext` (base64url parts after keyId).
 */
export function encryptWithAppKey(plaintext: string, rawKey: string): string {
  const { keyId, key } = parseAppEncryptionKey(rawKey)
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [
    keyId,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".")
}

export function decryptWithAppKey(payload: string, rawKey: string): string {
  const parts = payload.split(".")
  if (parts.length !== 4) {
    throw new AppEncryptionError("Invalid encrypted payload")
  }
  const [keyId, ivB64, tagB64, cipherB64] = parts
  if (!keyId || !ivB64 || !tagB64 || !cipherB64) {
    throw new AppEncryptionError("Invalid encrypted payload")
  }
  const { keyId: configuredId, key } = parseAppEncryptionKey(rawKey)
  if (keyId !== configuredId) {
    throw new AppEncryptionError("Unknown encryption key id")
  }

  const iv = Buffer.from(ivB64, "base64url")
  const tag = Buffer.from(tagB64, "base64url")
  const ciphertext = Buffer.from(cipherB64, "base64url")
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8")
}

export function readAppEncryptionKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string {
  const value = env.APP_ENCRYPTION_KEY?.trim()
  if (!value) {
    throw new AppEncryptionError("APP_ENCRYPTION_KEY is not configured")
  }
  return value
}
