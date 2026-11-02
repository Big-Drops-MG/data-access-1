import type {
  DomainListItem,
  DomainsListResponse,
} from "@/features/domains/api"

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

function mockDomain(
  input: Pick<DomainListItem, "id" | "name" | "status" | "sender_count"> & {
    dns?: Partial<DomainListItem["dns_summary"]>
    lastCheckedHoursAgo?: number | null
  }
): DomainListItem {
  const now = hoursAgo(0)
  return {
    id: input.id,
    name: input.name,
    ses_identity_arn: `arn:aws:ses:us-east-1:123456789012:identity/${input.name}`,
    status: input.status,
    created_by: null,
    created_at: hoursAgo(72),
    updated_at: now,
    verified_at: input.status === "verified" ? hoursAgo(48) : null,
    ses_region: "us-east-1",
    mail_from_domain: `bounce.${input.name}`,
    sender_count: input.sender_count,
    last_checked_at:
      input.lastCheckedHoursAgo == null
        ? null
        : hoursAgo(input.lastCheckedHoursAgo),
    dns_summary: {
      spf: input.dns?.spf ?? "pending",
      dkim: input.dns?.dkim ?? "pending",
      dmarc: input.dns?.dmarc ?? "pending",
      mail_from: input.dns?.mail_from ?? "pending",
    },
  }
}

const MOCK_DOMAINS: DomainListItem[] = [
  mockDomain({
    id: "019a0000-0000-7000-8000-000000000101",
    name: "mail.northstar.io",
    status: "verified",
    sender_count: 4,
    lastCheckedHoursAgo: 2,
    dns: { spf: "pass", dkim: "pass", dmarc: "pass", mail_from: "pass" },
  }),
  mockDomain({
    id: "019a0000-0000-7000-8000-000000000102",
    name: "send.acme.co",
    status: "verified",
    sender_count: 2,
    lastCheckedHoursAgo: 5,
    dns: { spf: "pass", dkim: "pass", dmarc: "pass", mail_from: "pass" },
  }),
  mockDomain({
    id: "019a0000-0000-7000-8000-000000000103",
    name: "alerts.brightpath.com",
    status: "pending",
    sender_count: 0,
    lastCheckedHoursAgo: 1,
    dns: {
      spf: "pending",
      dkim: "pending",
      dmarc: "pending",
      mail_from: "pending",
    },
  }),
  mockDomain({
    id: "019a0000-0000-7000-8000-000000000104",
    name: "notify.lumen.app",
    status: "verifying",
    sender_count: 1,
    lastCheckedHoursAgo: 0.5,
    dns: {
      spf: "pass",
      dkim: "pending",
      dmarc: "pending",
      mail_from: "pass",
    },
  }),
  mockDomain({
    id: "019a0000-0000-7000-8000-000000000105",
    name: "outbound.harbor.dev",
    status: "failed",
    sender_count: 3,
    lastCheckedHoursAgo: 3,
    dns: { spf: "pass", dkim: "fail", dmarc: "fail", mail_from: "pass" },
  }),
  mockDomain({
    id: "019a0000-0000-7000-8000-000000000106",
    name: "mail.oldbrand.net",
    status: "inactive",
    sender_count: 0,
    lastCheckedHoursAgo: 120,
    dns: { spf: "pass", dkim: "pass", dmarc: "pass", mail_from: "fail" },
  }),
  mockDomain({
    id: "019a0000-0000-7000-8000-000000000107",
    name: "transactional.rivet.so",
    status: "verified",
    sender_count: 7,
    lastCheckedHoursAgo: 8,
    dns: { spf: "pass", dkim: "pass", dmarc: "pass", mail_from: "pass" },
  }),
  mockDomain({
    id: "019a0000-0000-7000-8000-000000000108",
    name: "crm.pixelwave.io",
    status: "failed",
    sender_count: 1,
    lastCheckedHoursAgo: 6,
    dns: {
      spf: "fail",
      dkim: "pass",
      dmarc: "pending",
      mail_from: "pending",
    },
  }),
]

/** Local UI mock for Domains list styling. Set false to use the live API. */
export const USE_MOCK_DOMAINS = true

export async function getMockDomainsList(params: {
  limit?: number
  cursor?: string
  status?: string
}): Promise<DomainsListResponse> {
  // Brief delay so keepPreviousData + row motion are visible while filtering.
  await new Promise((resolve) => setTimeout(resolve, 120))

  const filtered = params.status
    ? MOCK_DOMAINS.filter((row) => row.status === params.status)
    : MOCK_DOMAINS

  const status_counts = {
    all: MOCK_DOMAINS.length,
    pending: MOCK_DOMAINS.filter((row) => row.status === "pending").length,
    verifying: MOCK_DOMAINS.filter((row) => row.status === "verifying").length,
    verified: MOCK_DOMAINS.filter((row) => row.status === "verified").length,
    failed: MOCK_DOMAINS.filter((row) => row.status === "failed").length,
    inactive: MOCK_DOMAINS.filter((row) => row.status === "inactive").length,
  }

  const limit = params.limit ?? 50
  const start = params.cursor
    ? filtered.findIndex((row) => row.id === params.cursor) + 1
    : 0
  const page = filtered.slice(Math.max(0, start), Math.max(0, start) + limit)
  const next = filtered[Math.max(0, start) + limit]

  return {
    data: page,
    next_cursor: next?.id ?? null,
    status_counts,
  }
}
