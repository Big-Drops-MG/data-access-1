import { dnsCheckGroup, type DnsCheckGroup } from "@/lib/domains/dns-rollup"
import type { DnsRecordItem, DomainSetupStepItem } from "@/features/domains/api"

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
  const identityDone =
    input.setupSteps.some(
      (step) => step.step === "ses_identity" && step.status === "done"
    ) || progress.total > 0
  const allFound = progress.total > 0 && progress.found === progress.total

  const identityState: SetupStepState = identityDone ? "done" : "in_progress"
  const recordsState: SetupStepState = allFound
    ? "done"
    : identityDone
      ? "in_progress"
      : "pending"
  const verifiedState: SetupStepState = allFound ? "done" : "pending"

  return [
    {
      key: "ses_identity",
      title: "Identity created in SES",
      description: "SES generated the DKIM keys for this domain.",
      state: identityState,
    },
    {
      key: "dns_records",
      title:
        progress.total > 0
          ? `You add ${progress.total} DNS records`
          : "You add the DNS records",
      description:
        recordsState === "pending"
          ? "Add the records below at your DNS provider."
          : dnsProgressLabel(progress),
      state: recordsState,
    },
    {
      key: "verification",
      title: "Records verified",
      description:
        verifiedState === "done"
          ? "Every record resolves. The domain can send."
          : "Checked every 6 hours, or run Check now.",
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
  record: Pick<DnsRecordItem, "purpose" | "name">,
  domainName: string
): string {
  return GROUP_LABELS[dnsCheckGroup(domainName, record)]
}
