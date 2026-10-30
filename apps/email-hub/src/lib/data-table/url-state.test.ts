import { describe, expect, it } from "vitest"

import {
  buildDataTableSearchParams,
  parseDataTableUrlState,
} from "@/lib/data-table/url-state"

describe("parseDataTableUrlState", () => {
  it("reads limit, cursor, sort, and filters from the query string", () => {
    const params = new URLSearchParams(
      "limit=100&cursor=abc&sort=name&dir=asc&status=pending"
    )
    expect(parseDataTableUrlState(params, ["status"])).toEqual({
      limit: 100,
      cursor: "abc",
      sort: { id: "name", desc: false },
      filters: { status: "pending" },
    })
  })

  it("defaults sort direction to desc and ignores unknown filter keys", () => {
    const params = new URLSearchParams("sort=created_at&status=verified")
    expect(parseDataTableUrlState(params, ["status"])).toEqual({
      limit: 50,
      cursor: undefined,
      sort: { id: "created_at", desc: true },
      filters: { status: "verified" },
    })
  })
})

describe("buildDataTableSearchParams", () => {
  it("omits default limit and empty filters", () => {
    const params = buildDataTableSearchParams({
      limit: 50,
      filters: { status: undefined },
    })
    expect(params.toString()).toBe("")
  })

  it("serializes non-default pagination, sort, and filters", () => {
    const params = buildDataTableSearchParams({
      limit: 25,
      cursor: "c1",
      sort: { id: "name", desc: true },
      filters: { status: "failed" },
    })
    expect(params.toString()).toBe(
      "limit=25&cursor=c1&sort=name&dir=desc&status=failed"
    )
  })
})
