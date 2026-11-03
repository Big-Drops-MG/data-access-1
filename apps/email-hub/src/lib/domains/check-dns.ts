import type { DnsRecord, Domain } from "@workspace/db"

export type DnsLookupResult =
  | { kind: "found"; values: string[] }
  | { kind: "not_found" }
  | { kind: "error"; message: string }

export type DnsLookup = (record: {
  name: string
  recordType: string
}) => Promise<DnsLookupResult>

export type DnsEvaluation =
  | { status: DnsRecord["status"]; lastSeenValue: string | null }
  | { status: "unchanged"; lastSeenValue: null }

/** SES allows up to 72 hours for DNS verification before a missing record is a failure. */
export const DNS_PROPAGATION_WINDOW_MS = 72 * 60 * 60 * 1000

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "")
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function spfIncludes(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.startsWith("include:"))
}

function parseMx(value: string): { priority: string; exchange: string } {
  const [priority = "", exchange = ""] = value.trim().split(/\s+/)
  return { priority, exchange: normalizeHost(exchange) }
}

export function dnsValueMatches(
  record: Pick<DnsRecord, "purpose" | "recordType" | "expectedValue">,
  seen: string
): boolean {
  const expected = record.expectedValue

  if (record.recordType === "CNAME") {
    return normalizeHost(seen) === normalizeHost(expected)
  }

  if (record.recordType === "MX") {
    const want = parseMx(expected)
    const got = parseMx(seen)
    return want.exchange === got.exchange && want.priority === got.priority
  }

  if (record.purpose === "spf") {
    const normalized = normalizeText(seen)
    if (!normalized.startsWith("v=spf1")) {
      return false
    }
    const present = new Set(spfIncludes(seen))
    return spfIncludes(expected).every((token) => present.has(token))
  }

  if (record.purpose === "dmarc") {
    return normalizeText(seen).startsWith("v=dmarc1")
  }

  return normalizeText(seen) === normalizeText(expected)
}

/**
 * Compare DNS answers with what SES asked for.
 * A missing record is still propagating until the SES window has elapsed.
 */
export function evaluateDnsRecord(
  record: Pick<DnsRecord, "purpose" | "recordType" | "expectedValue">,
  lookup: DnsLookupResult,
  context: { domainCreatedAt: Date; now: Date }
): DnsEvaluation {
  if (lookup.kind === "error") {
    return { status: "unchanged", lastSeenValue: null }
  }

  if (lookup.kind === "not_found") {
    const age = context.now.getTime() - context.domainCreatedAt.getTime()
    return {
      status: age < DNS_PROPAGATION_WINDOW_MS ? "pending_propagation" : "fail",
      lastSeenValue: null,
    }
  }

  const lastSeenValue = lookup.values.join("\n") || null
  const matched = lookup.values.some((value) => dnsValueMatches(record, value))
  return { status: matched ? "pass" : "fail", lastSeenValue }
}

/**
 * Domain status after a DNS check. Inactive domains stay inactive.
 * A domain that was verified (or already failed) and has any record not passing is degraded.
 */
export function domainStatusAfterCheck(
  current: Domain["status"],
  recordStatuses: readonly DnsRecord["status"][]
): Domain["status"] {
  if (current === "inactive") {
    return current
  }

  const allPass =
    recordStatuses.length > 0 &&
    recordStatuses.every((status) => status === "pass")
  if (allPass) {
    return "verified"
  }

  if (current === "verified" || current === "failed") {
    return "failed"
  }

  return recordStatuses.some((status) => status === "pass")
    ? "verifying"
    : "pending"
}
