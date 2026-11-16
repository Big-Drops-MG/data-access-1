import type { StatusBadgeStatus } from "@/components/app/status-badge"
import type { AlertListItem, AlertSeverity } from "@/features/alerts/api"

export type AlertStatusTabValue = "open" | "resolved" | "all"

export const ALERT_STATUS_TABS = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
] as const satisfies readonly {
  value: AlertStatusTabValue
  label: string
}[]

export function parseAlertStatusTab(
  value: string | undefined
): AlertStatusTabValue {
  if (value === "resolved" || value === "all") {
    return value
  }
  return "open"
}

export function alertStatusToBadge(
  status: AlertListItem["status"]
): StatusBadgeStatus {
  return status === "resolved" ? "completed" : "open"
}

export function alertSeverityVariant(
  severity: AlertSeverity
): "info" | "warn" | "err" {
  if (severity === "critical") {
    return "err"
  }
  if (severity === "warning") {
    return "warn"
  }
  return "info"
}

export function alertSeverityLabel(severity: AlertSeverity): string {
  if (severity === "critical") {
    return "Critical"
  }
  if (severity === "warning") {
    return "Warning"
  }
  return "Info"
}

export function alertTypeLabel(type: string): string {
  return type.replaceAll("_", " ")
}

export function shortAlertId(id: string): string {
  return id.slice(-8)
}

export function isAcknowledged(row: AlertListItem): boolean {
  return row.acknowledged_at != null
}
