import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import { currentTotp, totpCounter, totpForCounter } from "./totp"

function rfc6238(secret: string, counter: number): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac("sha1", Buffer.from(secret, "ascii"))
    .update(message)
    .digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff)
  return (binary % 1_000_000).toString().padStart(6, "0")
}

describe("otplib TOTP", () => {
  const secret = "e2e-totp-secret-value-0123456789abcd"

  it("matches RFC 6238 HMAC-SHA1 for the current and an expired counter", () => {
    const now = Date.parse("2026-11-18T12:00:00.000Z")
    const counter = totpCounter(now)
    expect(currentTotp(secret, now)).toBe(rfc6238(secret, counter))
    expect(totpForCounter(secret, counter - 2)).toBe(
      rfc6238(secret, counter - 2)
    )
    expect(totpForCounter(secret, counter - 2)).not.toBe(
      currentTotp(secret, now)
    )
  })
})
