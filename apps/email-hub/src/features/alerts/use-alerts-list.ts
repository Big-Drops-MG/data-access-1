"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { fetchAlertsList, type AlertListParams } from "@/features/alerts/api"
import { listQueryOptions } from "@/lib/query-options"

export function useAlertsList(params: AlertListParams = {}) {
  return useQuery({
    ...listQueryOptions("alerts", () => fetchAlertsList(params), params),
    placeholderData: keepPreviousData,
  })
}
