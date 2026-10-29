import { apiJson } from "@/lib/api-client"

export type DomainListItem = {
  id: string
  name: string
  status: string
}

export type DomainsListResponse = {
  data: DomainListItem[]
  next_cursor: string | null
}

export function fetchDomainsList(): Promise<DomainsListResponse> {
  return apiJson<DomainsListResponse>("/api/domains")
}
