import { apiJson } from "@/lib/api-client"
import type {
  FeedbackClassificationJson,
  FeedbackJson,
} from "@/lib/feedback/serialize"

export type FeedbackListItem = FeedbackJson
export type FeedbackStatus = FeedbackJson["status"]
export type FeedbackDecisionValue = NonNullable<FeedbackJson["decision"]>
export type FeedbackClassification = FeedbackClassificationJson

export type FeedbackListResponse = {
  data: FeedbackListItem[]
  next_cursor: string | null
}

export type FeedbackListParams = {
  limit?: number
  cursor?: string
  status?: FeedbackStatus
}

export type FeedbackClassificationsResponse = {
  data: FeedbackClassification[]
}

function toSearchParams(params: FeedbackListParams = {}): string {
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

export function fetchFeedbackList(
  params: FeedbackListParams = {}
): Promise<FeedbackListResponse> {
  return apiJson<FeedbackListResponse>(`/api/feedback${toSearchParams(params)}`)
}

export function fetchFeedback(id: string): Promise<FeedbackListItem> {
  return apiJson<FeedbackListItem>(`/api/feedback/${encodeURIComponent(id)}`)
}

export function fetchFeedbackClassifications(): Promise<FeedbackClassificationsResponse> {
  return apiJson<FeedbackClassificationsResponse>(
    "/api/feedback/classifications"
  )
}

export function claimFeedback(id: string): Promise<FeedbackListItem> {
  return apiJson<FeedbackListItem>(
    `/api/feedback/${encodeURIComponent(id)}/claim`,
    jsonInit("POST")
  )
}

export type DecideFeedbackInput = {
  classification_id: string
  decision: FeedbackDecisionValue
}

export function decideFeedback(
  id: string,
  input: DecideFeedbackInput
): Promise<FeedbackListItem> {
  return apiJson<FeedbackListItem>(
    `/api/feedback/${encodeURIComponent(id)}/decide`,
    jsonInit("POST", input)
  )
}
