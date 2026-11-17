import { apiJson } from "@/lib/api-client"
import type {
  UnsubscribeOptOutJson,
  UnsubscribeSettingsJson,
} from "@/lib/unsubscribe-admin/serialize"

export type UnsubscribeOptOut = UnsubscribeOptOutJson
export type UnsubscribeSettings = UnsubscribeSettingsJson

export type UnsubscribeOptOutListResponse = {
  data: UnsubscribeOptOut[]
  next_cursor: string | null
}

export type UnsubscribeOptOutListParams = {
  limit?: number
  cursor?: string
  q?: string
  scope?: "category" | "all" | "all_types"
}

export type PatchUnsubscribeSettingsInput = {
  logo_url?: string | null
  custom_domain?: string | null
}

function toSearchParams(params: UnsubscribeOptOutListParams = {}): string {
  const search = new URLSearchParams()
  if (params.limit != null) {
    search.set("limit", String(params.limit))
  }
  if (params.cursor) {
    search.set("cursor", params.cursor)
  }
  if (params.q) {
    search.set("q", params.q)
  }
  if (params.scope && params.scope !== "all_types") {
    search.set("scope", params.scope)
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

export function fetchUnsubscribeOptOuts(
  params: UnsubscribeOptOutListParams = {}
): Promise<UnsubscribeOptOutListResponse> {
  return apiJson<UnsubscribeOptOutListResponse>(
    `/api/unsubscribe/opt-outs${toSearchParams(params)}`
  )
}

export function fetchUnsubscribeSettings(): Promise<UnsubscribeSettings> {
  return apiJson<UnsubscribeSettings>("/api/unsubscribe/settings")
}

export function patchUnsubscribeSettings(
  input: PatchUnsubscribeSettingsInput
): Promise<UnsubscribeSettings> {
  return apiJson<UnsubscribeSettings>(
    "/api/unsubscribe/settings",
    jsonInit("PATCH", input)
  )
}

export function verifyUnsubscribeDomain(): Promise<UnsubscribeSettings> {
  return apiJson<UnsubscribeSettings>(
    "/api/unsubscribe/settings/verify-domain",
    jsonInit("POST")
  )
}
