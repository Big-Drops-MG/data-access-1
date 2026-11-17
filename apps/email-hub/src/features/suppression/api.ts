import { apiJson, isApiError } from "@/lib/api-client"
import type { OfferListItemJson } from "@/lib/offers/serialize"
import type {
  AddSuppressionJson,
  SuppressionJson,
} from "@/lib/suppressions/serialize"

export type SuppressionListItem = SuppressionJson
export type SuppressionSource = SuppressionJson["source"]
export type SuppressionScope = SuppressionJson["scope"]
export type OfferOption = OfferListItemJson

export type SuppressionsListResponse = {
  data: SuppressionListItem[]
  next_cursor: string | null
}

export type SuppressionsListParams = {
  limit?: number
  cursor?: string
  source?: SuppressionSource
  scope?: SuppressionScope
  offer_id?: string
  email?: string
  include_removed?: boolean
}

function toSearchParams(params: SuppressionsListParams = {}): string {
  const search = new URLSearchParams()
  if (params.limit != null) {
    search.set("limit", String(params.limit))
  }
  if (params.cursor) {
    search.set("cursor", params.cursor)
  }
  if (params.source) {
    search.set("source", params.source)
  }
  if (params.scope) {
    search.set("scope", params.scope)
  }
  if (params.offer_id) {
    search.set("offer_id", params.offer_id)
  }
  if (params.email) {
    search.set("email", params.email)
  }
  if (params.include_removed) {
    search.set("include_removed", "true")
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

export function fetchSuppressionsList(
  params: SuppressionsListParams = {}
): Promise<SuppressionsListResponse> {
  return apiJson<SuppressionsListResponse>(
    `/api/suppressions${toSearchParams(params)}`
  )
}

export type AddSuppressionInput = {
  email: string
  offer_id: string
}

export function addSuppression(
  input: AddSuppressionInput
): Promise<AddSuppressionJson> {
  return apiJson<AddSuppressionJson>(
    "/api/suppressions",
    jsonInit("POST", {
      email: input.email,
      offer_id: input.offer_id,
      reason: "manual",
    })
  )
}

export function removeSuppression(id: string): Promise<SuppressionListItem> {
  return apiJson<SuppressionListItem>(
    `/api/suppressions/${encodeURIComponent(id)}/remove`,
    jsonInit("POST")
  )
}

export function fetchActiveOffersForSuppression(): Promise<{
  data: OfferOption[]
}> {
  return apiJson<{ data: OfferOption[] }>("/api/offers?status=active&limit=200")
}

export function isHardBounceRemoveConflict(error: unknown): boolean {
  return isApiError(error) && error.status === 409
}
