import { describe, expect, it } from "vitest"

import { postAuthPath } from "./post-auth-path"

describe("postAuthPath", () => {
  it("returns the safe next path when onboarding is done", () => {
    expect(postAuthPath({ jobTitle: "CEO" }, "/sends")).toBe("/sends")
    expect(postAuthPath({ jobTitle: "CEO" }, null)).toBe("/dashboard")
  })

  it("sends new users to a clean /onboarding path", () => {
    expect(postAuthPath({ jobTitle: null }, "/dashboard")).toBe("/onboarding")
    expect(postAuthPath({ jobTitle: null }, "/onboarding")).toBe("/onboarding")
    expect(postAuthPath({ jobTitle: null }, "/sends")).toBe("/onboarding")
  })
})
