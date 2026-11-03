import { describe, expect, it } from "vitest"

import {
  DNS_PROPAGATION_WINDOW_MS,
  dnsValueMatches,
  domainStatusAfterCheck,
  evaluateDnsRecord,
} from "./check-dns"

const spf = {
  purpose: "spf" as const,
  recordType: "TXT",
  expectedValue: "v=spf1 include:amazonses.com ~all",
}

describe("dnsValueMatches", () => {
  it("matches CNAME targets ignoring case and trailing dot", () => {
    expect(
      dnsValueMatches(
        {
          purpose: "dkim",
          recordType: "CNAME",
          expectedValue: "abc.dkim.amazonses.com",
        },
        "ABC.dkim.amazonses.com."
      )
    ).toBe(true)
  })

  it("accepts SPF that includes amazonses with extra mechanisms", () => {
    expect(
      dnsValueMatches(
        spf,
        "v=spf1 include:_spf.google.com include:amazonses.com -all"
      )
    ).toBe(true)
    expect(dnsValueMatches(spf, "v=spf1 include:other.example -all")).toBe(
      false
    )
  })

  it("accepts any DMARC policy", () => {
    expect(
      dnsValueMatches(
        {
          purpose: "dmarc",
          recordType: "TXT",
          expectedValue: "v=DMARC1; p=none;",
        },
        "v=DMARC1; p=reject; rua=mailto:a@example.com"
      )
    ).toBe(true)
  })

  it("matches MX priority and exchange", () => {
    const mx = {
      purpose: "mx" as const,
      recordType: "MX",
      expectedValue: "10 feedback-smtp.us-east-1.amazonses.com",
    }
    expect(
      dnsValueMatches(mx, "10 feedback-smtp.us-east-1.amazonses.com.")
    ).toBe(true)
    expect(
      dnsValueMatches(mx, "20 feedback-smtp.us-east-1.amazonses.com")
    ).toBe(false)
  })
})

describe("evaluateDnsRecord", () => {
  const now = new Date("2026-11-02T12:00:00.000Z")
  const fresh = new Date(now.getTime() - 60 * 60 * 1000)
  const old = new Date(now.getTime() - DNS_PROPAGATION_WINDOW_MS - 1000)

  it("passes when a value matches", () => {
    expect(
      evaluateDnsRecord(
        spf,
        { kind: "found", values: ["v=spf1 include:amazonses.com ~all"] },
        { domainCreatedAt: fresh, now }
      ).status
    ).toBe("pass")
  })

  it("fails when records exist with the wrong value", () => {
    expect(
      evaluateDnsRecord(
        spf,
        { kind: "found", values: ["v=spf1 -all"] },
        { domainCreatedAt: fresh, now }
      )
    ).toEqual({ status: "fail", lastSeenValue: "v=spf1 -all" })
  })

  it("treats missing records as propagating until the SES window ends", () => {
    expect(
      evaluateDnsRecord(
        spf,
        { kind: "not_found" },
        { domainCreatedAt: fresh, now }
      ).status
    ).toBe("pending_propagation")
    expect(
      evaluateDnsRecord(
        spf,
        { kind: "not_found" },
        { domainCreatedAt: old, now }
      ).status
    ).toBe("fail")
  })

  it("leaves the record unchanged on resolver errors", () => {
    expect(
      evaluateDnsRecord(
        spf,
        { kind: "error", message: "timeout" },
        { domainCreatedAt: fresh, now }
      ).status
    ).toBe("unchanged")
  })
})

describe("domainStatusAfterCheck", () => {
  it("verifies when every record passes", () => {
    expect(domainStatusAfterCheck("pending", ["pass", "pass"])).toBe("verified")
    expect(domainStatusAfterCheck("failed", ["pass", "pass"])).toBe("verified")
  })

  it("degrades a verified domain when a record stops passing", () => {
    expect(domainStatusAfterCheck("verified", ["pass", "fail"])).toBe("failed")
  })

  it("moves new domains through verifying", () => {
    expect(
      domainStatusAfterCheck("pending", ["pass", "pending_propagation"])
    ).toBe("verifying")
    expect(
      domainStatusAfterCheck("pending", ["pending_propagation", "pending"])
    ).toBe("pending")
  })

  it("never reactivates an inactive domain", () => {
    expect(domainStatusAfterCheck("inactive", ["pass"])).toBe("inactive")
  })
})
