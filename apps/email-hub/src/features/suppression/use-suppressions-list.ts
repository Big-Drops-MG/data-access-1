"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  fetchSuppressionsList,
  type SuppressionsListParams,
} from "@/features/suppression/api"
import { listQueryOptions } from "@/lib/query-options"

export function useSuppressionsList(params: SuppressionsListParams = {}) {
  return useQuery({
    ...listQueryOptions(
      "suppressions",
      () => fetchSuppressionsList(params),
      params
    ),
    placeholderData: keepPreviousData,
  })
}
