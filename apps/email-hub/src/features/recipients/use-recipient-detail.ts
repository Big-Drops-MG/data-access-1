"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchRecipientDetail } from "@/features/recipients/api"
import { detailQueryOptions } from "@/lib/query-options"

export function useRecipientDetail(id: string) {
  return useQuery({
    ...detailQueryOptions("recipients", id, () => fetchRecipientDetail(id)),
  })
}
