import type { FeedbackItem } from "@workspace/db"

function isoUtc(value: Date): string {
  return value.toISOString()
}

export type FeedbackJson = {
  id: string
  recipient_id: string | null
  email: string | null
  message_id: string | null
  source: FeedbackItem["source"]
  provider: string | null
  classification_id: string | null
  classification_key: string | null
  classification_label: string | null
  status: FeedbackItem["status"]
  reviewing_by: string | null
  locked_at: string | null
  decision: FeedbackItem["decision"] | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

export type FeedbackDisplayFields = {
  email?: string | null
  classificationKey?: string | null
  classificationLabel?: string | null
}

export function serializeFeedback(
  row: FeedbackItem,
  display: FeedbackDisplayFields = {}
): FeedbackJson {
  return {
    id: row.id,
    recipient_id: row.recipientId,
    email: display.email ?? null,
    message_id: row.messageId,
    source: row.source,
    provider: row.provider,
    classification_id: row.classificationId,
    classification_key: display.classificationKey ?? null,
    classification_label: display.classificationLabel ?? null,
    status: row.status,
    reviewing_by: row.reviewingBy,
    locked_at: row.lockedAt ? isoUtc(row.lockedAt) : null,
    decision: row.decision,
    decided_by: row.decidedBy,
    decided_at: row.decidedAt ? isoUtc(row.decidedAt) : null,
    created_at: isoUtc(row.createdAt),
    updated_at: isoUtc(row.updatedAt),
  }
}
