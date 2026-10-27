import { describe, expect, it } from "vitest"

import { formatTotpSecret, secretFromTotpUri } from "./totp-secret"

describe("secretFromTotpUri", () => {
  it("extracts the secret query param", () => {
    expect(
      secretFromTotpUri(
        "otpauth://totp/EmailHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=EmailHub"
      )
    ).toBe("JBSWY3DPEHPK3PXP")
  })

  it("returns null for invalid URIs", () => {
    expect(secretFromTotpUri("not-a-uri")).toBeNull()
  })
})

describe("formatTotpSecret", () => {
  it("groups characters in fours", () => {
    expect(formatTotpSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP")
  })
})
