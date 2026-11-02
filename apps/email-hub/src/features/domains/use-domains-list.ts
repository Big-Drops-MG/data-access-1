"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  fetchDomainsList,
  type DomainsListParams,
} from "@/features/domains/api"
import {
  getMockDomainsList,
  USE_MOCK_DOMAINS,
} from "@/features/domains/mock-domains"
import { listQueryOptions } from "@/lib/query-options"

/** Domains list query — first feature consumer of apiFetch / keys (T-050). */
export function useDomainsList(params: DomainsListParams = {}) {
  return useQuery({
    ...listQueryOptions(
      "domains",
      () =>
        USE_MOCK_DOMAINS
          ? getMockDomainsList(params)
          : fetchDomainsList(params),
      params
    ),
    placeholderData: keepPreviousData,
  })
}
