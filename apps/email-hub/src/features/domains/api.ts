import { apiJson } from "@/lib/api-client"
import type {
  DnsRecordJson,
  DomainSetupStepJson,
  DomainSummaryJson,
} from "@/lib/domains/serialize"

export type DnsRecordItem = DnsRecordJson
export type DomainSetupStepItem = DomainSetupStepJson
export type DomainListItem = DomainSummaryJson

export type DomainStatusCounts = {
  all: number
  pending: number
  verifying: number
  verified: number
  failed: number
  inactive: number
}

export type DomainsListResponse = {
  data: DomainListItem[]
  next_cursor: string | null
  status_counts: DomainStatusCounts
}

export const EMPTY_DOMAIN_STATUS_COUNTS: DomainStatusCounts = {
  all: 0,
  pending: 0,
  verifying: 0,
  verified: 0,
  failed: 0,
  inactive: 0,
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
  dns_records: DnsRecordItem[]
  setup_steps: DomainSetupStepItem[]
}

export function fetchDomainDetail(id: string): Promise<DomainDetailResponse> {
  return apiJson<DomainDetailResponse>(`/api/domains/${id}`)
}

export type CreateDomainResponse = DomainDetailResponse

export type CreateDomainInput = {
  name: string
  mail_from_subdomain?: string
}

export function createDomain(
  input: CreateDomainInput
): Promise<CreateDomainResponse> {
  return apiJson<CreateDomainResponse>("/api/domains", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
}

export function checkDomainDns(id: string): Promise<DomainDetailResponse> {
  return apiJson<DomainDetailResponse>(`/api/domains/${id}/check`, {
    method: "POST",
  })
}

export function disableDomain(id: string): Promise<unknown> {
  return apiJson<unknown>(`/api/domains/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "inactive" }),
  })
}
