"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  fetchRecipientsList,
  type RecipientListParams,
} from "@/features/recipients/api"
import { listQueryOptions } from "@/lib/query-options"

export function useRecipientsList(params: RecipientListParams = {}) {
  return useQuery({
    ...listQueryOptions(
      "recipients",
      () => fetchRecipientsList(params),
      params
    ),
    placeholderData: keepPreviousData,
  })
}
