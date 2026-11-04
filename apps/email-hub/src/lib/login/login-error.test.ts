import { describe, expect, it } from "vitest"

import { loginDomainHint, resolveLoginError } from "./login-error"

describe("resolveLoginError", () => {
  it("returns null when there is no error", () => {
    expect(resolveLoginError(null)).toBeNull()
    expect(resolveLoginError("")).toBeNull()
  })

  it("maps unprovisioned / forbidden to the invite dead end", () => {
    expect(resolveLoginError("unprovisioned")).toMatchObject({
      code: "unprovisioned",
      title: "This Google account has no EmailHub access",
    })
    expect(resolveLoginError("FORBIDDEN")).toMatchObject({
      code: "unprovisioned",
    })
    expect(resolveLoginError("unable_to_create_user")).toMatchObject({
      code: "unprovisioned",
    })
  })

  it("maps cancelled / oauth failures to the generic SSO dead end", () => {
    expect(resolveLoginError("sso_failed")).toMatchObject({
      code: "sso_failed",
      title: "Sign-in didn't complete",
    })
    expect(resolveLoginError("access_denied")).toMatchObject({
      code: "sso_failed",
    })
    expect(resolveLoginError("state_not_found")).toMatchObject({
      code: "sso_failed",
    })
  })

  it("treats unknown codes as SSO failed without leaking internals", () => {
    expect(resolveLoginError("SOME_INTERNAL_DETAIL")).toMatchObject({
      code: "sso_failed",
    })
  })
})

describe("loginDomainHint", () => {
  it("returns the Workspace domain with an @ prefix", () => {
    expect(loginDomainHint()).toBe("@bigdropsmarketing.com")
  })
})
