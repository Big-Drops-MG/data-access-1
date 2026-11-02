import type {
  DnsRecordItem,
  DomainDetailResponse,
  DomainListItem,
  DomainSenderItem,
  DomainSendersResponse,
  DomainSetupStepItem,
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
    mail_from_domain: `mail.${input.name}`,
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
    sender_count: 6,
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

function mockDnsRecord(
  domain: DomainListItem,
  input: {
    id: string
    purpose: DnsRecordItem["purpose"]
    name: string
    record_type: string
    expected_value: string
    status: DnsRecordItem["status"]
  }
): DnsRecordItem {
  return {
    id: input.id,
    domain_id: domain.id,
    purpose: input.purpose,
    name: input.name,
    record_type: input.record_type,
    expected_value: input.expected_value,
    last_seen_value: input.status === "pass" ? input.expected_value : null,
    status: input.status,
    last_checked_at: domain.last_checked_at,
    created_at: domain.created_at,
    updated_at: domain.updated_at,
  }
}

function dnsStatusForGroup(
  domain: DomainListItem,
  group: keyof DomainListItem["dns_summary"]
): DnsRecordItem["status"] {
  const state = domain.dns_summary[group]
  if (state === "pass") return "pass"
  if (state === "fail") return "fail"
  return "pending"
}

function mockDnsRecords(domain: DomainListItem): DnsRecordItem[] {
  const mailFrom = domain.mail_from_domain ?? `mail.${domain.name}`
  const dkimStatus = dnsStatusForGroup(domain, "dkim")
  const spfStatus = dnsStatusForGroup(domain, "spf")
  const dmarcStatus = dnsStatusForGroup(domain, "dmarc")
  const mailFromStatus = dnsStatusForGroup(domain, "mail_from")

  return [
    mockDnsRecord(domain, {
      id: `${domain.id}-dkim-1`,
      purpose: "dkim",
      name: `abc123._domainkey.${domain.name}`,
      record_type: "CNAME",
      expected_value: `abc123.dkim.amazonses.com`,
      status: dkimStatus,
    }),
    mockDnsRecord(domain, {
      id: `${domain.id}-dkim-2`,
      purpose: "dkim",
      name: `def456._domainkey.${domain.name}`,
      record_type: "CNAME",
      expected_value: `def456.dkim.amazonses.com`,
      status: dkimStatus,
    }),
    mockDnsRecord(domain, {
      id: `${domain.id}-dkim-3`,
      purpose: "dkim",
      name: `ghi789._domainkey.${domain.name}`,
      record_type: "CNAME",
      expected_value: `ghi789.dkim.amazonses.com`,
      status: dkimStatus,
    }),
    mockDnsRecord(domain, {
      id: `${domain.id}-spf`,
      purpose: "spf",
      name: domain.name,
      record_type: "TXT",
      expected_value: "v=spf1 include:amazonses.com ~all",
      status: spfStatus,
    }),
    mockDnsRecord(domain, {
      id: `${domain.id}-dmarc`,
      purpose: "dmarc",
      name: `_dmarc.${domain.name}`,
      record_type: "TXT",
      expected_value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain.name}`,
      status: dmarcStatus,
    }),
    mockDnsRecord(domain, {
      id: `${domain.id}-mf-mx`,
      purpose: "mx",
      name: mailFrom,
      record_type: "MX",
      expected_value: "10 feedback-smtp.us-east-1.amazonses.com",
      status: mailFromStatus,
    }),
    mockDnsRecord(domain, {
      id: `${domain.id}-mf-spf`,
      purpose: "spf",
      name: mailFrom,
      record_type: "TXT",
      expected_value: "v=spf1 include:amazonses.com ~all",
      status: mailFromStatus === "fail" ? "pass" : mailFromStatus,
    }),
  ]
}

function mockSetupSteps(domain: DomainListItem): DomainSetupStepItem[] {
  return [
    {
      id: `${domain.id}-step-ses`,
      domain_id: domain.id,
      step: "ses_identity",
      status: "done",
      error: null,
      started_at: domain.created_at,
      completed_at: domain.created_at,
      updated_at: domain.updated_at,
    },
    {
      id: `${domain.id}-step-dns`,
      domain_id: domain.id,
      step: "dns_records",
      status: domain.status === "verified" ? "done" : "pending",
      error: null,
      started_at: domain.created_at,
      completed_at: domain.status === "verified" ? domain.verified_at : null,
      updated_at: domain.updated_at,
    },
    {
      id: `${domain.id}-step-verify`,
      domain_id: domain.id,
      step: "verification",
      status: domain.status === "verified" ? "done" : "pending",
      error: null,
      started_at: null,
      completed_at: domain.status === "verified" ? domain.verified_at : null,
      updated_at: domain.updated_at,
    },
  ]
}

/** Local UI mock for Domains list/detail styling. Set false to use the live API. */
export const USE_MOCK_DOMAINS = true

export async function getMockDomainsList(params: {
  limit?: number
  cursor?: string
  status?: string
}): Promise<DomainsListResponse> {
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

export async function getMockDomainDetail(
  id: string
): Promise<DomainDetailResponse> {
  await new Promise((resolve) => setTimeout(resolve, 80))
  const domain = MOCK_DOMAINS.find((row) => row.id === id)
  if (!domain) {
    throw Object.assign(new Error("Not found"), {
      status: 404,
      message: "Not found",
    })
  }
  return {
    ...domain,
    dns_records: mockDnsRecords(domain),
    setup_steps: mockSetupSteps(domain),
  }
}

const SENDER_NAMES = [
  "Alerts",
  "No Reply",
  "Support",
  "Billing",
  "Product",
  "Security",
  "News",
] as const

const SENDER_LOCALS = [
  "alerts",
  "noreply",
  "support",
  "billing",
  "hello",
  "security",
  "news",
] as const

export async function getMockDomainSenders(
  domainId: string
): Promise<DomainSendersResponse> {
  await new Promise((resolve) => setTimeout(resolve, 60))
  const domain = MOCK_DOMAINS.find((row) => row.id === domainId)
  if (!domain) {
    return { data: [], next_cursor: null }
  }

  const count = domain.sender_count
  const data: DomainSenderItem[] = Array.from({ length: count }, (_, index) => {
    const local = SENDER_LOCALS[index % SENDER_LOCALS.length] ?? "noreply"
    const name = SENDER_NAMES[index % SENDER_NAMES.length] ?? "Sender"
    return {
      id: `${domain.id}-sender-${index + 1}`,
      from_name: name,
      from_email: `${local}@${domain.name}`,
      status:
        index === count - 1 && count > 4 ? "pending_verification" : "active",
    }
  })

  return { data, next_cursor: null }
}
