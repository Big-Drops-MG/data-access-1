import type { AlertJson } from "@/lib/alerts/serialize"
import { apiJson } from "@/lib/api-client"

export type AlertListItem = AlertJson
export type AlertStatus = AlertJson["status"]
export type AlertSeverity = AlertJson["severity"]

export type AlertListResponse = {
  data: AlertListItem[]
  next_cursor: string | null
}

export type AlertListParams = {
  limit?: number
  cursor?: string
  status?: AlertStatus
  severity?: AlertSeverity
  type?: string
  offer_id?: string
}

function toSearchParams(params: AlertListParams = {}): string {
  const search = new URLSearchParams()
  if (params.limit != null) {
    search.set("limit", String(params.limit))
  }
  if (params.cursor) {
    search.set("cursor", params.cursor)
  }
  if (params.status) {
    search.set("status", params.status)
  }
  if (params.severity) {
    search.set("severity", params.severity)
  }
  if (params.type) {
    search.set("type", params.type)
  }
  if (params.offer_id) {
    search.set("offer_id", params.offer_id)
  }
  const text = search.toString()
  return text ? `?${text}` : ""
}

function jsonInit(method: string): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
  }
}

export function fetchAlertsList(
  params: AlertListParams = {}
): Promise<AlertListResponse> {
  return apiJson<AlertListResponse>(`/api/alerts${toSearchParams(params)}`)
}

export function acknowledgeAlert(id: string): Promise<AlertListItem> {
  return apiJson<AlertListItem>(
    `/api/alerts/${encodeURIComponent(id)}/ack`,
    jsonInit("POST")
  )
}
