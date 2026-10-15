import { describe, expect, it } from "vitest"

import { formatNumber, formatRate } from "./format.js"

describe("formatNumber", () => {
  it("formats with en-US grouping", () => {
    expect(formatNumber(1234567)).toBe("1,234,567")
  })
})

describe("formatRate", () => {
  it("formats as a percent with two decimals", () => {
    expect(formatRate(0.1234)).toBe("12.34%")
  })
})
