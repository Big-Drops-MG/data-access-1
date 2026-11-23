import { beforeEach, describe, expect, it, vi } from "vitest"

const setServers = vi.hoisted(() => vi.fn())
const resolve4 = vi.hoisted(() => vi.fn())
const resolveCname = vi.hoisted(() => vi.fn())
const resolveTxt = vi.hoisted(() => vi.fn())
const resolveMx = vi.hoisted(() => vi.fn())

vi.mock("node:dns/promises", () => ({
  Resolver: class {
    setServers = setServers
    resolve4 = resolve4
    resolveCname = resolveCname
    resolveTxt = resolveTxt
    resolveMx = resolveMx
    constructor(_opts?: unknown) {}
  },
}))

import { PUBLIC_DNS_SERVERS, createDnsLookup } from "./dns-resolver.js"

describe("createDnsLookup", () => {
  beforeEach(() => {
    setServers.mockReset()
    resolve4.mockReset()
    resolveCname.mockReset()
    resolveTxt.mockReset()
    resolveMx.mockReset()
  })

  it("uses public DNS servers by default", () => {
    createDnsLookup()
    expect(setServers).toHaveBeenCalledWith([...PUBLIC_DNS_SERVERS])
  })

  it("skips setServers when an empty list is passed (system resolver)", () => {
    createDnsLookup([])
    expect(setServers).not.toHaveBeenCalled()
  })

  it("resolves A, CNAME, TXT, and MX answers", async () => {
    resolve4.mockResolvedValue(["203.0.113.10"])
    resolveCname.mockResolvedValue(["token.dkim.amazonses.com"])
    resolveTxt.mockResolvedValue([["v=spf1 ", "include:amazonses.com ~all"]])
    resolveMx.mockResolvedValue([
      { priority: 10, exchange: "feedback-smtp.us-east-1.amazonses.com" },
    ])
    const lookup = createDnsLookup(["8.8.8.8"])

    await expect(
      lookup({ name: "2.0.0.127.zen.spamhaus.org", recordType: "A" })
    ).resolves.toEqual({
      kind: "found",
      values: ["203.0.113.10"],
    })
    await expect(
      lookup({ name: "k1._domainkey.example.com", recordType: "CNAME" })
    ).resolves.toEqual({
      kind: "found",
      values: ["token.dkim.amazonses.com"],
    })
    await expect(
      lookup({ name: "example.com", recordType: "TXT" })
    ).resolves.toEqual({
      kind: "found",
      values: ["v=spf1 include:amazonses.com ~all"],
    })
    await expect(
      lookup({ name: "mail.example.com", recordType: "MX" })
    ).resolves.toEqual({
      kind: "found",
      values: ["10 feedback-smtp.us-east-1.amazonses.com"],
    })
  })

  it("maps not-found and generic resolver failures", async () => {
    const lookup = createDnsLookup()
    resolveCname.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "ENOTFOUND" })
    )
    await expect(
      lookup({ name: "missing.example.com", recordType: "CNAME" })
    ).resolves.toEqual({ kind: "not_found" })

    resolveTxt.mockRejectedValueOnce(
      Object.assign(new Error("no data"), { code: "ENODATA" })
    )
    await expect(
      lookup({ name: "example.com", recordType: "TXT" })
    ).resolves.toEqual({ kind: "not_found" })

    resolveMx.mockRejectedValueOnce(new Error("timeout"))
    await expect(
      lookup({ name: "mail.example.com", recordType: "MX" })
    ).resolves.toEqual({ kind: "error", message: "timeout" })

    resolveCname.mockRejectedValueOnce("boom")
    await expect(
      lookup({ name: "x.example.com", recordType: "CNAME" })
    ).resolves.toEqual({ kind: "error", message: "DNS lookup failed" })
  })

  it("rejects unsupported record types", async () => {
    const lookup = createDnsLookup()
    await expect(
      lookup({ name: "example.com", recordType: "AAAA" })
    ).resolves.toEqual({
      kind: "error",
      message: "Unsupported record type AAAA",
    })
  })
})
