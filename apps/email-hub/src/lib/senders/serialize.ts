import type { Sender } from "@workspace/db"

function isoUtc(value: Date): string {
  return value.toISOString()
}

export type SenderJson = {
  id: string
  domain_id: string
  from_name: string
  from_email: string
  reply_to: string | null
  status: Sender["status"]
  version: number
  active_route_count: number
  created_by: string | null
  created_at: string
  updated_at: string
  deactivated_at: string | null
}

export function serializeSender(
  row: Sender,
  extras: { activeRouteCount?: number } = {}
): SenderJson {
  return {
    id: row.id,
    domain_id: row.domainId,
    from_name: row.fromName,
    from_email: row.fromEmail,
    reply_to: row.replyTo,
    status: row.status,
    version: row.version,
    active_route_count: extras.activeRouteCount ?? 0,
    created_by: row.createdBy,
    created_at: isoUtc(row.createdAt),
    updated_at: isoUtc(row.updatedAt),
    deactivated_at: row.deactivatedAt ? isoUtc(row.deactivatedAt) : null,
  }
}

/** Flatten a sender resource into conflict `details` (path/message strings). */
export function senderConflictDetails(
  row: Sender
): { path: string; message: string }[] {
  const json = serializeSender(row)
  return Object.entries(json).map(([path, value]) => ({
    path,
    message: value === null || value === undefined ? "" : String(value),
  }))
}
