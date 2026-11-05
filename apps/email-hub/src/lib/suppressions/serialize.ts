import type { SuppressionEntry } from "@workspace/db"

function isoUtc(value: Date): string {
  return value.toISOString()
}

export type SuppressionJson = {
  id: string
  email: string | null
  recipient_id: string | null
  scope: SuppressionEntry["scope"]
  offer_id: string | null
  source: SuppressionEntry["source"]
  reason: string | null
  added_by: string | null
  created_at: string
  removed_at: string | null
}

export type AddSuppressionJson = SuppressionJson & {
  created: boolean
}

export function serializeSuppression(
  row: SuppressionEntry,
  email: string | null
): SuppressionJson {
  return {
    id: row.id,
    email,
    recipient_id: row.recipientId,
    scope: row.scope,
    offer_id: row.offerId,
    source: row.source,
    reason: row.reason,
    added_by: row.addedBy,
    created_at: isoUtc(row.createdAt),
    removed_at: row.removedAt ? isoUtc(row.removedAt) : null,
  }
}
