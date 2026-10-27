import { describe, expect, it } from "vitest"

import { buildLoginPath } from "./login-path"

describe("buildLoginPath", () => {
  it("includes a sanitised next path", () => {
    expect(buildLoginPath({ next: "/jobs?tab=failed" })).toBe(
      `/login?next=${encodeURIComponent("/jobs?tab=failed")}`
    )
  })

  it("omits next when it resolves to the default post-login path", () => {
    expect(buildLoginPath({ next: "https://evil.example" })).toBe("/login")
    expect(buildLoginPath({ next: "/dashboard" })).toBe("/login")
    expect(buildLoginPath()).toBe("/login")
  })

  it("appends a generic error code without a default next", () => {
    expect(buildLoginPath({ next: "/dashboard", error: "unprovisioned" })).toBe(
      "/login?error=unprovisioned"
    )
  })
})
