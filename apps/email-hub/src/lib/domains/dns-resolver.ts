import { Resolver } from "node:dns/promises"

import type { DnsLookup, DnsLookupResult } from "./check-dns"

const NOT_FOUND_CODES = new Set(["ENOTFOUND", "ENODATA"])

/**
 * Public recursive resolvers. System resolvers often refuse queries in Docker,
 * WSL, or broken local DNS setups (ECONNREFUSED), which previously left every
 * Check now as a silent no-op.
 */
export const PUBLIC_DNS_SERVERS = ["1.1.1.1", "1.0.0.1", "8.8.8.8"] as const

function toResult(error: unknown): DnsLookupResult {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : ""
  if (NOT_FOUND_CODES.has(code)) {
    return { kind: "not_found" }
  }
  return {
    kind: "error",
    message: error instanceof Error ? error.message : "DNS lookup failed",
  }
}

export function createDnsLookup(
  servers: readonly string[] = PUBLIC_DNS_SERVERS
): DnsLookup {
  const resolver = new Resolver({ timeout: 5000, tries: 2 })
  resolver.setServers([...servers])

  return async ({ name, recordType }) => {
    try {
      switch (recordType) {
        case "CNAME":
          return { kind: "found", values: await resolver.resolveCname(name) }
        case "TXT": {
          const answers = await resolver.resolveTxt(name)
          return {
            kind: "found",
            values: answers.map((chunks) => chunks.join("")),
          }
        }
        case "MX": {
          const answers = await resolver.resolveMx(name)
          return {
            kind: "found",
            values: answers.map(
              ({ priority, exchange }) => `${priority} ${exchange}`
            ),
          }
        }
        default:
          return {
            kind: "error",
            message: `Unsupported record type ${recordType}`,
          }
      }
    } catch (error) {
      return toResult(error)
    }
  }
}
