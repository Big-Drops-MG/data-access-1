import { describe, expect, it } from "vitest"

import {
  signTrustDeviceToken,
  tryConsumeTrustDevice,
} from "./two-factor-trust-device"

describe("signTrustDeviceToken", () => {
  it("is stable for the same inputs", () => {
    const a = signTrustDeviceToken("secret", "user-1", "trust-device-abc")
    const b = signTrustDeviceToken("secret", "user-1", "trust-device-abc")
    expect(a).toBe(b)
    expect(a).not.toContain("=")
  })

  it("changes when the identifier changes", () => {
    const a = signTrustDeviceToken("secret", "user-1", "trust-device-a")
    const b = signTrustDeviceToken("secret", "user-1", "trust-device-b")
    expect(a).not.toBe(b)
  })
})

describe("tryConsumeTrustDevice", () => {
  it("returns false when the cookie is missing", async () => {
    const ok = await tryConsumeTrustDevice(
      {
        getSignedCookie: async () => null,
        setSignedCookie: async () => undefined,
        context: {
          secret: "secret",
          createAuthCookie: (name) => ({ name, attributes: {} }),
          internalAdapter: {
            findVerificationValue: async () => null,
            deleteVerificationByIdentifier: async () => undefined,
            createVerificationValue: async () => undefined,
          },
        },
      },
      "user-1"
    )
    expect(ok).toBe(false)
  })

  it("rotates a valid trust-device cookie", async () => {
    const secret = "secret"
    const userId = "user-1"
    const identifier = "trust-device-abc"
    const token = signTrustDeviceToken(secret, userId, identifier)
    let created: { identifier: string; value: string } | undefined
    let deleted: string | undefined
    let setCookie: string | undefined

    const ok = await tryConsumeTrustDevice(
      {
        getSignedCookie: async () => `${token}!${identifier}`,
        setSignedCookie: async (_name, value) => {
          setCookie = value
        },
        context: {
          secret,
          createAuthCookie: (name) => ({ name, attributes: { path: "/" } }),
          internalAdapter: {
            findVerificationValue: async () => ({
              value: userId,
              expiresAt: new Date(Date.now() + 60_000),
            }),
            deleteVerificationByIdentifier: async (id) => {
              deleted = id
            },
            createVerificationValue: async (input) => {
              created = input
            },
          },
        },
      },
      userId
    )

    expect(ok).toBe(true)
    expect(deleted).toBe(identifier)
    expect(created?.value).toBe(userId)
    expect(created?.identifier).toMatch(/^trust-device-/)
    expect(setCookie).toMatch(/^[^!]+!trust-device-/)
  })
})
