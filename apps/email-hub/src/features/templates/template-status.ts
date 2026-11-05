import type { StatusBadgeStatus } from "@/components/app/status-badge"
import type { TemplateListItem } from "@/features/templates/api"

export function templatePublishLabel(
  template: Pick<TemplateListItem, "status" | "current_version_id">
): string {
  if (template.status === "archived") {
    return "Archived"
  }
  if (template.current_version_id) {
    return "Published"
  }
  return "Draft"
}

export function templateStatusToBadge(
  template: Pick<TemplateListItem, "status" | "current_version_id">
): StatusBadgeStatus {
  if (template.status === "archived") {
    return "archived"
  }
  if (template.current_version_id) {
    return "active"
  }
  return "draft"
}
