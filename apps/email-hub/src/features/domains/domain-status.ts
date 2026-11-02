import type { StatusBadgeStatus } from "@/components/app/status-badge"

/** Map domain API statuses onto SD#12.9 badge catalog values. */
export function domainStatusToBadge(
  status: string
): StatusBadgeStatus | undefined {
  switch (status) {
    case "pending":
    case "verifying":
      return "pending"
    case "verified":
      return "active"
    case "failed":
      return "failed"
    case "inactive":
      return "disabled"
    default:
      return undefined
  }
}
