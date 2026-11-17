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

export type RecipientListResponse = {
  data: RecipientListItem[]
  next_cursor: string | null
}

export type RecipientListParams = {
  limit?: number
  cursor?: string
  email?: string
  status?: "active" | "bounced"
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
