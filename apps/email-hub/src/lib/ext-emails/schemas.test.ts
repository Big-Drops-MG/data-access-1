import { describe, expect, it } from "vitest"

import { AppError } from "@workspace/shared"

import {
  EXT_EMAIL_MAX_BODY_BYTES,
  messageIdParamSchema,
  parseExtJsonBody,
  sendEmailBodySchema,
} from "./schemas"

const offerId = "019a0000-0000-7000-8000-000000000010"

describe("sendEmailBodySchema", () => {
  it("accepts a send body and lowercases the recipient", () => {
    const parsed = sendEmailBodySchema.parse({
      to: " Person@Example.COM ",
      email_type: "thank_you",
      idempotency_key: " order-1 ",
      offer_id: offerId,
      external_user_id: " user-1 ",
      merge_data: { first_name: "Alex", count: 2, premium: true },
    })

    expect(parsed.to).toBe("person@example.com")
    expect(parsed.idempotency_key).toBe("order-1")
    expect(parsed.external_user_id).toBe("user-1")
  })

  it("rejects unknown fields and a bad email type", () => {
    expect(
      sendEmailBodySchema.safeParse({
        to: "a@example.com",
        email_type: "thank_you",
        idempotency_key: "k",
        template_version_id: offerId,
      }).success
    ).toBe(false)
    expect(
      sendEmailBodySchema.safeParse({
        to: "a@example.com",
        email_type: "newsletter",
        idempotency_key: "k",
      }).success
    ).toBe(false)
  })
})

describe("messageIdParamSchema", () => {
  it("accepts a uuid v7 and rejects other ids", () => {
    expect(messageIdParamSchema.safeParse(offerId).success).toBe(true)
    expect(messageIdParamSchema.safeParse("not-a-uuid").success).toBe(false)
  })
})

describe("parseExtJsonBody", () => {
  it("rejects an empty body, invalid JSON, and an oversized body", () => {
    expect(() => parseExtJsonBody(Buffer.from(""))).toThrow(AppError)
    expect(() => parseExtJsonBody(Buffer.from("{"))).toThrow(
      expect.objectContaining({ code: "bad_request", status: 400 })
    )
    expect(() =>
      parseExtJsonBody(Buffer.alloc(EXT_EMAIL_MAX_BODY_BYTES + 1, 0x7b))
    ).toThrow(expect.objectContaining({ code: "bad_request", status: 413 }))
  })
})
