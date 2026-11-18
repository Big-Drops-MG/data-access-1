import { afterEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"

import { proxy } from "./proxy"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const previousAuthUrl = process.env.BETTER_AUTH_URL

afterEach(() => {
  if (previousAuthUrl === undefined) {
    delete process.env.BETTER_AUTH_URL
  } else {
    process.env.BETTER_AUTH_URL = previousAuthUrl
  }
})

describe("proxy request ids", () => {
  it("generates an id when the header is missing and skips Set-Cookie on API", () => {
    const response = proxy(new NextRequest("http://localhost/api/health"))
    const requestId = response.headers.get("x-request-id")
    expect(requestId).toMatch(UUID)
    expect(response.headers.get("x-pathname")).toBeNull()
    expect(response.cookies.get("eh-request-id")).toBeUndefined()
  })

  it("keeps a valid incoming id and sets x-pathname outside the API", () => {
    const response = proxy(
      new NextRequest("http://localhost/dashboard", {
        headers: { "x-request-id": "req-page-1" },
      })
    )
    expect(response.headers.get("x-request-id")).toBe("req-page-1")
    expect(response.headers.get("x-pathname")).toBe("/dashboard")
    expect(response.cookies.get("eh-request-id")?.value).toBe("req-page-1")
  })

  it("reuses the existing request-id cookie without rewriting it", () => {
    const response = proxy(
      new NextRequest("http://localhost/sends", {
        headers: { cookie: "eh-request-id=req-existing-1" },
      })
    )
    expect(response.headers.get("x-request-id")).toBe("req-existing-1")
    expect(response.cookies.get("eh-request-id")).toBeUndefined()
  })

  it("replaces invalid and oversized ids", () => {
    const invalid = proxy(
      new NextRequest("http://localhost/api/health", {
        headers: { "x-request-id": "bad id" },
      })
    )
    expect(invalid.headers.get("x-request-id")).toMatch(UUID)

    const oversized = proxy(
      new NextRequest("http://localhost/api/health", {
        headers: { "x-request-id": `a${"b".repeat(200)}` },
      })
    )
    expect(oversized.headers.get("x-request-id")).toMatch(UUID)
    expect(oversized.headers.get("x-request-id")).not.toContain("bbb")
  })
})

describe("proxy SD#14.5 security headers", () => {
  it("sets CSP with a nonce and the other required headers", () => {
    const response = proxy(new NextRequest("http://localhost/dashboard"))
    const csp = response.headers.get("Content-Security-Policy")
    expect(csp).toBeTruthy()
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect(response.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    )
    expect(response.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()"
    )
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe(
      "same-origin"
    )
    expect(response.headers.get("Strict-Transport-Security")).toBeNull()
  })

  it("sets HSTS on https responses", () => {
    const response = proxy(new NextRequest("https://hub.example.com/dashboard"))
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains"
    )
  })
})

describe("proxy Origin check", () => {
  it("rejects cross-origin staff POST", async () => {
    process.env.BETTER_AUTH_URL = "https://hub.example.com"
    const response = proxy(
      new NextRequest("https://hub.example.com/api/templates", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
      })
    )
    expect(response.status).toBe(403)
    const body = (await response.json()) as {
      error: { code: string; details: Array<{ path: string }> }
    }
    expect(body.error.code).toBe("forbidden")
    expect(body.error.details[0]?.path).toBe("origin")
    expect(response.headers.get("Content-Security-Policy")).toContain("nonce-")
  })

  it("allows same-origin staff POST", () => {
    process.env.BETTER_AUTH_URL = "https://hub.example.com"
    const response = proxy(
      new NextRequest("https://hub.example.com/api/templates", {
        method: "POST",
        headers: { Origin: "https://hub.example.com" },
      })
    )
    expect(response.status).toBe(200)
  })

  it("does not Origin-check machine or auth POSTs", () => {
    process.env.BETTER_AUTH_URL = "https://hub.example.com"
    const machine = proxy(
      new NextRequest("https://hub.example.com/api/ext/emails/send", {
        method: "POST",
      })
    )
    expect(machine.status).toBe(200)

    const auth = proxy(
      new NextRequest("https://hub.example.com/api/auth/sign-out", {
        method: "POST",
      })
    )
    expect(auth.status).toBe(200)
  })
})
