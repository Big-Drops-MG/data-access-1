import { beforeEach, describe, expect, it, vi } from "vitest"

const setServers = vi.hoisted(() => vi.fn())
const resolveTxt = vi.hoisted(() => vi.fn())
const resolveCname = vi.hoisted(() => vi.fn())
const resolveMx = vi.hoisted(() => vi.fn())

vi.mock("node:dns/promises", () => ({
  Resolver: vi.fn(function MockResolver(this: {
    setServers: typeof setServers
    resolveTxt: typeof resolveTxt
    resolveCname: typeof resolveCname
    resolveMx: typeof resolveMx
  }) {
    this.setServers = setServers
    this.resolveTxt = resolveTxt
    this.resolveCname = resolveCname
    this.resolveMx = resolveMx
  }),
}))

import { createDnsLookup, PUBLIC_DNS_SERVERS } from "./dns-resolver"

describe("createDnsLookup", () => {
  beforeEach(() => {
    setServers.mockReset()
    resolveTxt.mockReset()
    resolveCname.mockReset()
    resolveMx.mockReset()
  })

  it("pins lookups to public resolvers instead of the system DNS", async () => {
    resolveTxt.mockResolvedValue([["v=spf1 include:amazonses.com ~all"]])
    const lookup = createDnsLookup()
    expect(setServers).toHaveBeenCalledWith([...PUBLIC_DNS_SERVERS])

    await expect(
      lookup({ name: "dev.quotifii.com", recordType: "TXT" })
    ).resolves.toEqual({
      kind: "found",
      values: ["v=spf1 include:amazonses.com ~all"],
    })
  })

  it("maps ENOTFOUND to not_found", async () => {
    const error = Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" })
    resolveCname.mockRejectedValue(error)
    const lookup = createDnsLookup()
    await expect(
      lookup({ name: "missing.example.com", recordType: "CNAME" })
    ).resolves.toEqual({ kind: "not_found" })
  })

  it("maps connection failures to error", async () => {
    const error = Object.assign(new Error("ECONNREFUSED"), {
      code: "ECONNREFUSED",
    })
    resolveMx.mockRejectedValue(error)
    const lookup = createDnsLookup()
    await expect(
      lookup({ name: "mail.example.com", recordType: "MX" })
    ).resolves.toEqual({
      kind: "error",
      message: "ECONNREFUSED",
    })
  })
})
