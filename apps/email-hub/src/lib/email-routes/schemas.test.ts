import { describe, expect, it } from "vitest"

import {
  createEmailRouteBodySchema,
  emailRouteListQuerySchema,
  updateEmailRouteBodySchema,
} from "./schemas"

const id = "019a0000-0000-7000-8000-000000000010"

describe("createEmailRouteBodySchema", () => {
  it("accepts a route with a nullable offer", () => {
    expect(
      createEmailRouteBodySchema.parse({
        email_type: "thank_you",
        offer_id: null,
        template_id: id,
        sender_id: id,
      })
    ).toEqual({
      email_type: "thank_you",
      offer_id: null,
      template_id: id,
      sender_id: id,
    })
  })

  it("rejects an unknown email type", () => {
    expect(
      createEmailRouteBodySchema.safeParse({
        email_type: "promo",
        template_id: id,
        sender_id: id,
      }).success
    ).toBe(false)
  })
})

describe("updateEmailRouteBodySchema", () => {
  it("requires version and at least one change", () => {
    expect(updateEmailRouteBodySchema.safeParse({ version: 1 }).success).toBe(
      false
    )
    expect(
      updateEmailRouteBodySchema.parse({ version: 1, status: "inactive" })
    ).toEqual({ version: 1, status: "inactive" })
  })
})

describe("emailRouteListQuerySchema", () => {
  it("defaults limit and keeps filters", () => {
    expect(
      emailRouteListQuerySchema.parse({
        email_type: "engagement",
        status: "active",
      })
    ).toEqual({
      limit: 50,
      email_type: "engagement",
      status: "active",
    })
  })
})
