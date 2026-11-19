"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { fetchApiClientsList } from "@/features/api-clients/api"
import { listQueryOptions } from "@/lib/query-options"

export function useApiClientsList() {
  return useQuery({
    ...listQueryOptions("api-clients", () => fetchApiClientsList()),
    placeholderData: keepPreviousData,
  })
}
