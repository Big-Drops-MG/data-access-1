import type { RecipientListItem } from "@/features/recipients/api"
import type { RecipientMessageJson } from "@/lib/recipients/serialize"
import type { StatusBadgeStatus } from "@/components/app/status-badge"

export function shortRecipientId(id: string): string {
  return `rcp_${id.replaceAll("-", "").slice(-6)}`
}

export function recipientStatusLabel(
  status: RecipientListItem["status"]
): string {
  return status === "bounced" ? "Bounced" : "Active"
}

export function recipientTierLabel(tier: RecipientListItem["tier"]): string {
  return tier === "premium" ? "Premium" : "Standard"
}

export function messageStatusLabel(
  status: RecipientMessageJson["status"]
): string {
  switch (status) {
    case "queued":
      return "Queued"
    case "sending":
      return "Sending"
    case "sent":
      return "Sent"
    case "delivered":
      return "Delivered"
    case "bounced":
      return "Bounced"
    case "complained":
      return "Complained"
    case "skipped":
      return "Skipped"
    case "failed":
      return "Failed"
    default:
      return status
  }
}

export function messageStatusBadge(
  status: RecipientMessageJson["status"]
): StatusBadgeStatus | null {
  switch (status) {
    case "queued":
      return "queued"
    case "sending":
      return "dispatching"
    case "sent":
    case "delivered":
      return "sent"
    case "skipped":
      return "skipped"
    case "failed":
    case "bounced":
    case "complained":
      return "failed"
    default:
      return null
  }
}

export function emailTypeLabel(type: string): string {
  return type
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function messageDetail(row: RecipientMessageJson): string {
  if (row.failure_reason) {
    return row.failure_reason
  }
  if (row.skip_reason) {
    return emailTypeLabel(row.skip_reason)
  }
  if (row.status === "delivered" || row.status === "sent") {
    return "OK"
  }
  return "—"
}

export function isValidEmailQuery(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}
