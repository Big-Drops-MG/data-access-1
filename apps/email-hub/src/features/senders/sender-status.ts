import type { StatusBadgeStatus } from "@/components/app/status-badge"
import type { SenderListItem } from "@/features/senders/api"

export function senderStatusToBadge(
  status: SenderListItem["status"]
): StatusBadgeStatus | null {
  switch (status) {
    case "active":
      return "active"
    case "inactive":
      return "disabled"
    case "pending_verification":
      return "pending"
    default:
      return null
  }
}

export function senderStatusLabel(status: SenderListItem["status"]): string {
  switch (status) {
    case "active":
      return "Active"
    case "inactive":
      return "Disabled"
    case "pending_verification":
      return "Pending"
    default:
      return status
  }
}
