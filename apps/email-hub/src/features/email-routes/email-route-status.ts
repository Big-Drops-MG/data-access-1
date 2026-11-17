import type { StatusBadgeStatus } from "@/components/app/status-badge"
import type { EmailRouteStatus } from "@/features/email-routes/api"

export function emailRouteStatusLabel(status: EmailRouteStatus): string {
  return status === "inactive" ? "Archived" : "Active"
}

export function emailRouteStatusToBadge(
  status: EmailRouteStatus
): StatusBadgeStatus {
  return status === "inactive" ? "archived" : "active"
}
