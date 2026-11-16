import { describe, expect, it } from "vitest"

import {
  everflowOfferIdParamSchema,
  importOfferBodySchema,
  offerListQuerySchema,
} from "./schemas"

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

describe("importOfferBodySchema", () => {
  it("accepts a positive Everflow offer id", () => {
    expect(importOfferBodySchema.parse({ everflow_offer_id: 2049 })).toEqual({
      everflow_offer_id: 2049,
    })
    expect(importOfferBodySchema.parse({ everflow_offer_id: "2049" })).toEqual({
      everflow_offer_id: 2049,
    })
  })

  it("rejects non-positive ids", () => {
    expect(() =>
      importOfferBodySchema.parse({ everflow_offer_id: 0 })
    ).toThrow()
  })
})

describe("everflowOfferIdParamSchema", () => {
  it("parses path ids", () => {
    expect(
      everflowOfferIdParamSchema.parse({ everflow_offer_id: "2049" })
    ).toEqual({ everflow_offer_id: 2049 })
  })
})
