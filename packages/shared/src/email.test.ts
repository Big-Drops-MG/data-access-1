import { describe, expect, it } from "vitest"

import { hashEmail, maskEmail, normaliseEmail } from "./email.js"

describe("normaliseEmail", () => {
  it("trims and lowercases", () => {
    expect(normaliseEmail("  Jane.Doe@Example.COM ")).toBe(
      "jane.doe@example.com"
    )
  })
})

describe("hashEmail", () => {
  it("hashes the normalised email as sha256 hex", () => {
    const a = hashEmail("  Jane@Example.COM ")
    const b = hashEmail("jane@example.com")
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
    expect(a).not.toBe(hashEmail("other@example.com"))
  })
})

describe("maskEmail", () => {
  it("keeps the first two local characters and masks the rest", () => {
    expect(maskEmail("jane@example.com")).toBe("ja***@example.com")
  })

  it("normalises before masking", () => {
    expect(maskEmail("  Jane@Example.COM ")).toBe("ja***@example.com")
  })

  it("handles short local parts", () => {
    expect(maskEmail("a@example.com")).toBe("a***@example.com")
    expect(maskEmail("ab@example.com")).toBe("ab***@example.com")
  })

  it("returns normalised input when there is no usable @", () => {
    expect(maskEmail("not-an-email")).toBe("not-an-email")
    expect(maskEmail("@example.com")).toBe("@example.com")
    expect(maskEmail("local@")).toBe("local@")
  })
})
