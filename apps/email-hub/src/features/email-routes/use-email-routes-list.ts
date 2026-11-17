"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  fetchEmailRoutesList,
  type EmailRoutesListParams,
} from "@/features/email-routes/api"
import { listQueryOptions } from "@/lib/query-options"

export function useEmailRoutesList(params: EmailRoutesListParams = {}) {
  return useQuery({
    ...listQueryOptions(
      "email-routes",
      () => fetchEmailRoutesList(params),
      params
    ),
    placeholderData: keepPreviousData,
  })
}
