import { describe, expect, it } from "vitest"

import {
  buildSetupStepViews,
  dnsProgressLabel,
  dnsPurposeLabel,
  formatDnsRecordsForCopy,
  shortDomainId,
  summarizeDnsProgress,
} from "./domain-setup-summary"

describe("summarizeDnsProgress", () => {
  it("counts found, propagating, and missing", () => {
    expect(
      summarizeDnsProgress([
        { status: "pass" },
        { status: "pending" },
        { status: "pending_propagation" },
        { status: "fail" },
      ])
    ).toEqual({ total: 4, found: 1, propagating: 2, missing: 1 })
  })
})

describe("dnsProgressLabel", () => {
  it("matches design copy for mixed progress", () => {
    expect(
      dnsProgressLabel({ total: 7, found: 3, propagating: 3, missing: 1 })
    ).toBe("3 of 7 found · 3 still propagating · 1 missing")
  })
})

describe("buildSetupStepViews", () => {
  it("marks DNS step in progress after SES when records are unchecked", () => {
    const views = buildSetupStepViews({
      status: "pending",
      setupSteps: [
        {
          id: "1",
          domain_id: "d",
          step: "ses_identity",
          status: "done",
          error: null,
          started_at: null,
          completed_at: "2026-10-08T17:00:00.000Z",
          updated_at: "2026-10-08T17:00:00.000Z",
        },
      ],
      dnsRecords: [
        {
          id: "r1",
          domain_id: "d",
          purpose: "dkim",
          name: "a._domainkey.example.com",
          record_type: "CNAME",
          expected_value: "x",
          last_seen_value: null,
          status: "pending",
          last_checked_at: null,
          created_at: "2026-10-08T17:00:00.000Z",
          updated_at: "2026-10-08T17:00:00.000Z",
        },
      ],
    })
    expect(views[0]?.state).toBe("done")
    expect(views[1]?.state).toBe("in_progress")
    expect(views[2]?.state).toBe("pending")
  })
})

describe("formatDnsRecordsForCopy", () => {
  it("emits one tab-separated TYPE NAME VALUE line per record", () => {
    expect(
      formatDnsRecordsForCopy([
        {
          record_type: "CNAME",
          name: "a._domainkey.example.com",
          expected_value: "a.dkim.amazonses.com",
        },
        {
          record_type: "MX",
          name: "bounce.example.com",
          expected_value: "10 feedback-smtp.us-east-1.amazonses.com",
        },
      ])
    ).toBe(
      "CNAME\ta._domainkey.example.com\ta.dkim.amazonses.com\nMX\tbounce.example.com\t10 feedback-smtp.us-east-1.amazonses.com"
    )
  })
})

describe("dnsPurposeLabel", () => {
  it("labels MAIL FROM SPF separately from apex SPF", () => {
    expect(
      dnsPurposeLabel(
        { purpose: "spf", name: "example.com", record_type: "TXT" },
        "example.com"
      )
    ).toBe("SPF")
    expect(
      dnsPurposeLabel(
        { purpose: "spf", name: "bounce.example.com", record_type: "TXT" },
        "example.com"
      )
    ).toBe("MAIL FROM SPF")
    expect(
      dnsPurposeLabel(
        { purpose: "mx", name: "bounce.example.com", record_type: "MX" },
        "example.com"
      )
    ).toBe("MAIL FROM")
  })
})

describe("shortDomainId", () => {
  it("uses the last four hex chars", () => {
    expect(shortDomainId("019a0000-0000-7000-8000-0000000000aa")).toBe(
      "dom_00aa"
    )
  })
})
