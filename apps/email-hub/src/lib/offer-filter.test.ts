import { describe, expect, it } from "vitest"

import { filterOffersByQuery, offerMatchesQuery } from "@/lib/offer-filter"

const sample = {
  name: "Sample offer",
  external_ref: "dev-sample-offer",
  everflow_offer_id: 2049 as number | null,
}

describe("offer-filter", () => {
  it("matches name, ref, and Everflow id forms", () => {
    expect(offerMatchesQuery(sample, "sample")).toBe(true)
    expect(offerMatchesQuery(sample, "DEV-SAMPLE")).toBe(true)
    expect(offerMatchesQuery(sample, "2049")).toBe(true)
    expect(offerMatchesQuery(sample, "#2049")).toBe(true)
    expect(offerMatchesQuery(sample, "ef 2049")).toBe(true)
    expect(offerMatchesQuery(sample, "missing")).toBe(false)
  })

  it("returns all offers for an empty query", () => {
    expect(filterOffersByQuery([sample], "  ")).toHaveLength(1)
  })
})
