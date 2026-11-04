import { describe, expect, it } from "vitest"

import { formatLockCountdown, remainingLockMs } from "./lockout-countdown"

describe("remainingLockMs", () => {
  it("returns zero when expired", () => {
    expect(
      remainingLockMs("2020-01-01T00:00:00.000Z", new Date("2026-01-01"))
    ).toBe(0)
  })

  it("returns remaining milliseconds", () => {
    expect(
      remainingLockMs(
        "2026-01-01T00:01:00.000Z",
        new Date("2026-01-01T00:00:00.000Z")
      )
    ).toBe(60_000)
  })
})

describe("formatLockCountdown", () => {
  it("formats as M:SS", () => {
    expect(formatLockCountdown(14 * 60_000 + 52_000)).toBe("14:52")
  })
})
