import { describe, expect, it } from "vitest"

import {
  createSuppressionBodySchema,
  suppressionListQuerySchema,
} from "./schemas"

const offerId = "019a0000-0000-7000-8000-000000000012"

describe("createSuppressionBodySchema", () => {
  it("normalises email and accepts a null offer", () => {
    expect(
      createSuppressionBodySchema.parse({
        email: "  Ada.T068@Example.COM ",
        offer_id: null,
        reason: "manual",
      })
    ).toEqual({
      email: "ada.t068@example.com",
      offer_id: null,
      reason: "manual",
    })
  })

  it("accepts an omitted offer", () => {
    expect(
      createSuppressionBodySchema.parse({
        email: "ada@example.com",
        reason: "manual",
      }).offer_id
    ).toBeUndefined()
  })

  it("rejects a missing email, an invalid email, and a non-manual reason", () => {
    expect(
      createSuppressionBodySchema.safeParse({ reason: "manual" }).success
    ).toBe(false)
    expect(
      createSuppressionBodySchema.safeParse({
        email: "not-an-email",
        reason: "manual",
      }).success
    ).toBe(false)
    expect(
      createSuppressionBodySchema.safeParse({
        email: "ada@example.com",
        reason: "hard_bounce",
      }).success
    ).toBe(false)
    expect(
      createSuppressionBodySchema.safeParse({
        email: "ada@example.com",
        reason: "optizmo",
      }).success
    ).toBe(false)
  })

  it("rejects a client added_by and an empty offer id", () => {
    expect(
      createSuppressionBodySchema.safeParse({
        email: "ada@example.com",
        reason: "manual",
        added_by: "019a0000-0000-7000-8000-000000000001",
      }).success
    ).toBe(false)
    expect(
      createSuppressionBodySchema.safeParse({
        email: "ada@example.com",
        reason: "manual",
        offer_id: "",
      }).success
    ).toBe(false)
    expect(
      createSuppressionBodySchema.safeParse({
        email: "ada@example.com",
        reason: "manual",
        offer_id: offerId,
        role: "admin",
      }).success
    ).toBe(false)
  })
})

describe("suppressionListQuerySchema", () => {
  it("defaults limit and accepts documented filters", () => {
    expect(suppressionListQuerySchema.parse({})).toEqual({ limit: 50 })
    expect(
      suppressionListQuerySchema.parse({
        limit: "2",
        cursor: offerId,
        source: "manual",
        scope: "offer",
        offer_id: offerId,
        email: " Ada@Example.com ",
        include_removed: "true",
      })
    ).toEqual({
      limit: 2,
      cursor: offerId,
      source: "manual",
      scope: "offer",
      offer_id: offerId,
      email: "ada@example.com",
      include_removed: "true",
    })
  })

  it("rejects an oversized page, a bad cursor, and unknown filters", () => {
    expect(suppressionListQuerySchema.safeParse({ limit: "201" }).success).toBe(
      false
    )
    expect(suppressionListQuerySchema.safeParse({ limit: "0" }).success).toBe(
      false
    )
    expect(
      suppressionListQuerySchema.safeParse({ cursor: "not-a-uuid" }).success
    ).toBe(false)
    expect(
      suppressionListQuerySchema.safeParse({ sort: "created_at" }).success
    ).toBe(false)
  })
})
