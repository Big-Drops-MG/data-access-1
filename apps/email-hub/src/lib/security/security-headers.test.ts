import { describe, expect, it } from "vitest"

import {
  applySecurityHeaders,
  buildSecurityHeaders,
} from "@/lib/security/security-headers"

describe("buildSecurityHeaders", () => {
  it("includes every SD#14.5 response header", () => {
    const headers = buildSecurityHeaders("nonce-1", {
      sentryDsn: "https://key@o9.ingest.sentry.io/1",
    })

    expect(headers["Content-Security-Policy"]).toContain(
      "script-src 'self' 'nonce-nonce-1'"
    )
    expect(headers["Content-Security-Policy"]).toContain(
      "https://o9.ingest.sentry.io"
    )
    expect(headers["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains"
    )
    expect(headers["X-Content-Type-Options"]).toBe("nosniff")
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
    expect(headers["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=()"
    )
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin")
  })

  it("can omit HSTS for local http", () => {
    const headers = buildSecurityHeaders("n", { includeHsts: false })
    expect(headers["Strict-Transport-Security"]).toBeUndefined()
  })
})

describe("applySecurityHeaders", () => {
  it("writes each header onto the target", () => {
    const target = new Headers()
    applySecurityHeaders(target, {
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Opener-Policy": "same-origin",
    })
    expect(target.get("X-Content-Type-Options")).toBe("nosniff")
    expect(target.get("Cross-Origin-Opener-Policy")).toBe("same-origin")
  })
})
