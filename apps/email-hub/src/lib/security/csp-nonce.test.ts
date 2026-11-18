import { describe, expect, it } from "vitest"

import {
  buildContentSecurityPolicy,
  createCspNonce,
  sentryIngestHostFromDsn,
} from "@/lib/security/csp-nonce"

describe("createCspNonce", () => {
  it("returns url-safe base64 from random bytes", () => {
    const bytes = new Uint8Array(16).fill(7)
    const nonce = createCspNonce(() => bytes)
    expect(nonce).toBe(btoa(String.fromCharCode(...bytes)))
    expect(nonce.length).toBeGreaterThan(10)
  })

  it("produces distinct values by default", () => {
    expect(createCspNonce()).not.toBe(createCspNonce())
  })
})

describe("sentryIngestHostFromDsn", () => {
  it("parses the ingest host", () => {
    expect(
      sentryIngestHostFromDsn("https://abc123@o123.ingest.sentry.io/456")
    ).toBe("o123.ingest.sentry.io")
  })

  it("returns null for missing or invalid DSN", () => {
    expect(sentryIngestHostFromDsn(undefined)).toBeNull()
    expect(sentryIngestHostFromDsn("")).toBeNull()
    expect(sentryIngestHostFromDsn("not-a-url")).toBeNull()
  })
})

describe("buildContentSecurityPolicy", () => {
  it("matches SD#14.5 directives with the request nonce", () => {
    const policy = buildContentSecurityPolicy("abc123")
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("script-src 'self' 'nonce-abc123'")
    expect(policy).toContain("style-src 'self' 'unsafe-inline'")
    expect(policy).toContain("img-src 'self' data:")
    expect(policy).toContain("connect-src 'self'")
    expect(policy).not.toContain("ingest.sentry.io")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("base-uri 'self'")
    expect(policy).toContain("form-action 'self'")
  })

  it("adds the Sentry ingest host to connect-src when provided", () => {
    const policy = buildContentSecurityPolicy("n1", {
      sentryIngestHost: "o1.ingest.sentry.io",
    })
    expect(policy).toContain("connect-src 'self' https://o1.ingest.sentry.io")
  })
})
