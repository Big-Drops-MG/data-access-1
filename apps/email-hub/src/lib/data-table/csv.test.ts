import { describe, expect, it, vi } from "vitest"

import {
  assertCsvExportRowLimit,
  collectCursorPagesForExport,
  DATA_TABLE_CSV_MAX_ROWS,
  DataTableExportTooLargeError,
  rowsToCsv,
} from "@/lib/data-table/csv"

describe("rowsToCsv", () => {
  it("escapes commas and quotes", () => {
    const csv = rowsToCsv(
      [{ name: 'Acme, "Inc"', status: "active" }],
      [
        { id: "name", header: "Name", value: (row) => row.name },
        { id: "status", header: "Status", value: (row) => row.status },
      ]
    )
    expect(csv).toBe('Name,Status\n"Acme, ""Inc""",active')
  })

  it("rejects exports over 50,000 rows", () => {
    expect(() => assertCsvExportRowLimit(DATA_TABLE_CSV_MAX_ROWS)).not.toThrow()
    expect(() => assertCsvExportRowLimit(DATA_TABLE_CSV_MAX_ROWS + 1)).toThrow(
      DataTableExportTooLargeError
    )
  })
})

describe("collectCursorPagesForExport", () => {
  it("walks pages until next_cursor is null", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ id: "1" }, { id: "2" }],
        next_cursor: "2",
      })
      .mockResolvedValueOnce({
        data: [{ id: "3" }],
        next_cursor: null,
      })

    await expect(
      collectCursorPagesForExport({
        fetchPage,
        pageSize: 2,
      })
    ).resolves.toEqual([{ id: "1" }, { id: "2" }, { id: "3" }])

    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenNthCalledWith(1, {
      cursor: undefined,
      limit: 2,
    })
    expect(fetchPage).toHaveBeenNthCalledWith(2, { cursor: "2", limit: 2 })
  })
})
