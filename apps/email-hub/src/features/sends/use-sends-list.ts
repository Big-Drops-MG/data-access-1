"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { fetchSendsList, type SendsListParams } from "@/features/sends/api"
import { listQueryOptions } from "@/lib/query-options"

export function useSendsList(params: SendsListParams = {}) {
  return useQuery({
    ...listQueryOptions("sends", () => fetchSendsList(params), params),
    placeholderData: keepPreviousData,
  })
}
