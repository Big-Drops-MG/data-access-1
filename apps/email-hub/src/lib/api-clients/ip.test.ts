import { describe, expect, it } from "vitest"

import {
  canonicalIp,
  ipAllowlistMatches,
  normaliseIpAllowlist,
  readTrustedClientIp,
  trustedProxyHops,
} from "./ip"

describe("canonical IP addresses", () => {
  it("accepts IPv4 and IPv6 and rejects CIDR and leading zeros", () => {
    expect(canonicalIp("203.0.113.10")).toBe("203.0.113.10")
    expect(canonicalIp("192.168.001.1")).toBeNull()
    expect(canonicalIp("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(
      "2001:db8::1"
    )
    expect(canonicalIp("::1")).toBe("::1")
    expect(canonicalIp("::ffff:203.0.113.10")).toBe("203.0.113.10")
    expect(canonicalIp("10.0.0.0/8")).toBeNull()
    expect(canonicalIp("2001:db8::/32")).toBeNull()
    expect(canonicalIp("not-an-ip")).toBeNull()
  })
})

describe("IP allowlist normalisation", () => {
  it("canonicalises and dedupes addresses", () => {
    expect(
      normaliseIpAllowlist([
        "203.0.113.10",
        "2001:0db8::1",
        "::ffff:203.0.113.10",
      ])
    ).toEqual({
      ok: true,
      entries: ["203.0.113.10", "2001:db8::1"],
    })
  })

  it("rejects invalid CIDR and malformed addresses", () => {
    expect(normaliseIpAllowlist(["10.0.0.0/33"])).toEqual({
      ok: false,
      index: 0,
      message: "CIDR ranges are not supported",
    })
    expect(normaliseIpAllowlist(["10.0.0.0/8"])).toMatchObject({
      ok: false,
      message: "CIDR ranges are not supported",
    })
    expect(normaliseIpAllowlist(["512.1.1.1"])).toMatchObject({
      ok: false,
      message: "Invalid IP address",
    })
  })
})

describe("trusted client IP", () => {
  it("defaults to one trusted proxy hop", () => {
    expect(trustedProxyHops({ NODE_ENV: "test" })).toBe(1)
    expect(
      trustedProxyHops({ NODE_ENV: "test", TRUSTED_PROXY_HOPS: "2" })
    ).toBe(2)
    expect(
      trustedProxyHops({ NODE_ENV: "test", TRUSTED_PROXY_HOPS: "nope" })
    ).toBe(1)
  })

  it("uses the proxy-appended address, not a spoofed leftmost value", () => {
    const request = new Request("https://emailhub.test/api/ext/emails/send", {
      headers: {
        "x-forwarded-for": "198.51.100.1, 203.0.113.50",
        "x-real-ip": "198.51.100.1",
      },
    })
    expect(readTrustedClientIp(request, 1)).toBe("203.0.113.50")
  })

  it("ignores forwarded headers when no proxy is trusted", () => {
    const request = new Request("https://emailhub.test/api/ext/emails/send", {
      headers: {
        "x-forwarded-for": "198.51.100.1",
        "x-real-ip": "198.51.100.1",
      },
    })
    expect(readTrustedClientIp(request, 0)).toBeNull()
  })

  it("does not fall back to a shorter spoofed chain", () => {
    const request = new Request("https://emailhub.test/api/ext/emails/send", {
      headers: { "x-forwarded-for": "198.51.100.1" },
    })
    expect(readTrustedClientIp(request, 2)).toBeNull()
  })

  it("matches canonical IPv6 and treats an empty allowlist as any IP", () => {
    expect(ipAllowlistMatches("2001:db8::1", ["2001:db8::2"])).toBe(false)
    expect(ipAllowlistMatches("2001:0db8::1", ["2001:db8::1"])).toBe(true)
    expect(ipAllowlistMatches(null, [])).toBe(true)
    expect(ipAllowlistMatches(null, ["203.0.113.10"])).toBe(false)
    expect(ipAllowlistMatches("198.51.100.9", ["203.0.113.10"])).toBe(false)
  })
})
