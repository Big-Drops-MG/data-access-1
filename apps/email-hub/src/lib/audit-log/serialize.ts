import type { AuditLog } from "@workspace/db"

function isoUtc(value: Date): string {
  return value.toISOString()
}

export type AuditLogJson = {
  id: string
  actor_type: AuditLog["actorType"]
  actor_id: string | null
  action: string
  object_type: string
  object_id: string | null
  before: unknown
  after: unknown
  request_id: string | null
  created_at: string
}

export function serializeAuditLog(row: AuditLog): AuditLogJson {
  return {
    id: row.id,
    actor_type: row.actorType,
    actor_id: row.actorId,
    action: row.action,
    object_type: row.entityType,
    object_id: row.entityId,
    before: row.before ?? null,
    after: row.after ?? null,
    request_id: row.requestId,
    created_at: isoUtc(row.createdAt),
  }
}
