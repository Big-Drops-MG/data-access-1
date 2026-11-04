import type { EmailRoute } from "@workspace/db"

function isoUtc(value: Date): string {
  return value.toISOString()
}

export type EmailRouteJson = {
  id: string
  email_type: EmailRoute["emailType"]
  offer_id: string | null
  template_id: string
  sender_id: string
  status: EmailRoute["status"]
  version: number
  created_by: string
  created_at: string
  updated_at: string
}

export function serializeEmailRoute(row: EmailRoute): EmailRouteJson {
  return {
    id: row.id,
    email_type: row.emailType,
    offer_id: row.offerId,
    template_id: row.templateId,
    sender_id: row.senderId,
    status: row.status,
    version: row.version,
    created_by: row.createdBy,
    created_at: isoUtc(row.createdAt),
    updated_at: isoUtc(row.updatedAt),
  }
}

/** Flatten a route into conflict `details` (path/message strings). */
export function emailRouteConflictDetails(
  row: EmailRoute
): { path: string; message: string }[] {
  const json = serializeEmailRoute(row)
  return Object.entries(json).map(([path, value]) => ({
    path,
    message: value === null || value === undefined ? "" : String(value),
  }))
}
