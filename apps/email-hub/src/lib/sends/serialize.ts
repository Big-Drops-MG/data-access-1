import type { Send } from "@workspace/db"

function isoUtc(value: Date): string {
  return value.toISOString()
}

export type SendCountsJson = {
  total: number
  processed: number
  delivered: number
  sent: number
  queued: number
  soft_bounce: number
  hard_bounce: number
  skipped: number
  skipped_suppressed: number
  skipped_opted_out: number
  skipped_frequency_cap: number
}

export type SendActivityJson = {
  at: string
  label: string
  detail: string | null
}

export type SendJson = {
  id: string
  name: string
  email_type: Send["emailType"]
  template_version_id: string
  template_name: string | null
  template_version_no: number | null
  sender_id: string
  sender_from_name: string | null
  sender_from_email: string | null
  category_id: string
  category_name: string | null
  offer_id: string | null
  offer_name: string | null
  offer_external_ref: string | null
  scheduled_for: string
  status: Send["status"]
  dispatch_started_at: string | null
  completed_at: string | null
  version: number
  created_by: string
  created_at: string
  updated_at: string
  counts: SendCountsJson
  activity: SendActivityJson[]
}

export type SendDisplayFields = {
  templateName?: string | null
  templateVersionNo?: number | null
  senderFromName?: string | null
  senderFromEmail?: string | null
  categoryName?: string | null
  offerName?: string | null
  offerExternalRef?: string | null
  counts?: SendCountsJson
  activity?: SendActivityJson[]
}

export const EMPTY_SEND_COUNTS: SendCountsJson = {
  total: 0,
  processed: 0,
  delivered: 0,
  sent: 0,
  queued: 0,
  soft_bounce: 0,
  hard_bounce: 0,
  skipped: 0,
  skipped_suppressed: 0,
  skipped_opted_out: 0,
  skipped_frequency_cap: 0,
}

export function serializeSend(
  row: Send,
  display: SendDisplayFields = {}
): SendJson {
  return {
    id: row.id,
    name: row.name,
    email_type: row.emailType,
    template_version_id: row.templateVersionId,
    template_name: display.templateName ?? null,
    template_version_no: display.templateVersionNo ?? null,
    sender_id: row.senderId,
    sender_from_name: display.senderFromName ?? null,
    sender_from_email: display.senderFromEmail ?? null,
    category_id: row.categoryId,
    category_name: display.categoryName ?? null,
    offer_id: row.offerId,
    offer_name: display.offerName ?? null,
    offer_external_ref: display.offerExternalRef ?? null,
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
    counts: display.counts ?? EMPTY_SEND_COUNTS,
    activity: display.activity ?? [],
  }
}

export function sendConflictDetails(
  row: Send
): { path: string; message: string }[] {
  const json = serializeSend(row)
  return Object.entries(json).map(([path, value]) => ({
    path,
    message:
      value === null || value === undefined
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value),
  }))
}
