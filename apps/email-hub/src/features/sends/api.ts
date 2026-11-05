import { apiJson, isApiError } from "@/lib/api-client"
import type { OfferJson } from "@/lib/offers/serialize"
import type { SendJson } from "@/lib/sends/serialize"
import type { SenderJson } from "@/lib/senders/serialize"
import type { TemplateJson } from "@/lib/templates/serialize"

export type SendListItem = SendJson
export type SendStatus = SendJson["status"]
export type SendCounts = SendJson["counts"]
export type SendActivity = SendJson["activity"][number]
export type OfferOption = OfferJson

export type SendsListResponse = {
  data: SendListItem[]
  next_cursor: string | null
}

export type SendsListParams = {
  limit?: number
  cursor?: string
  status?: SendStatus
}

function toSearchParams(params: SendsListParams = {}): string {
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
  const text = search.toString()
  return text ? `?${text}` : ""
}

function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }
}

export function fetchSendsList(
  params: SendsListParams = {}
): Promise<SendsListResponse> {
  return apiJson<SendsListResponse>(`/api/sends${toSearchParams(params)}`)
}

export function fetchSend(id: string): Promise<SendListItem> {
  return apiJson<SendListItem>(`/api/sends/${encodeURIComponent(id)}`)
}

export function fetchOffers(): Promise<{ data: OfferOption[] }> {
  return apiJson<{ data: OfferOption[] }>("/api/offers?status=active&limit=200")
}

export type TemplateRow = TemplateJson
export type SenderRow = SenderJson

export const SEND_OPTIONS_TEMPLATE_PARAMS = {
  status: "active",
  limit: 100,
} as const

export const SEND_OPTIONS_SENDER_PARAMS = {
  status: "active",
  limit: 100,
} as const

export function fetchPublishedTemplateRows(): Promise<{ data: TemplateRow[] }> {
  const search = new URLSearchParams({
    status: SEND_OPTIONS_TEMPLATE_PARAMS.status,
    limit: String(SEND_OPTIONS_TEMPLATE_PARAMS.limit),
  })
  return apiJson<{ data: TemplateRow[] }>(`/api/templates?${search.toString()}`)
}

export function fetchActiveSenderRows(): Promise<{ data: SenderRow[] }> {
  const search = new URLSearchParams({
    status: SEND_OPTIONS_SENDER_PARAMS.status,
    limit: String(SEND_OPTIONS_SENDER_PARAMS.limit),
  })
  return apiJson<{ data: SenderRow[] }>(`/api/senders?${search.toString()}`)
}

export type CreateSendInput = {
  name: string
  template_version_id: string
  sender_id: string
  category_id: string
  offer_id: string | null
  scheduled_for: string
}

export function createSend(input: CreateSendInput): Promise<SendListItem> {
  return apiJson<SendListItem>("/api/sends", jsonInit("POST", input))
}

export type UpdateSendInput = Partial<CreateSendInput> & { version: number }

export function updateSend(
  id: string,
  input: UpdateSendInput
): Promise<SendListItem> {
  return apiJson<SendListItem>(
    `/api/sends/${encodeURIComponent(id)}`,
    jsonInit("PATCH", input)
  )
}

export function scheduleSend(
  id: string,
  version: number
): Promise<SendListItem> {
  return apiJson<SendListItem>(
    `/api/sends/${encodeURIComponent(id)}/schedule`,
    jsonInit("POST", { version })
  )
}

export function cancelSend(id: string, version: number): Promise<SendListItem> {
  return apiJson<SendListItem>(
    `/api/sends/${encodeURIComponent(id)}/cancel`,
    jsonInit("POST", { version })
  )
}

export function deleteSend(id: string, version: number): Promise<SendListItem> {
  const search = new URLSearchParams({ version: String(version) })
  return apiJson<SendListItem>(
    `/api/sends/${encodeURIComponent(id)}?${search.toString()}`,
    { method: "DELETE" }
  )
}

/** 409 raised when the send is no longer a draft. */
export function isSendLockedConflict(error: unknown): boolean {
  if (!isApiError(error) || error.status !== 409) {
    return false
  }
  return error.details.some((detail) => detail.path === "status")
}
