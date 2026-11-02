import { afterEach, describe, expect, it, vi } from "vitest"

import {
  assertCsvExportRowLimit,
  collectCursorPagesForExport,
  DATA_TABLE_CSV_MAX_ROWS,
  DataTableExportTooLargeError,
  downloadCsv,
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

  it("treats nullish cell values as empty", () => {
    const csv = rowsToCsv(
      [{ name: null, note: undefined }],
      [
        { id: "name", header: "Name", value: (row) => row.name },
        { id: "note", header: "Note", value: (row) => row.note },
      ]
    )
    expect(csv).toBe("Name,Note\n,")
  })

  it("rejects exports over 50,000 rows", () => {
    expect(() => assertCsvExportRowLimit(DATA_TABLE_CSV_MAX_ROWS)).not.toThrow()
    expect(() => assertCsvExportRowLimit(DATA_TABLE_CSV_MAX_ROWS + 1)).toThrow(
      DataTableExportTooLargeError
    )
  })
})

describe("downloadCsv", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("creates a temporary download link", () => {
    const click = vi.fn()
    const remove = vi.fn()
    const appendChild = vi.fn()
    const createObjectURL = vi.fn(() => "blob:csv")
    const revokeObjectURL = vi.fn()
    const anchor = {
      href: "",
      download: "",
      rel: "",
      click,
      remove,
    }

    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL })
    vi.stubGlobal(
      "Blob",
      class {
        constructor(
          public parts: unknown[],
          public options?: unknown
        ) {}
      }
    )
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { appendChild },
    })

    downloadCsv("domains.csv", "a,b\n1,2")

    expect(createObjectURL).toHaveBeenCalled()
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(anchor.download).toBe("domains.csv")
    expect(click).toHaveBeenCalled()
    expect(remove).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:csv")
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

  it("throws when collected rows exceed the export cap", async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      data: Array.from({ length: DATA_TABLE_CSV_MAX_ROWS + 1 }, (_, i) => ({
        id: String(i),
      })),
      next_cursor: null,
    })

    await expect(
      collectCursorPagesForExport({ fetchPage })
    ).rejects.toBeInstanceOf(DataTableExportTooLargeError)
  })
})
