import type { StatusBadgeStatus } from "@/components/app/status-badge"
import type { SendCounts, SendListItem, SendStatus } from "@/features/sends/api"

export type SendStatusTabValue =
  | "all"
  | "draft"
  | "scheduled"
  | "queued"
  | "dispatching"
  | "completed"
  | "cancelled"
  | "failed"

export const SEND_STATUS_TABS: ReadonlyArray<{
  value: SendStatusTabValue
  label: string
}> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "queued", label: "Queued" },
  { value: "dispatching", label: "Dispatching" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "failed", label: "Failed" },
]

export function parseSendStatusTab(
  value: string | undefined
): SendStatusTabValue {
  const match = SEND_STATUS_TABS.find((tab) => tab.value === value)
  return match?.value ?? "all"
}

export function sendStatusToBadge(status: SendStatus): StatusBadgeStatus {
  return status
}

export function isSendLive(status: SendStatus): boolean {
  return status === "queued" || status === "dispatching"
}

export function canCancelSend(status: SendStatus): boolean {
  return status === "scheduled" || status === "dispatching"
}

export function shortSendId(id: string): string {
  return id.slice(-8)
}

export function sendOfferLabel(
  send: Pick<SendListItem, "offer_id" | "offer_name" | "offer_external_ref">
): string {
  if (!send.offer_id) {
    return "All"
  }
  return send.offer_name ?? send.offer_external_ref ?? "Offer"
}

export function sentTotal(counts: SendCounts): number {
  return counts.sent + counts.delivered
}

export function sendProgressPercent(counts: SendCounts): number {
  if (counts.total <= 0) {
    return 0
  }
  return Math.min(100, Math.round((counts.processed / counts.total) * 100))
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US")
}

export function sendProgressLabel(
  send: Pick<SendListItem, "status" | "counts" | "dispatch_started_at">
): string {
  const { counts } = send
  switch (send.status) {
    case "queued":
    case "dispatching":
      return `${formatCount(counts.processed)} of ${formatCount(counts.total)}`
    case "completed":
      return `${formatCount(sentTotal(counts))} sent · ${formatCount(counts.skipped)} skipped`
    case "failed":
      return counts.total > 0
        ? `${formatCount(counts.processed)} of ${formatCount(counts.total)} before fail`
        : "Failed before start"
    case "cancelled":
      return send.dispatch_started_at
        ? `${formatCount(counts.processed)} of ${formatCount(counts.total)} before cancel`
        : "Cancelled before start"
    default:
      return "—"
  }
}
