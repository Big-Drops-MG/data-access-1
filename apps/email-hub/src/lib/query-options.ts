import type { UseQueryOptions } from "@tanstack/react-query"

import { DETAIL_STALE_TIME_MS, LIST_STALE_TIME_MS } from "@/lib/query-client"
import { detailQueryKey, listQueryKey } from "@/lib/query-keys"

/** List query defaults: key + 30s stale time (SD#12.4). */
export function listQueryOptions<TData>(
  feature: string,
  queryFn: () => Promise<TData>,
  filters?: unknown
): UseQueryOptions<TData, Error, TData, ReturnType<typeof listQueryKey>> {
  return {
    queryKey: listQueryKey(feature, filters),
    queryFn,
    staleTime: LIST_STALE_TIME_MS,
  }
}

/** Detail query defaults: key + staleTime 0 while editing (SD#12.4). */
export function detailQueryOptions<TData>(
  feature: string,
  id: string,
  queryFn: () => Promise<TData>
): UseQueryOptions<TData, Error, TData, ReturnType<typeof detailQueryKey>> {
  return {
    queryKey: detailQueryKey(feature, id),
    queryFn,
    staleTime: DETAIL_STALE_TIME_MS,
  }
}
