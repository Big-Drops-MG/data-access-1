import {
  DEFAULT_DATA_TABLE_PAGE_SIZE,
  parseDataTablePageSize,
  type DataTablePageSize,
} from "@/lib/data-table/page-size"

export type DataTableSort = {
  id: string
  desc: boolean
}

export type DataTableUrlState = {
  limit: DataTablePageSize
  cursor: string | undefined
  sort: DataTableSort | undefined
  filters: Record<string, string>
}

const RESERVED_KEYS = new Set(["limit", "cursor", "sort", "dir"])

export function parseDataTableUrlState(
  searchParams: URLSearchParams,
  filterKeys: readonly string[] = []
): DataTableUrlState {
  const limit = parseDataTablePageSize(searchParams.get("limit"))
  const cursor = searchParams.get("cursor")?.trim() || undefined
  const sortId = searchParams.get("sort")?.trim() || undefined
  const dir = searchParams.get("dir")
  const sort: DataTableSort | undefined = sortId
    ? { id: sortId, desc: dir !== "asc" }
    : undefined

  const filters: Record<string, string> = {}
  for (const key of filterKeys) {
    if (RESERVED_KEYS.has(key)) {
      continue
    }
    const value = searchParams.get(key)?.trim()
    if (value) {
      filters[key] = value
    }
  }

  return { limit, cursor, sort, filters }
}

export function buildDataTableSearchParams(options: {
  limit: DataTablePageSize
  cursor?: string
  sort?: DataTableSort
  filters?: Record<string, string | undefined>
}): URLSearchParams {
  const params = new URLSearchParams()

  if (options.limit !== DEFAULT_DATA_TABLE_PAGE_SIZE) {
    params.set("limit", String(options.limit))
  }
  if (options.cursor) {
    params.set("cursor", options.cursor)
  }
  if (options.sort) {
    params.set("sort", options.sort.id)
    params.set("dir", options.sort.desc ? "desc" : "asc")
  }
  if (options.filters) {
    for (const [key, value] of Object.entries(options.filters)) {
      if (value && !RESERVED_KEYS.has(key)) {
        params.set(key, value)
      }
    }
  }

  return params
}

export function dataTableSearchString(
  options: Parameters<typeof buildDataTableSearchParams>[0]
): string {
  const params = buildDataTableSearchParams(options)
  const text = params.toString()
  return text ? `?${text}` : ""
}
