import type { StatusBadgeVariant } from "@/components/app/status-badge"
import type { SuppressionSource } from "@/features/suppression/api"

export type SuppressionSourceTabValue = "all" | SuppressionSource

export const SUPPRESSION_SOURCE_TABS: ReadonlyArray<{
  value: SuppressionSourceTabValue
  label: string
}> = [
  { value: "all", label: "All" },
  { value: "hard_bounce", label: "Hard bounce" },
  { value: "feedback_review", label: "Complaint" },
  { value: "optizmo", label: "Optizmo" },
  { value: "list_unsub", label: "List unsubscribe" },
  { value: "manual", label: "Manual" },
]

export function parseSuppressionSourceTab(
  value: string | undefined
): SuppressionSourceTabValue {
  if (
    value === "hard_bounce" ||
    value === "feedback_review" ||
    value === "optizmo" ||
    value === "list_unsub" ||
    value === "manual"
  ) {
    return value
  }
  return "all"
}

export function suppressionSourceLabel(source: SuppressionSource): string {
  switch (source) {
    case "hard_bounce":
      return "Hard bounce"
    case "feedback_review":
      return "Complaint"
    case "optizmo":
      return "Optizmo"
    case "list_unsub":
      return "List unsubscribe"
    case "manual":
      return "Manual"
    default:
      return source
  }
}

export function suppressionSourceVariant(
  source: SuppressionSource
): StatusBadgeVariant {
  switch (source) {
    case "hard_bounce":
      return "err"
    case "feedback_review":
      return "warn"
    case "optizmo":
      return "info"
    case "list_unsub":
      return "neutral"
    case "manual":
      return "brand"
    default:
      return "neutral"
  }
}

export function canRemoveSuppression(source: SuppressionSource): boolean {
  return source !== "hard_bounce"
}
