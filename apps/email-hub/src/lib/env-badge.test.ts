import { describe, expect, it } from "vitest"

import { isDevEnvironmentBadgeVisible } from "./env-badge"

describe("isDevEnvironmentBadgeVisible", () => {
  it("hides the badge when EMAILHUB_ENV is prod", () => {
    expect(isDevEnvironmentBadgeVisible("prod", "production")).toBe(false)
    expect(isDevEnvironmentBadgeVisible("prod", "development")).toBe(false)
  })

  it("shows the badge when EMAILHUB_ENV is dev", () => {
    expect(isDevEnvironmentBadgeVisible("dev", "production")).toBe(true)
    expect(isDevEnvironmentBadgeVisible("dev", "development")).toBe(true)
  })

  it("falls back to NODE_ENV when EMAILHUB_ENV is unset", () => {
    expect(isDevEnvironmentBadgeVisible(undefined, "development")).toBe(true)
    expect(isDevEnvironmentBadgeVisible(undefined, "test")).toBe(true)
    expect(isDevEnvironmentBadgeVisible(undefined, "production")).toBe(false)
  })
})
