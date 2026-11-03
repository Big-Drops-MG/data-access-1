import { describe, expect, it } from "vitest"

import {
  dnsCheckGroup,
  mailFromDomainFromRecords,
  summarizeDnsRecords,
  type DnsRollupRecord,
} from "./dns-rollup"

const domain = "send.example.com"

function records(
  statuses: Partial<Record<string, DnsRollupRecord["status"]>>
): DnsRollupRecord[] {
  return [
    { purpose: "dkim", name: `a._domainkey.${domain}`, status: "pass" },
    { purpose: "dkim", name: `b._domainkey.${domain}`, status: "pass" },
    { purpose: "spf", name: domain, status: "pass" },
    { purpose: "dmarc", name: `_dmarc.${domain}`, status: "pass" },
    { purpose: "mx", name: `bounce.${domain}`, status: "pass" },
    { purpose: "spf", name: `bounce.${domain}`, status: "pass" },
  ].map((record) => ({
    ...record,
    status: statuses[record.purpose] ?? record.status,
  })) as DnsRollupRecord[]
}

describe("dnsCheckGroup", () => {
  it("separates apex SPF from MAIL FROM SPF", () => {
    expect(dnsCheckGroup(domain, { purpose: "spf", name: domain })).toBe("spf")
    expect(
      dnsCheckGroup(domain, { purpose: "spf", name: `bounce.${domain}` })
    ).toBe("mail_from")
    expect(
      dnsCheckGroup(domain, { purpose: "mx", name: `bounce.${domain}` })
    ).toBe("mail_from")
  })
})

describe("summarizeDnsRecords", () => {
  it("passes every group when all records pass", () => {
    expect(summarizeDnsRecords(domain, records({}))).toEqual({
      spf: "pass",
      dkim: "pass",
      dmarc: "pass",
      mail_from: "pass",
    })
  })

  it("fails a group when any member fails", () => {
    const summary = summarizeDnsRecords(domain, records({ dkim: "fail" }))
    expect(summary.dkim).toBe("fail")
    expect(summary.spf).toBe("pass")
  })

  it("is pending while records are unchecked or propagating", () => {
    expect(
      summarizeDnsRecords(domain, records({ dmarc: "pending_propagation" }))
        .dmarc
    ).toBe("pending")
    expect(summarizeDnsRecords(domain, [])).toEqual({
      spf: "pending",
      dkim: "pending",
      dmarc: "pending",
      mail_from: "pass",
    })
  })

  it("treats missing MAIL FROM records as pass (optional)", () => {
    const withoutMailFrom = records({}).filter(
      (record) =>
        record.purpose !== "mx" &&
        !(record.purpose === "spf" && record.name.startsWith("bounce."))
    )
    expect(summarizeDnsRecords(domain, withoutMailFrom)).toEqual({
      spf: "pass",
      dkim: "pass",
      dmarc: "pass",
      mail_from: "pass",
    })
  })
})

describe("mailFromDomainFromRecords", () => {
  it("reads the MX record name", () => {
    expect(mailFromDomainFromRecords(records({}))).toBe(`bounce.${domain}`)
    expect(mailFromDomainFromRecords([])).toBeNull()
  })
})
