import type { StatusBadgeStatus } from "@/components/app/status-badge"
import type {
  FeedbackDecisionValue,
  FeedbackListItem,
  FeedbackStatus,
} from "@/features/feedback/api"

/** Mirrors server CLAIM_LOCK_MS (SD#9.8). */
export const CLAIM_LOCK_MS = 30 * 60 * 1000

export type FeedbackStatusTabValue =
  "all" | "pending" | "in_review" | "resolved"

export const FEEDBACK_STATUS_TABS: ReadonlyArray<{
  value: FeedbackStatusTabValue
  label: string
}> = [
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In review" },
  { value: "resolved", label: "Decided" },
  { value: "all", label: "All" },
]

export const FEEDBACK_STALE_MS = 48 * 60 * 60 * 1000

export function parseFeedbackStatusTab(
  value: string | undefined
): FeedbackStatusTabValue {
  const match = FEEDBACK_STATUS_TABS.find((tab) => tab.value === value)
  return match?.value ?? "pending"
}

export function feedbackStatusToBadge(
  status: FeedbackStatus
): StatusBadgeStatus {
  if (status === "resolved") {
    return "decided"
  }
  return status
}

export function shortFeedbackId(id: string): string {
  return `FB-${id.slice(-4).toUpperCase()}`
}

export function feedbackSourceLabel(item: FeedbackListItem): string {
  if (item.provider) {
    return item.provider
  }
  switch (item.source) {
    case "provider_fbl":
      return "Provider FBL"
    case "feedback_form":
      return "Feedback form"
    case "mailbox_report":
      return "Mailbox report"
    default:
      return item.source
  }
}

export function feedbackTypeLabel(item: FeedbackListItem): string {
  return item.source === "feedback_form" ? "Form response" : "Complaint"
}

export function feedbackDecisionLabel(
  decision: FeedbackDecisionValue | null
): string {
  switch (decision) {
    case "suppress":
      return "Suppressed"
    case "no_action":
      return "No action"
    case "escalate":
      return "Escalated"
    default:
      return "—"
  }
}

export function waitingMs(
  item: Pick<FeedbackListItem, "created_at">,
  now: Date = new Date()
): number {
  return Math.max(0, now.getTime() - new Date(item.created_at).getTime())
}

export function formatWaiting(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000))
  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(ms / (60 * 1000)))
    return `${minutes} m`
  }
  if (hours < 48) {
    return `${hours} h`
  }
  const days = Math.floor(hours / 24)
  return `${days} d`
}

export function isStalePending(
  item: FeedbackListItem,
  now: Date = new Date()
): boolean {
  return item.status === "pending" && waitingMs(item, now) >= FEEDBACK_STALE_MS
}

export function claimExpiresInMs(
  item: Pick<FeedbackListItem, "locked_at">,
  now: Date = new Date()
): number | null {
  if (!item.locked_at) {
    return null
  }
  const expiresAt = new Date(item.locked_at).getTime() + CLAIM_LOCK_MS
  return Math.max(0, expiresAt - now.getTime())
}

export function formatClaimRemaining(ms: number): string {
  const totalMinutes = Math.ceil(ms / (60 * 1000))
  if (totalMinutes <= 1) {
    return "1 min"
  }
  return `${totalMinutes} min`
}

export function isClaimedByCurrentUser(
  item: FeedbackListItem,
  userId: string | null | undefined
): boolean {
  return Boolean(userId && item.reviewing_by === userId)
}
