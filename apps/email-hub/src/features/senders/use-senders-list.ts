"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import {
  fetchSendersList,
  type SendersListParams,
} from "@/features/senders/api"
import { listQueryOptions } from "@/lib/query-options"

export function useSendersList(params: SendersListParams = {}) {
  return useQuery({
    ...listQueryOptions("senders", () => fetchSendersList(params), params),
    placeholderData: keepPreviousData,
  })
}
