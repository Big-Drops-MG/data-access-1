import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"

import { proxy } from "./proxy"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
