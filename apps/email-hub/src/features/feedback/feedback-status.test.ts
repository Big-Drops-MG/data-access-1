import { describe, expect, it } from "vitest"

import type { FeedbackListItem } from "@/features/feedback/api"
import {
  FEEDBACK_STALE_MS,
  feedbackDecisionLabel,
  feedbackSourceLabel,
  feedbackTypeLabel,
  formatWaiting,
  isStalePending,
  parseFeedbackStatusTab,
  shortFeedbackId,
  waitingMs,
} from "@/features/feedback/feedback-status"

function item(overrides: Partial<FeedbackListItem> = {}): FeedbackListItem {
  return {
    id: "019a0000-0000-7000-8000-0000000000aa",
    recipient_id: null,
    email: "a@example.com",
    message_id: null,
    source: "provider_fbl",
    provider: "Yahoo Sender Hub",
    classification_id: null,
    classification_key: null,
    classification_label: null,
    status: "pending",
    reviewing_by: null,
    locked_at: null,
    decision: null,
    decided_by: null,
    decided_at: null,
    created_at: "2026-11-10T12:00:00.000Z",
    updated_at: "2026-11-10T12:00:00.000Z",
    ...overrides,
  }
}

describe("feedback-status helpers", () => {
  it("parses status tabs and short ids", () => {
    expect(parseFeedbackStatusTab(undefined)).toBe("pending")
    expect(parseFeedbackStatusTab("resolved")).toBe("resolved")
    expect(parseFeedbackStatusTab("nope")).toBe("pending")
    expect(shortFeedbackId("019a0000-0000-7000-8000-0000000000aa")).toBe(
      "FB-00AA"
    )
  })

  it("labels source, type, and decision", () => {
    expect(feedbackSourceLabel(item())).toBe("Yahoo Sender Hub")
    expect(
      feedbackSourceLabel(item({ provider: null, source: "feedback_form" }))
    ).toBe("Feedback form")
    expect(feedbackTypeLabel(item())).toBe("Complaint")
    expect(feedbackTypeLabel(item({ source: "feedback_form" }))).toBe(
      "Form response"
    )
    expect(feedbackDecisionLabel("suppress")).toBe("Suppressed")
    expect(feedbackDecisionLabel("no_action")).toBe("No action")
    expect(feedbackDecisionLabel(null)).toBe("—")
  })

  it("formats waiting and detects stale pending", () => {
    const now = new Date("2026-11-12T14:00:00.000Z")
    const created = new Date("2026-11-10T12:00:00.000Z")
    const ms = waitingMs(item({ created_at: created.toISOString() }), now)
    expect(ms).toBe(now.getTime() - created.getTime())
    expect(formatWaiting(ms)).toBe("2 d")
    expect(formatWaiting(90 * 60 * 1000)).toBe("1 h")
    expect(
      isStalePending(
        item({
          created_at: new Date(now.getTime() - FEEDBACK_STALE_MS).toISOString(),
        }),
        now
      )
    ).toBe(true)
    expect(
      isStalePending(
        item({ status: "in_review", created_at: created.toISOString() }),
        now
      )
    ).toBe(false)
  })
})
