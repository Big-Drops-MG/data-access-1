import { apiJson, isApiError, type ApiError } from "@/lib/api-client"
import type { SenderJson } from "@/lib/senders/serialize"
import type { AppErrorDetail } from "@workspace/shared/client"

export type SenderListItem = SenderJson

export type SendersListResponse = {
  data: SenderListItem[]
  next_cursor: string | null
}

export type SendersListParams = {
  limit?: number
  cursor?: string
  status?: "active" | "inactive" | "pending_verification"
  domain_id?: string
}

export type SenderRouteConflict = {
  id: string
  emailType: string
  name: string
}

function toSearchParams(params: SendersListParams = {}): string {
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
  if (params.domain_id) {
    search.set("domain_id", params.domain_id)
  }
  const text = search.toString()
  return text ? `?${text}` : ""
}

export function fetchSendersList(
  params: SendersListParams = {}
): Promise<SendersListResponse> {
  return apiJson<SendersListResponse>(`/api/senders${toSearchParams(params)}`)
}

export type SenderDomainOption = {
  id: string
  name: string
  status: string
}

/** Active (verified) domains for the create-sender picker. */
export function fetchActiveDomainsForSender(): Promise<{
  data: SenderDomainOption[]
}> {
  const search = new URLSearchParams({
    status: "verified",
    limit: "100",
  })
  return apiJson<{ data: SenderDomainOption[] }>(
    `/api/domains?${search.toString()}`
  )
}

export function fetchSender(id: string): Promise<SenderListItem> {
  return apiJson<SenderListItem>(`/api/senders/${encodeURIComponent(id)}`)
}

export type CreateSenderInput = {
  domain_id: string
  from_name: string
  local_part: string
  reply_to?: string | null
}

export function createSender(
  input: CreateSenderInput
): Promise<SenderListItem> {
  return apiJson<SenderListItem>("/api/senders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
}

export type UpdateSenderInput = {
  version: number
  from_name?: string
  local_part?: string
  reply_to?: string | null
  status?: "active" | "inactive" | "pending_verification"
}

export function updateSender(
  id: string,
  input: UpdateSenderInput
): Promise<SenderListItem> {
  return apiJson<SenderListItem>(`/api/senders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
}

/** Parse 409 details from disable-when-in-use into route rows for the modal. */
export function parseSenderRouteConflicts(
  details: AppErrorDetail[]
): SenderRouteConflict[] {
  const ids = details
    .filter((detail) => detail.path === "email_route")
    .map((detail) => detail.message)

  return ids.map((id) => {
    const emailType =
      details.find((detail) => detail.path === `email_route/${id}/email_type`)
        ?.message ?? "route"
    const name =
      details.find((detail) => detail.path === `email_route/${id}/name`)
        ?.message ?? "Default"
    return { id, emailType, name }
  })
}

export function isSenderInUseConflict(error: unknown): error is ApiError {
  if (!isApiError(error) || error.status !== 409) {
    return false
  }
  return error.details.some((detail) => detail.path === "email_route")
}
