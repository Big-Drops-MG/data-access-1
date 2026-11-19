"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchLatestRecipientImport } from "@/features/recipients/api"
import { detailQueryOptions } from "@/lib/query-options"

export function useLatestRecipientImport(options?: {
  refetchInterval?: number | false
}) {
  return useQuery({
    ...detailQueryOptions("recipients-import", "latest", () =>
      fetchLatestRecipientImport()
    ),
    refetchInterval: options?.refetchInterval,
  })
}
