import { StatusBadge } from "@/components/app/status-badge"
import type { DnsRecordItem } from "@/features/domains/api"
import type { DnsCheckState } from "@/lib/domains/dns-rollup"

export function DnsCheckBadge({ state }: { state: DnsCheckState }) {
  switch (state) {
    case "pass":
      return <StatusBadge variant="ok">Pass</StatusBadge>
    case "fail":
      return <StatusBadge variant="err">Fail</StatusBadge>
    case "pending":
      return <StatusBadge variant="warn">Pending</StatusBadge>
  }
}

export function DnsRecordStatusBadge({
  status,
}: {
  status: DnsRecordItem["status"]
}) {
  switch (status) {
    case "pass":
      return <StatusBadge variant="ok">Pass</StatusBadge>
    case "fail":
      return (
        <span className="inline-flex flex-col items-start gap-0.5">
          <StatusBadge variant="err">Fail</StatusBadge>
          <span className="text-caption text-fg-muted">Not found in DNS</span>
        </span>
      )
    case "pending_propagation":
      return <StatusBadge variant="info">Propagating</StatusBadge>
    case "pending":
      return <StatusBadge variant="warn">Pending</StatusBadge>
  }
}
