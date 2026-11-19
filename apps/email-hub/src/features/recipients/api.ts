import { apiJson } from "@/lib/api-client"
import type {
  EmailCategoryJson,
  FrequencyRuleJson,
} from "@/lib/email-categories/serialize"
import type {
  RecipientDetailJson,
  RecipientListItemJson,
} from "@/lib/recipients/serialize"

export type RecipientListItem = RecipientListItemJson
export type RecipientDetail = RecipientDetailJson

export type RecipientStatusCounts = {
  all: number
  active: number
  bounced: number
  unsubscribed: number
}

export const EMPTY_RECIPIENT_STATUS_COUNTS: RecipientStatusCounts = {
  all: 0,
  active: 0,
  bounced: 0,
  unsubscribed: 0,
}

export type RecipientListResponse = {
  data: RecipientListItem[]
  next_cursor: string | null
  status_counts: RecipientStatusCounts
}

export type RecipientListParams = {
  limit?: number
  cursor?: string
  email?: string
  status?: "active" | "bounced"
  unsubscribed?: boolean
  opted_out_category_id?: string
  offer_id?: string
}

export type EmailCategoriesResponse = {
  data: EmailCategoryJson[]
  frequency_rules: FrequencyRuleJson[]
}

function toSearchParams(params: RecipientListParams = {}): string {
  const search = new URLSearchParams()
  if (params.limit != null) {
    search.set("limit", String(params.limit))
  }
  if (params.cursor) {
    search.set("cursor", params.cursor)
  }
  if (params.email) {
    search.set("email", params.email)
  }
  if (params.status) {
    search.set("status", params.status)
  }
  if (params.unsubscribed) {
    search.set("unsubscribed", "true")
  }
  if (params.opted_out_category_id) {
    search.set("opted_out_category_id", params.opted_out_category_id)
  }
  if (params.offer_id) {
    search.set("offer_id", params.offer_id)
  }
  const text = search.toString()
  return text ? `?${text}` : ""
}

export function fetchRecipientsList(
  params: RecipientListParams = {}
): Promise<RecipientListResponse> {
  return apiJson<RecipientListResponse>(
    `/api/recipients${toSearchParams(params)}`
  )
}

export function fetchRecipientDetail(id: string): Promise<RecipientDetail> {
  return apiJson<RecipientDetail>(`/api/recipients/${id}`)
}

export function fetchEmailCategories(): Promise<EmailCategoriesResponse> {
  return apiJson<EmailCategoriesResponse>("/api/email-categories")
}

export type RecipientImportInvalidRow = {
  row: number
  column: string
  problem: string
}

export type RecipientImportLatest = {
  upload_id: string
  completed_at: string
  rows_read: number
  added: number
  updated: number
  skipped: number
  invalid: number
  invalid_rows: RecipientImportInvalidRow[]
}

export type RecipientImportLatestResponse = {
  data: RecipientImportLatest | null
}

export async function importRecipientsCsv(
  file: File
): Promise<{ upload_id: string }> {
  const body = new FormData()
  body.set("file", file)
  return apiJson<{ upload_id: string }>("/api/recipients/import", {
    method: "POST",
    body,
  })
}

export function fetchLatestRecipientImport(): Promise<RecipientImportLatestResponse> {
  return apiJson<RecipientImportLatestResponse>("/api/recipients/import/latest")
}
