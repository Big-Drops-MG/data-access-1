"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchDomainsList } from "@/features/domains/api"
import { listQueryOptions } from "@/lib/query-options"

/** Domains list query — first feature consumer of apiFetch / keys (T-050). */
export function useDomainsList() {
  return useQuery(listQueryOptions("domains", fetchDomainsList))
}
