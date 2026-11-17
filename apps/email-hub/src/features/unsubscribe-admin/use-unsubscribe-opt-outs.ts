"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  fetchUnsubscribeOptOuts,
  type UnsubscribeOptOutListParams,
} from "@/features/unsubscribe-admin/api"
import { listQueryOptions } from "@/lib/query-options"

export function useUnsubscribeOptOuts(
  params: UnsubscribeOptOutListParams = {}
) {
  return useQuery({
    ...listQueryOptions(
      "unsubscribe-opt-outs",
      () => fetchUnsubscribeOptOuts(params),
      params
    ),
    placeholderData: keepPreviousData,
  })
}
