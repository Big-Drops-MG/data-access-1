import { afterEach, describe, expect, it } from "vitest"

import {
  AppEncryptionError,
  decryptWithAppKey,
  encryptWithAppKey,
  parseAppEncryptionKey,
  readAppEncryptionKeyFromEnv,
} from "./app-encryption.js"

const KEY = Buffer.alloc(32, 7).toString("base64")

describe("app encryption", () => {
  afterEach(() => {
    delete process.env.APP_ENCRYPTION_KEY
  })

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

  it("rejects malformed encrypted payloads", () => {
    expect(() => decryptWithAppKey("a.b.c", KEY)).toThrow(AppEncryptionError)
    expect(() => decryptWithAppKey("....", KEY)).toThrow(AppEncryptionError)
    expect(() => decryptWithAppKey(".iv.tag.cipher", KEY)).toThrow(
      AppEncryptionError
    )
  })

  it("rejects decrypt when key id does not match", () => {
    const encrypted = encryptWithAppKey("secret", `prod:${KEY}`)
    expect(() => decryptWithAppKey(encrypted, `other:${KEY}`)).toThrow(
      AppEncryptionError
    )
  })

  it("reads APP_ENCRYPTION_KEY from env", () => {
    process.env.APP_ENCRYPTION_KEY = `  ${KEY}  `
    expect(readAppEncryptionKeyFromEnv()).toBe(KEY)
  })

  it("rejects missing APP_ENCRYPTION_KEY", () => {
    delete process.env.APP_ENCRYPTION_KEY
    expect(() => readAppEncryptionKeyFromEnv({})).toThrow(AppEncryptionError)
    expect(() =>
      readAppEncryptionKeyFromEnv({ APP_ENCRYPTION_KEY: "  " })
    ).toThrow(AppEncryptionError)
  })
})
