import { describe, expect, it } from "vitest"

import {
  formatRate,
  formatReputation,
  pivotDomainMetrics,
  providerLabel,
} from "@/features/feedback/domains-reputation-page"

describe("domains reputation helpers", () => {
  it("labels providers", () => {
    expect(providerLabel("google_postmaster")).toBe("Google Postmaster")
    expect(providerLabel("snds")).toBe("Microsoft SNDS")
    expect(providerLabel("yahoo")).toBe("Yahoo")
  })

  it("formats rates and reputation", () => {
    expect(formatRate(0.012)).toBe("1.20%")
    expect(formatRate(null)).toBe("—")
    expect(formatReputation(4)).toBe("High")
    expect(formatReputation(1)).toBe("Bad")
    expect(formatReputation(null)).toBe("—")
  })

  it("pivots latest metrics per provider and target", () => {
    const rows = pivotDomainMetrics([
      {
        provider: "google_postmaster",
        target: "a.example.com",
        metric: "spam_rate",
        day: "2026-11-14",
        value: 0.01,
      },
      {
        provider: "google_postmaster",
        target: "a.example.com",
        metric: "spam_rate",
        day: "2026-11-15",
        value: 0.02,
      },
      {
        provider: "google_postmaster",
        target: "a.example.com",
        metric: "domain_reputation",
        day: "2026-11-15",
        value: 4,
      },
      {
        provider: "snds",
        target: "a.example.com",
        metric: "complaint_rate",
        day: "2026-11-15",
        value: 0.001,
      },
    ])
    expect(rows).toHaveLength(2)
    const google = rows.find((row) => row.provider === "google_postmaster")
    expect(google).toMatchObject({
      domain: "a.example.com",
      day: "2026-11-15",
      spam_rate: 0.02,
      domain_reputation: 4,
    })
    const snds = rows.find((row) => row.provider === "snds")
    expect(snds).toMatchObject({
      complaint_rate: 0.001,
    })
  })
})
