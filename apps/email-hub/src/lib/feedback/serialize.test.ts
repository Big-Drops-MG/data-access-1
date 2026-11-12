import { describe, expect, it } from "vitest"

import type { FeedbackItem } from "@workspace/db"

import { serializeFeedback } from "./serialize"

const at = new Date("2026-11-05T12:00:00.000Z")

function row(overrides: Partial<FeedbackItem> = {}): FeedbackItem {
  return {
    id: "019a0000-0000-7000-8000-0000000000aa",
    recipientId: "019a0000-0000-7000-8000-0000000000bb",
    messageId: "019a0000-0000-7000-8000-0000000000cc",
    source: "provider_fbl",
    provider: "ses",
    classificationId: null,
    status: "pending",
    reviewingBy: null,
    lockedAt: null,
    decision: null,
    decidedBy: null,
    decidedAt: null,
    dedupeHash: "abc",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  }
}

describe("serializeFeedback", () => {
  it("serializes snake_case fields and ISO timestamps", () => {
    expect(
      serializeFeedback(row(), {
        email: "ada@example.com",
        classificationKey: "spam",
        classificationLabel: "Spam",
      })
    ).toEqual({
      id: "019a0000-0000-7000-8000-0000000000aa",
      recipient_id: "019a0000-0000-7000-8000-0000000000bb",
      email: "ada@example.com",
      message_id: "019a0000-0000-7000-8000-0000000000cc",
      source: "provider_fbl",
      provider: "ses",
      classification_id: null,
      classification_key: "spam",
      classification_label: "Spam",
      status: "pending",
      reviewing_by: null,
      locked_at: null,
      decision: null,
      decided_by: null,
      decided_at: null,
      created_at: "2026-11-05T12:00:00.000Z",
      updated_at: "2026-11-05T12:00:00.000Z",
    })
  })
})
