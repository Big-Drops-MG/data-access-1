import { describe, expect, it } from "vitest"

import {
  DEFAULT_DATA_TABLE_PAGE_SIZE,
  parseDataTablePageSize,
} from "@/lib/data-table/page-size"

describe("parseDataTablePageSize", () => {
  it("defaults to 50", () => {
    expect(parseDataTablePageSize(null)).toBe(DEFAULT_DATA_TABLE_PAGE_SIZE)
    expect(parseDataTablePageSize("")).toBe(50)
    expect(parseDataTablePageSize("13")).toBe(50)
  })

  it("accepts allowed sizes", () => {
    expect(parseDataTablePageSize("25")).toBe(25)
    expect(parseDataTablePageSize("50")).toBe(50)
    expect(parseDataTablePageSize("100")).toBe(100)
    expect(parseDataTablePageSize("200")).toBe(200)
  })
})
