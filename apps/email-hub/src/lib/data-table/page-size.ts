export const DATA_TABLE_PAGE_SIZES = [25, 50, 100, 200] as const

export type DataTablePageSize = (typeof DATA_TABLE_PAGE_SIZES)[number]

export const DEFAULT_DATA_TABLE_PAGE_SIZE: DataTablePageSize = 50

export function parseDataTablePageSize(
  value: string | null | undefined
): DataTablePageSize {
  const parsed = Number(value)
  if (DATA_TABLE_PAGE_SIZES.includes(parsed as DataTablePageSize)) {
    return parsed as DataTablePageSize
  }
  return DEFAULT_DATA_TABLE_PAGE_SIZE
}
