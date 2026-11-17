import { describe, expect, it } from "vitest"

import {
  isOfferId,
  readOfferCookie,
  resolveSelectedOfferId,
} from "@/lib/offer-selection"

const A = "019a0000-0000-7000-8000-0000000000aa"
const B = "019a0000-0000-7000-8000-0000000000bb"

describe("offer-selection", () => {
  it("validates offer ids", () => {
    expect(isOfferId(A)).toBe(true)
    expect(isOfferId("not-a-uuid")).toBe(false)
    expect(isOfferId(null)).toBe(false)
  })

  it("reads the offer cookie", () => {
    expect(readOfferCookie(`eh-offer-id=${A}; other=1`)).toBe(A)
    expect(readOfferCookie("eh-offer-id=bad")).toBeNull()
    expect(readOfferCookie("")).toBeNull()
  })

  it("prefers a matching preferred id then falls back to the first offer", () => {
    const offers = [{ id: A }, { id: B }]
    expect(resolveSelectedOfferId(offers, B)).toBe(B)
    expect(resolveSelectedOfferId(offers, "missing")).toBe(A)
    expect(resolveSelectedOfferId([], B)).toBeNull()
  })
})
