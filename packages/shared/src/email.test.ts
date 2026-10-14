import { describe, expect, it } from "vitest"

import { maskEmail, normaliseEmail } from "./email.js"

describe("normaliseEmail", () => {
  it("trims and lowercases", () => {
    expect(normaliseEmail("  Jane.Doe@Example.COM ")).toBe(
      "jane.doe@example.com"
    )
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
