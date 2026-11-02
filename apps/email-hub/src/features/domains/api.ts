import { apiJson } from "@/lib/api-client"

export type DomainListItem = {
  id: string
  name: string
  status: string
  created_at?: string
  updated_at?: string
  verified_at?: string | null
}

export type DomainsListResponse = {
  data: DomainListItem[]
  next_cursor: string | null
}

export type DomainsListParams = {
  limit?: number
  cursor?: string
  status?: string
}

function toSearchParams(params: DomainsListParams = {}): string {
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

export function fetchDomainsList(
  params: DomainsListParams = {}
): Promise<DomainsListResponse> {
  return apiJson<DomainsListResponse>(`/api/domains${toSearchParams(params)}`)
}

export type DomainDetailResponse = DomainListItem & {
  ses_identity_arn: string | null
  created_by: string | null
  dns_records: unknown[]
  setup_steps: unknown[]
}

export function fetchDomainDetail(id: string): Promise<DomainDetailResponse> {
  return apiJson<DomainDetailResponse>(`/api/domains/${id}`)
}
