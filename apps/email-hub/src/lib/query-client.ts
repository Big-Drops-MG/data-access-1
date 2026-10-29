import {
  MutationCache,
  QueryClient,
  type QueryKey,
} from "@tanstack/react-query"

import { isApiError, isConflictError } from "@/lib/api-client"
import { presentConflictFromCache } from "@/lib/conflict-bridge"

/** List queries (SD#12.4). */
export const LIST_STALE_TIME_MS = 30_000

/** Detail queries while editing (SD#12.4). */
export const DETAIL_STALE_TIME_MS = 0

/** Optional mutation `meta` for conflict dialog behaviour (T-050). */
export type ConflictMutationMeta = {
  skipConflictDialog?: boolean
  /** Invalidate these keys on Reload; otherwise invalidate all queries. */
  conflictInvalidateKeys?: QueryKey[]
}

export function createQueryClient(): QueryClient {
  const holder: { client?: QueryClient } = {}

  holder.client = new QueryClient({
    mutationCache: new MutationCache({
      onError(error, _variables, _context, mutation) {
        if (!isConflictError(error)) {
          return
        }
        const meta = mutation.options.meta as ConflictMutationMeta | undefined
        if (meta?.skipConflictDialog) {
          return
        }
        const client = holder.client
        if (!client) {
          return
        }
        presentConflictFromCache(() => {
          const keys = meta?.conflictInvalidateKeys
          if (keys && keys.length > 0) {
            for (const queryKey of keys) {
              void client.invalidateQueries({ queryKey })
            }
            return
          }
          void client.invalidateQueries()
        })
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: LIST_STALE_TIME_MS,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (isApiError(error) && error.status >= 400 && error.status < 500) {
            return false
          }
          return failureCount < 2
        },
      },
      mutations: {
        retry: false,
      },
    },
  })

  return holder.client
}
