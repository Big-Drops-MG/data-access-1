import { describe, expect, it } from "vitest"

import { serializeOffer } from "./serialize"

describe("serializeOffer", () => {
  it("maps drizzle columns to API JSON", () => {
    expect(
      serializeOffer({
        id: "019a0000-0000-7000-8000-0000000000aa",
        name: "Q4 relaunch",
        externalRef: "offer-42",
        status: "active",
        createdAt: new Date("2026-11-05T12:00:00.000Z"),
        updatedAt: new Date("2026-11-05T12:00:00.000Z"),
      })
    ).toEqual({
      id: "019a0000-0000-7000-8000-0000000000aa",
      name: "Q4 relaunch",
      external_ref: "offer-42",
      status: "active",
    })
  })
})
