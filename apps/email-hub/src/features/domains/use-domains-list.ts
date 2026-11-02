"use client"

import { useQuery } from "@tanstack/react-query"

import {
  fetchDomainsList,
  type DomainsListParams,
} from "@/features/domains/api"
import { listQueryOptions } from "@/lib/query-options"

/** Domains list query — first feature consumer of apiFetch / keys (T-050). */
export function useDomainsList(params: DomainsListParams = {}) {
  return useQuery(
    listQueryOptions("domains", () => fetchDomainsList(params), params)
  )
}
