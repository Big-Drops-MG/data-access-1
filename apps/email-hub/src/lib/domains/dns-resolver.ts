import { Resolver } from "node:dns/promises"

import type { DnsLookup, DnsLookupResult } from "./check-dns"

const NOT_FOUND_CODES = new Set(["ENOTFOUND", "ENODATA"])

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

export function createDnsLookup(): DnsLookup {
  const resolver = new Resolver({ timeout: 4000, tries: 2 })

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
