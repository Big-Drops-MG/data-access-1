import type { Send } from "@workspace/db"

function isoUtc(value: Date): string {
  return value.toISOString()
}

export type SendJson = {
  id: string
  email_type: Send["emailType"]
  template_version_id: string
  sender_id: string
  category_id: string
  offer_id: string | null
  scheduled_for: string
  status: Send["status"]
  dispatch_started_at: string | null
  completed_at: string | null
  version: number
  created_by: string
  created_at: string
  updated_at: string
}

export function serializeSend(row: Send): SendJson {
  return {
    id: row.id,
    email_type: row.emailType,
    template_version_id: row.templateVersionId,
    sender_id: row.senderId,
    category_id: row.categoryId,
    offer_id: row.offerId,
    scheduled_for: isoUtc(row.scheduledFor),
    status: row.status,
    dispatch_started_at: row.dispatchStartedAt
      ? isoUtc(row.dispatchStartedAt)
      : null,
    completed_at: row.completedAt ? isoUtc(row.completedAt) : null,
    version: row.version,
    created_by: row.createdBy,
    created_at: isoUtc(row.createdAt),
    updated_at: isoUtc(row.updatedAt),
  }
}

export function sendConflictDetails(
  row: Send
): { path: string; message: string }[] {
  const json = serializeSend(row)
  return Object.entries(json).map(([path, value]) => ({
    path,
    message: value === null || value === undefined ? "" : String(value),
  }))
}
