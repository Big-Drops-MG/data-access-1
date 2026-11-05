import { describe, expect, it } from "vitest"

import {
  createSendBodySchema,
  deleteSendQuerySchema,
  sendListQuerySchema,
  sendVersionBodySchema,
  updateSendBodySchema,
} from "./schemas"

const id = "019a0000-0000-7000-8000-000000000010"
const future = "2026-11-05T18:00:00.000Z"

describe("createSendBodySchema", () => {
  it("accepts a send with a null offer", () => {
    expect(
      createSendBodySchema.parse({
        name: "October relationship update",
        template_version_id: id,
        sender_id: id,
        category_id: id,
        offer_id: null,
        scheduled_for: future,
      })
    ).toMatchObject({
      template_version_id: id,
      offer_id: null,
      scheduled_for: future,
    })
  })

  it("TIME-08 rejects an invalid timestamp", () => {
    expect(
      createSendBodySchema.safeParse({
        name: "October relationship update",
        template_version_id: id,
        sender_id: id,
        category_id: id,
        scheduled_for: "tomorrow",
      }).success
    ).toBe(false)
  })

  it("TIME-09 rejects a missing scheduled time", () => {
    expect(
      createSendBodySchema.safeParse({
        name: "October relationship update",
        template_version_id: id,
        sender_id: id,
        category_id: id,
      }).success
    ).toBe(false)
  })

  it("TIME-10 rejects a numeric offset and keeps a Z timestamp", () => {
    expect(
      createSendBodySchema.safeParse({
        name: "October relationship update",
        template_version_id: id,
        sender_id: id,
        category_id: id,
        scheduled_for: "2026-11-05T18:00:00.000+00:00",
      }).success
    ).toBe(false)
    expect(
      createSendBodySchema.safeParse({
        name: "October relationship update",
        template_version_id: id,
        sender_id: id,
        category_id: id,
        scheduled_for: future,
      }).success
    ).toBe(true)
  })
})

describe("updateSendBodySchema", () => {
  it("requires version and at least one field", () => {
    expect(updateSendBodySchema.safeParse({ version: 1 }).success).toBe(false)
    expect(updateSendBodySchema.parse({ version: 1, sender_id: id })).toEqual({
      version: 1,
      sender_id: id,
    })
  })

  it("rejects a status field", () => {
    expect(
      updateSendBodySchema.safeParse({ version: 1, status: "scheduled" })
        .success
    ).toBe(false)
  })
})

describe("send list and version schemas", () => {
  it("defaults limit and keeps filters", () => {
    expect(
      sendListQuerySchema.parse({
        status: "draft",
        email_type: "thank_you",
        category_id: id,
      })
    ).toEqual({
      limit: 50,
      status: "draft",
      email_type: "thank_you",
      category_id: id,
    })
  })

  it("requires a positive version on schedule and delete", () => {
    expect(sendVersionBodySchema.parse({ version: 2 })).toEqual({ version: 2 })
    expect(sendVersionBodySchema.safeParse({}).success).toBe(false)
    expect(deleteSendQuerySchema.parse({ version: "3" })).toEqual({
      version: 3,
    })
    expect(deleteSendQuerySchema.safeParse({}).success).toBe(false)
  })
})
