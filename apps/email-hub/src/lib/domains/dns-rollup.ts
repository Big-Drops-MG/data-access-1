export type DnsCheckState = "pass" | "fail" | "pending"

export type DnsCheckGroup = "spf" | "dkim" | "dmarc" | "mail_from"

export type DnsSummary = Record<DnsCheckGroup, DnsCheckState>

export type DnsRollupRecord = {
  purpose: "spf" | "dkim" | "dmarc" | "mx"
  name: string
  status: "pending" | "pass" | "fail" | "pending_propagation"
}

const GROUPS: readonly DnsCheckGroup[] = ["spf", "dkim", "dmarc", "mail_from"]

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "")
}

/** SPF on the sending domain is "SPF"; SPF and MX on the MAIL FROM host are "MAIL FROM". */
export function dnsCheckGroup(
  domainName: string,
  record: Pick<DnsRollupRecord, "purpose" | "name">
): DnsCheckGroup {
  switch (record.purpose) {
    case "dkim":
      return "dkim"
    case "dmarc":
      return "dmarc"
    case "mx":
      return "mail_from"
    case "spf":
      return normalizeHost(record.name) === normalizeHost(domainName)
        ? "spf"
        : "mail_from"
  }
}

function rollup(statuses: DnsRollupRecord["status"][]): DnsCheckState {
  if (statuses.length === 0) {
    return "pending"
  }
  if (statuses.includes("fail")) {
    return "fail"
  }
  if (statuses.every((status) => status === "pass")) {
    return "pass"
  }
  return "pending"
}

export function summarizeDnsRecords(
  domainName: string,
  records: readonly DnsRollupRecord[]
): DnsSummary {
  const byGroup: Record<DnsCheckGroup, DnsRollupRecord["status"][]> = {
    spf: [],
    dkim: [],
    dmarc: [],
    mail_from: [],
  }
  for (const record of records) {
    byGroup[dnsCheckGroup(domainName, record)].push(record.status)
  }

  return Object.fromEntries(
    GROUPS.map((group) => [group, rollup(byGroup[group])])
  ) as DnsSummary
}

/** The custom MAIL FROM host is the name of the MX record SES asked for. */
export function mailFromDomainFromRecords(
  records: readonly Pick<DnsRollupRecord, "purpose" | "name">[]
): string | null {
  return records.find((record) => record.purpose === "mx")?.name ?? null
}
