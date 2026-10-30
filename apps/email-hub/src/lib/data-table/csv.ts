/** SD#12.5 — CSV export of the current filtered view, max 50,000 rows. */
export const DATA_TABLE_CSV_MAX_ROWS = 50_000

export class DataTableExportTooLargeError extends Error {
  readonly code = "validation_failed" as const
  readonly status = 422

  constructor(rowCount: number) {
    super(
      `Export is limited to ${DATA_TABLE_CSV_MAX_ROWS.toLocaleString("en-US")} rows (got ${rowCount.toLocaleString("en-US")}).`
    )
    this.name = "DataTableExportTooLargeError"
  }
}

export function assertCsvExportRowLimit(rowCount: number): void {
  if (rowCount > DATA_TABLE_CSV_MAX_ROWS) {
    throw new DataTableExportTooLargeError(rowCount)
  }
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return ""
  }
  const text = String(value)
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

export type CsvColumn<T> = {
  id: string
  header: string
  value: (row: T) => unknown
}

export function rowsToCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  assertCsvExportRowLimit(rows.length)
  const header = columns.map((column) => escapeCsvCell(column.header)).join(",")
  const lines = rows.map((row) =>
    columns.map((column) => escapeCsvCell(column.value(row))).join(",")
  )
  return [header, ...lines].join("\n")
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.rel = "noopener"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * Walk a cursor-paginated list until exhausted or over the export cap.
 * Throws `DataTableExportTooLargeError` when more than 50k rows would export.
 */
export async function collectCursorPagesForExport<T>(options: {
  fetchPage: (args: {
    cursor: string | undefined
    limit: number
  }) => Promise<{ data: T[]; next_cursor: string | null }>
  pageSize?: number
}): Promise<T[]> {
  const pageSize = options.pageSize ?? 200
  const rows: T[] = []
  let cursor: string | undefined

  for (;;) {
    const page = await options.fetchPage({ cursor, limit: pageSize })
    rows.push(...page.data)
    if (rows.length > DATA_TABLE_CSV_MAX_ROWS) {
      throw new DataTableExportTooLargeError(rows.length)
    }
    if (!page.next_cursor) {
      return rows
    }
    cursor = page.next_cursor
  }
}
