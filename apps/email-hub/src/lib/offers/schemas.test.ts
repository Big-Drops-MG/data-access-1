import { describe, expect, it } from "vitest"

import { offerListQuerySchema } from "./schemas"

describe("offerListQuerySchema", () => {
  it("defaults limit and status", () => {
    expect(offerListQuerySchema.parse({})).toEqual({
      limit: 100,
      status: "active",
    })
  })

  it("accepts inactive status and custom limit", () => {
    expect(
      offerListQuerySchema.parse({ limit: "25", status: "inactive" })
    ).toEqual({
      limit: 25,
      status: "inactive",
    })
  })

  it("rejects unknown keys", () => {
    expect(() => offerListQuerySchema.parse({ bogus: "1" })).toThrow()
  })
})
