import { describe, expect, it } from "vitest"

import { DETAIL_STALE_TIME_MS, LIST_STALE_TIME_MS } from "./query-client.js"
import { detailQueryOptions, listQueryOptions } from "./query-options.js"

describe("query options helpers", () => {
  it("listQueryOptions sets list key and 30s stale time", () => {
    const options = listQueryOptions("domains", async () => ({ data: [] }))
    expect(options.queryKey).toEqual(["domains", "list"])
    expect(options.staleTime).toBe(LIST_STALE_TIME_MS)
  })

  it("detailQueryOptions sets detail key and staleTime 0", () => {
    const options = detailQueryOptions("domains", "id-1", async () => ({
      id: "id-1",
    }))
    expect(options.queryKey).toEqual(["domains", "detail", "id-1"])
    expect(options.staleTime).toBe(DETAIL_STALE_TIME_MS)
    expect(DETAIL_STALE_TIME_MS).toBe(0)
  })
})
