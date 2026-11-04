import { formatEtDateTime } from "@workspace/shared"

import type { DnsRecordItem, DomainSetupStepItem } from "@/features/domains/api"
import { dnsCheckGroup, type DnsCheckGroup } from "@/lib/domains/dns-rollup"

export type DnsProgress = {
  total: number
  found: number
  propagating: number
  missing: number
}

export type SetupStepState = "done" | "in_progress" | "pending"

export type SetupStepView = {
  key: DomainSetupStepItem["step"]
  title: string
  description: string
  state: SetupStepState
}

/** `dom_` plus the last four hex characters of the UUID. */
export function shortDomainId(id: string): string {
  return `dom_${id.replace(/-/g, "").slice(-4)}`
}

export function summarizeDnsProgress(
  records: readonly Pick<DnsRecordItem, "status">[]
): DnsProgress {
  const progress: DnsProgress = {
    total: records.length,
    found: 0,
    propagating: 0,
    missing: 0,
  }
  for (const record of records) {
    if (record.status === "pass") {
      progress.found += 1
    } else if (record.status === "fail") {
      progress.missing += 1
    } else {
      progress.propagating += 1
    }
  }
  return progress
}

export function dnsProgressLabel(progress: DnsProgress): string {
  if (progress.total === 0) {
    return "No DNS records yet"
  }
  const parts = [`${progress.found} of ${progress.total} found`]
  if (progress.propagating > 0) {
    parts.push(`${progress.propagating} still propagating`)
  }
  if (progress.missing > 0) {
    parts.push(`${progress.missing} missing`)
  }
  return parts.join(" · ")
}

export function buildSetupStepViews(input: {
  status: string
  setupSteps: readonly DomainSetupStepItem[]
  dnsRecords: readonly DnsRecordItem[]
}): SetupStepView[] {
  const progress = summarizeDnsProgress(input.dnsRecords)
  const identityStep = input.setupSteps.find(
    (step) => step.step === "ses_identity"
  )
  const identityDone = identityStep?.status === "done" || progress.total > 0
  const allFound = progress.total > 0 && progress.found === progress.total

  const identityState: SetupStepState = identityDone ? "done" : "in_progress"
  const recordsState: SetupStepState = allFound
    ? "done"
    : identityDone
      ? "in_progress"
      : "pending"
  const verifiedState: SetupStepState = allFound ? "done" : "pending"

  let identityDescription = "SES is creating the identity and DKIM keys."
  if (identityDone) {
    const completedAt = identityStep?.completed_at
    identityDescription = completedAt
      ? formatEtDateTime(new Date(completedAt))
      : "Identity ready in SES."
  }

  return [
    {
      key: "ses_identity",
      title: "SES identity created",
      description: identityDescription,
      state: identityState,
    },
    {
      key: "dns_records",
      title: "DNS records added in Cloudflare",
      description:
        recordsState === "pending"
          ? "Waiting for Cloudflare DNS to publish."
          : dnsProgressLabel(progress),
      state: recordsState,
    },
    {
      key: "verification",
      title: "Verification passed",
      description:
        verifiedState === "done"
          ? "Every record resolves. The domain can send."
          : "Domain becomes active when every record passes",
      state: verifiedState,
    },
  ]
}

/** Tab-separated `TYPE NAME VALUE` lines for pasting into a DNS provider. */
export function formatDnsRecordsForCopy(
  records: readonly Pick<
    DnsRecordItem,
    "record_type" | "name" | "expected_value"
  >[]
): string {
  return records
    .map(
      (record) =>
        `${record.record_type}\t${record.name}\t${record.expected_value}`
    )
    .join("\n")
}

const GROUP_LABELS: Record<DnsCheckGroup, string> = {
  spf: "SPF",
  dkim: "DKIM",
  dmarc: "DMARC",
  mail_from: "MAIL FROM",
}

export function dnsPurposeLabel(
  record: Pick<DnsRecordItem, "purpose" | "name" | "record_type">,
  domainName: string,
  records: readonly Pick<
    DnsRecordItem,
    "purpose" | "name" | "record_type"
  >[] = []
): string {
  const group = dnsCheckGroup(domainName, record)
  if (group === "dkim") {
    const dkimRecords = records.filter(
      (row) => dnsCheckGroup(domainName, row) === "dkim"
    )
    const index = dkimRecords.findIndex(
      (row) =>
        row.name === record.name && row.record_type === record.record_type
    )
    return index >= 0 ? `DKIM ${index + 1}` : "DKIM"
  }
  if (group === "mail_from") {
    return record.record_type.toUpperCase() === "MX"
      ? "MAIL FROM"
      : "MAIL FROM SPF"
  }
  return GROUP_LABELS[group]
}
