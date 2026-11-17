import { apiJson, isApiError } from "@/lib/api-client"
import type { EmailRouteJson } from "@/lib/email-routes/serialize"
import type { OfferListItemJson } from "@/lib/offers/serialize"
import type { SenderJson } from "@/lib/senders/serialize"
import type { TemplateJson } from "@/lib/templates/serialize"

export type EmailRouteListItem = EmailRouteJson
export type EmailRouteStatus = EmailRouteJson["status"]
export type EmailRouteEmailType = EmailRouteJson["email_type"]

export type EmailRoutesListResponse = {
  data: EmailRouteListItem[]
  next_cursor: string | null
}

export type EmailRoutesListParams = {
  limit?: number
  cursor?: string
  status?: EmailRouteStatus
  email_type?: EmailRouteEmailType
  offer_id?: string
  template_id?: string
  sender_id?: string
}

export type TemplateOptionRow = TemplateJson
export type SenderOptionRow = SenderJson
export type OfferOptionRow = OfferListItemJson

function toSearchParams(params: EmailRoutesListParams = {}): string {
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
  if (params.email_type) {
    search.set("email_type", params.email_type)
  }
  if (params.offer_id) {
    search.set("offer_id", params.offer_id)
  }
  if (params.template_id) {
    search.set("template_id", params.template_id)
  }
  if (params.sender_id) {
    search.set("sender_id", params.sender_id)
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

export function fetchEmailRoutesList(
  params: EmailRoutesListParams = {}
): Promise<EmailRoutesListResponse> {
  return apiJson<EmailRoutesListResponse>(
    `/api/email-routes${toSearchParams(params)}`
  )
}

export type CreateEmailRouteInput = {
  email_type: EmailRouteEmailType
  offer_id?: string | null
  template_id: string
  sender_id: string
}

export function createEmailRoute(
  input: CreateEmailRouteInput
): Promise<EmailRouteListItem> {
  return apiJson<EmailRouteListItem>(
    "/api/email-routes",
    jsonInit("POST", input)
  )
}

export function archiveEmailRoute(id: string): Promise<EmailRouteListItem> {
  return apiJson<EmailRouteListItem>(
    `/api/email-routes/${encodeURIComponent(id)}/archive`,
    jsonInit("POST")
  )
}

export type UpdateEmailRouteInput = {
  version: number
  email_type?: EmailRouteEmailType
  offer_id?: string | null
  template_id?: string
  sender_id?: string
  status?: EmailRouteStatus
}

export function updateEmailRoute(
  id: string,
  input: UpdateEmailRouteInput
): Promise<EmailRouteListItem> {
  return apiJson<EmailRouteListItem>(
    `/api/email-routes/${encodeURIComponent(id)}`,
    jsonInit("PATCH", input)
  )
}

export function fetchPublishedTemplatesForRoute(options: {
  email_type: EmailRouteEmailType
}): Promise<{ data: TemplateOptionRow[] }> {
  const search = new URLSearchParams({
    status: "active",
    email_type: options.email_type,
    limit: "100",
  })
  return apiJson<{ data: TemplateOptionRow[] }>(
    `/api/templates?${search.toString()}`
  )
}

export function fetchTemplatesForRouteLookup(options: {
  email_type: EmailRouteEmailType
}): Promise<{ data: TemplateOptionRow[] }> {
  const search = new URLSearchParams({
    email_type: options.email_type,
    limit: "100",
  })
  return apiJson<{ data: TemplateOptionRow[] }>(
    `/api/templates?${search.toString()}`
  )
}

export function fetchActiveSendersForRoute(): Promise<{
  data: SenderOptionRow[]
}> {
  const search = new URLSearchParams({
    status: "active",
    limit: "100",
  })
  return apiJson<{ data: SenderOptionRow[] }>(
    `/api/senders?${search.toString()}`
  )
}

export function fetchSendersForRouteLookup(): Promise<{
  data: SenderOptionRow[]
}> {
  const search = new URLSearchParams({
    limit: "100",
  })
  return apiJson<{ data: SenderOptionRow[] }>(
    `/api/senders?${search.toString()}`
  )
}

export function fetchActiveOffersForRoute(): Promise<{
  data: OfferOptionRow[]
}> {
  return apiJson<{ data: OfferOptionRow[] }>(
    "/api/offers?status=active&limit=200"
  )
}

export function fetchOffersForRouteLookup(): Promise<{
  data: OfferOptionRow[]
}> {
  return apiJson<{ data: OfferOptionRow[] }>("/api/offers?limit=200")
}

export function isEmailRouteConflict(error: unknown): boolean {
  return isApiError(error) && error.status === 409
}
