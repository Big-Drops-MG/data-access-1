import { describe, expect, it } from "vitest"

import { detailQueryKey, listQueryKey } from "./query-keys.js"

describe("query keys (SD#12.4)", () => {
  it("builds list keys with optional filters", () => {
    expect(listQueryKey("domains")).toEqual(["domains", "list"])
    expect(listQueryKey("domains", { status: "active" })).toEqual([
      "domains",
      "list",
      { status: "active" },
    ])
  })

  it("builds detail keys as [feature, detail, id]", () => {
    expect(detailQueryKey("templates", "abc")).toEqual([
      "templates",
      "detail",
      "abc",
    ])
  })
})
