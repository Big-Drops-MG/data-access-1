import { apiJson } from "@/lib/api-client"
import type {
  AuditActorOptionJson,
  AuditLogJson,
} from "@/lib/audit-log/serialize"

export type AuditLogListItem = AuditLogJson
export type AuditActorOption = AuditActorOptionJson

export type AuditLogListResponse = {
  data: AuditLogListItem[]
  next_cursor: string | null
}

export type AuditActorsResponse = {
  data: AuditActorOption[]
}

export type AuditLogListParams = {
  limit?: number
  cursor?: string
  actor_type?: AuditLogListItem["actor_type"]
  actor_id?: string
  action?: string
  object_type?: string
  object_id?: string
  from?: string
  to?: string
}

function toSearchParams(params: AuditLogListParams = {}): string {
  const search = new URLSearchParams()
  if (params.limit != null) {
    search.set("limit", String(params.limit))
  }
  if (params.cursor) {
    search.set("cursor", params.cursor)
  }
  if (params.actor_type) {
    search.set("actor_type", params.actor_type)
  }
  if (params.actor_id) {
    search.set("actor_id", params.actor_id)
  }
  if (params.action) {
    search.set("action", params.action)
  }
  if (params.object_type) {
    search.set("object_type", params.object_type)
  }
  if (params.object_id) {
    search.set("object_id", params.object_id)
  }
  if (params.from) {
    search.set("from", params.from)
  }
  if (params.to) {
    search.set("to", params.to)
  }
  const text = search.toString()
  return text ? `?${text}` : ""
}

export function fetchAuditLogList(
  params: AuditLogListParams = {}
): Promise<AuditLogListResponse> {
  return apiJson<AuditLogListResponse>(
    `/api/audit-log${toSearchParams(params)}`
  )
}

export function fetchAuditActors(): Promise<AuditActorsResponse> {
  return apiJson<AuditActorsResponse>("/api/audit-log/actors")
}
