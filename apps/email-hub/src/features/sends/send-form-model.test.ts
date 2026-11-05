import { describe, expect, it } from "vitest"

import {
  ALL_OFFERS_VALUE,
  buildOfferOptions,
  defaultScheduledFor,
  isScheduleLeadValid,
  sendFormSchema,
  toSendPayload,
} from "@/features/sends/send-form-model"

const id = "019a0000-0000-7000-8000-000000000010"

describe("send form model", () => {
  it("requires a name and valid ids", () => {
    const result = sendFormSchema.safeParse({
      name: "  ",
      template_version_id: id,
      category_id: id,
      sender_id: id,
      offer_id: ALL_OFFERS_VALUE,
      scheduled_for: "2026-11-05T18:00:00.000Z",
    })
    expect(result.success).toBe(false)
  })

  it("maps all offers to null in the payload", () => {
    const payload = toSendPayload({
      name: " Spring push ",
      template_version_id: id,
      category_id: id,
      sender_id: id,
      offer_id: ALL_OFFERS_VALUE,
      scheduled_for: "2026-11-05T18:00:00.000Z",
    })
    expect(payload.name).toBe("Spring push")
    expect(payload.offer_id).toBeNull()
  })

  it("enforces the 5 minute schedule lead", () => {
    const now = new Date("2026-11-05T12:00:00.000Z")
    expect(isScheduleLeadValid("2026-11-05T12:04:59.000Z", now)).toBe(false)
    expect(isScheduleLeadValid("2026-11-05T12:05:00.000Z", now)).toBe(true)
  })

  it("defaults the schedule to at least an hour ahead on a 5 minute mark", () => {
    const now = new Date("2026-11-05T12:01:00.000Z")
    expect(defaultScheduledFor(now)).toBe("2026-11-05T13:05:00.000Z")
  })

  it("always offers All offers first", () => {
    expect(buildOfferOptions([])[0]).toEqual({
      value: ALL_OFFERS_VALUE,
      label: "All offers",
    })
  })
})
