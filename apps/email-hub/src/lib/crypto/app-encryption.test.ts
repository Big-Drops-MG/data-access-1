import { describe, expect, it } from "vitest"

import {
  AppEncryptionError,
  decryptWithAppKey,
  encryptWithAppKey,
  parseAppEncryptionKey,
} from "@/lib/crypto/app-encryption"

const KEY = Buffer.alloc(32, 7).toString("base64")

describe("app encryption", () => {
  it("round-trips plaintext with APP_ENCRYPTION_KEY material", () => {
    const encrypted = encryptWithAppKey("machine-secret", KEY)
    expect(encrypted.split(".")).toHaveLength(4)
    expect(decryptWithAppKey(encrypted, KEY)).toBe("machine-secret")
  })

  it("parses keyId:base64 form", () => {
    const raw = `prod:${KEY}`
    const parsed = parseAppEncryptionKey(raw)
    expect(parsed.keyId).toBe("prod")
    expect(parsed.key.length).toBe(32)
    const encrypted = encryptWithAppKey("x", raw)
    expect(encrypted.startsWith("prod.")).toBe(true)
    expect(decryptWithAppKey(encrypted, raw)).toBe("x")
  })

  it("rejects wrong key length", () => {
    expect(() =>
      parseAppEncryptionKey(Buffer.alloc(16).toString("base64"))
    ).toThrow(AppEncryptionError)
  })
})
