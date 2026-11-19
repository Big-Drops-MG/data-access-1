import { describe, expect, it } from "vitest"

import { AppError } from "@workspace/shared"

import {
  assertStaffRequestOrigin,
  isMutatingMethod,
  isStaffApiPath,
  originsMatch,
  resolveAppOrigin,
  shouldRejectStaffOriginInProxy,
} from "@/lib/security/origin-check"

describe("isStaffApiPath", () => {
  it("treats hub staff APIs as staff paths", () => {
    expect(isStaffApiPath("/api/templates")).toBe(true)
    expect(isStaffApiPath("/api/admin/users")).toBe(true)
    expect(isStaffApiPath("/api/domains/1")).toBe(true)
  })

  it("excludes public, auth, machine, and health routes", () => {
    expect(isStaffApiPath("/api/ext/emails/send")).toBe(false)
    expect(isStaffApiPath("/api/ext/webhooks/fbl")).toBe(false)
    expect(isStaffApiPath("/api/auth/callback/google")).toBe(false)
    expect(isStaffApiPath("/api/u/token")).toBe(false)
    expect(isStaffApiPath("/api/health")).toBe(false)
    expect(isStaffApiPath("/api/ready")).toBe(false)
    expect(isStaffApiPath("/dashboard")).toBe(false)
  })
})

describe("isMutatingMethod", () => {
  it("flags non-safe methods", () => {
    expect(isMutatingMethod("GET")).toBe(false)
    expect(isMutatingMethod("HEAD")).toBe(false)
    expect(isMutatingMethod("OPTIONS")).toBe(false)
    expect(isMutatingMethod("POST")).toBe(true)
    expect(isMutatingMethod("PUT")).toBe(true)
    expect(isMutatingMethod("PATCH")).toBe(true)
    expect(isMutatingMethod("DELETE")).toBe(true)
  })
})

describe("resolveAppOrigin", () => {
  it("returns the origin from BETTER_AUTH_URL", () => {
    expect(resolveAppOrigin("https://hub.example.com/app")).toBe(
      "https://hub.example.com"
    )
  })

  it("returns null for missing or invalid values", () => {
    expect(resolveAppOrigin(null)).toBeNull()
    expect(resolveAppOrigin("")).toBeNull()
    expect(resolveAppOrigin("not a url")).toBeNull()
  })
})

describe("originsMatch", () => {
  it("requires an exact Origin match", () => {
    const request = new Request("https://hub.example.com/api/templates", {
      method: "POST",
      headers: { Origin: "https://hub.example.com" },
    })
    expect(originsMatch(request, "https://hub.example.com")).toBe(true)
    expect(originsMatch(request, "https://evil.example.com")).toBe(false)
  })

  it("rejects missing Origin when strict", () => {
    const request = new Request("https://hub.example.com/api/templates", {
      method: "POST",
    })
    expect(
      originsMatch(request, "https://hub.example.com", { strict: true })
    ).toBe(false)
  })
})

describe("assertStaffRequestOrigin", () => {
  it("allows safe methods without Origin", () => {
    expect(() =>
      assertStaffRequestOrigin(
        new Request("https://hub.example.com/api/templates"),
        { appOrigin: "https://hub.example.com" }
      )
    ).not.toThrow()
  })

  it("allows mutating non-staff paths without Origin", () => {
    expect(() =>
      assertStaffRequestOrigin(
        new Request("https://hub.example.com/api/ext/emails/send", {
          method: "POST",
        }),
        { appOrigin: "https://hub.example.com" }
      )
    ).not.toThrow()
  })

  it("rejects cross-origin staff POST", () => {
    expect(() =>
      assertStaffRequestOrigin(
        new Request("https://hub.example.com/api/templates", {
          method: "POST",
          headers: { Origin: "https://attacker.example" },
        }),
        { appOrigin: "https://hub.example.com" }
      )
    ).toThrow(AppError)
  })

  it("rejects staff POST with missing Origin when strict", () => {
    let error: unknown
    try {
      assertStaffRequestOrigin(
        new Request("https://hub.example.com/api/templates", {
          method: "POST",
        }),
        { appOrigin: "https://hub.example.com", strict: true }
      )
    } catch (caught) {
      error = caught
    }
    expect(error).toMatchObject({
      code: "forbidden",
      status: 403,
    })
  })

  it("allows matching Origin on staff POST", () => {
    expect(() =>
      assertStaffRequestOrigin(
        new Request("https://hub.example.com/api/templates", {
          method: "POST",
          headers: { Origin: "https://hub.example.com" },
        }),
        { appOrigin: "https://hub.example.com" }
      )
    ).not.toThrow()
  })

  it("fails closed when app origin is unset", () => {
    let error: unknown
    try {
      assertStaffRequestOrigin(
        new Request("https://hub.example.com/api/templates", {
          method: "POST",
          headers: { Origin: "https://hub.example.com" },
        }),
        { appOrigin: null }
      )
    } catch (caught) {
      error = caught
    }
    expect(error).toMatchObject({
      code: "unavailable",
      status: 503,
    })
  })
})

describe("shouldRejectStaffOriginInProxy", () => {
  it("is true only for mutating staff API paths", () => {
    expect(shouldRejectStaffOriginInProxy("POST", "/api/templates")).toBe(true)
    expect(shouldRejectStaffOriginInProxy("GET", "/api/templates")).toBe(false)
    expect(shouldRejectStaffOriginInProxy("POST", "/api/ext/emails/send")).toBe(
      false
    )
  })
})
