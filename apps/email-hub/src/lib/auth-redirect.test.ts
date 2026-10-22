import { afterEach, describe, expect, it, vi } from "vitest"

import { loginRedirectPath, redirectToLogin } from "./auth-redirect.js"

describe("loginRedirectPath", () => {
  it("builds /login?next= with an encoded return path", () => {
    expect(loginRedirectPath("/page-states")).toBe("/login?next=%2Fpage-states")
  })

  it("prefixes a leading slash when missing", () => {
    expect(loginRedirectPath("dashboard")).toBe("/login?next=%2Fdashboard")
  })

  it("encodes query characters in the return path", () => {
    expect(loginRedirectPath("/jobs?tab=failed")).toBe(
      "/login?next=%2Fjobs%3Ftab%3Dfailed"
    )
  })
})

describe("redirectToLogin", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("assigns window.location to the login redirect path", () => {
    const assign = vi.fn()
    vi.stubGlobal("window", {
      location: { assign },
    })

    redirectToLogin("/page-states")

    expect(assign).toHaveBeenCalledWith("/login?next=%2Fpage-states")
  })
})
