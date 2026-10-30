"use client"

import { useCallback, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import type { DataTablePageSize } from "@/lib/data-table/page-size"
import {
  buildDataTableSearchParams,
  parseDataTableUrlState,
  type DataTableSort,
  type DataTableUrlState,
} from "@/lib/data-table/url-state"

export type UseDataTableUrlStateOptions = {
  filterKeys?: readonly string[]
}

export type UseDataTableUrlStateResult = DataTableUrlState & {
  setLimit: (limit: DataTablePageSize) => void
  goNext: (nextCursor: string) => void
  goPrevious: () => void
  canGoPrevious: boolean
  setSort: (sort: DataTableSort | undefined) => void
  setFilter: (key: string, value: string | undefined) => void
  setFilters: (filters: Record<string, string | undefined>) => void
}

type CursorStackState = {
  key: string
  stack: string[]
}

/**
 * Syncs DataTable cursor pagination, page size, sort, and filters to the URL
 * (SD#12.5). Previous-page cursor history is keyed to filters/sort/page size so
 * it resets when those change without an effect.
 */
export function useDataTableUrlState(
  options: UseDataTableUrlStateOptions = {}
): UseDataTableUrlStateResult {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [stackState, setStackState] = useState<CursorStackState>({
    key: "",
    stack: [],
  })

  const state = useMemo(
    () => parseDataTableUrlState(searchParams, options.filterKeys ?? []),
    [searchParams, options.filterKeys]
  )

  const resetKey = useMemo(
    () =>
      JSON.stringify({
        limit: state.limit,
        sort: state.sort ?? null,
        filters: state.filters,
      }),
    [state.limit, state.sort, state.filters]
  )

  const cursorStack = useMemo(
    () => (stackState.key === resetKey ? stackState.stack : []),
    [resetKey, stackState.key, stackState.stack]
  )

  const replaceUrl = useCallback(
    (next: {
      limit: DataTablePageSize
      cursor?: string
      sort?: DataTableSort
      filters: Record<string, string>
    }) => {
      const params = buildDataTableSearchParams(next)
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      })
    },
    [pathname, router]
  )

  const setLimit = useCallback(
    (limit: DataTablePageSize) => {
      replaceUrl({
        limit,
        cursor: undefined,
        sort: state.sort,
        filters: state.filters,
      })
    },
    [replaceUrl, state.filters, state.sort]
  )

  const goNext = useCallback(
    (nextCursor: string) => {
      setStackState({
        key: resetKey,
        stack: [...cursorStack, state.cursor ?? ""],
      })
      replaceUrl({
        limit: state.limit,
        cursor: nextCursor,
        sort: state.sort,
        filters: state.filters,
      })
    },
    [
      cursorStack,
      replaceUrl,
      resetKey,
      state.cursor,
      state.filters,
      state.limit,
      state.sort,
    ]
  )

  const goPrevious = useCallback(() => {
    if (cursorStack.length === 0) {
      if (state.cursor) {
        replaceUrl({
          limit: state.limit,
          cursor: undefined,
          sort: state.sort,
          filters: state.filters,
        })
      }
      return
    }
    const previous = cursorStack[cursorStack.length - 1]
    setStackState({
      key: resetKey,
      stack: cursorStack.slice(0, -1),
    })
    replaceUrl({
      limit: state.limit,
      cursor: previous || undefined,
      sort: state.sort,
      filters: state.filters,
    })
  }, [
    cursorStack,
    replaceUrl,
    resetKey,
    state.cursor,
    state.filters,
    state.limit,
    state.sort,
  ])

  const setSort = useCallback(
    (sort: DataTableSort | undefined) => {
      replaceUrl({
        limit: state.limit,
        cursor: undefined,
        sort,
        filters: state.filters,
      })
    },
    [replaceUrl, state.filters, state.limit]
  )

  const setFilter = useCallback(
    (key: string, value: string | undefined) => {
      const filters = { ...state.filters }
      if (!value) {
        delete filters[key]
      } else {
        filters[key] = value
      }
      replaceUrl({
        limit: state.limit,
        cursor: undefined,
        sort: state.sort,
        filters,
      })
    },
    [replaceUrl, state.filters, state.limit, state.sort]
  )

  const setFilters = useCallback(
    (nextFilters: Record<string, string | undefined>) => {
      const filters: Record<string, string> = {}
      for (const [key, value] of Object.entries(nextFilters)) {
        if (value) {
          filters[key] = value
        }
      }
      replaceUrl({
        limit: state.limit,
        cursor: undefined,
        sort: state.sort,
        filters,
      })
    },
    [replaceUrl, state.limit, state.sort]
  )

  return {
    ...state,
    setLimit,
    goNext,
    goPrevious,
    canGoPrevious: cursorStack.length > 0 || Boolean(state.cursor),
    setSort,
    setFilter,
    setFilters,
  }
}
