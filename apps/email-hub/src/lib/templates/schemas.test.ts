import { describe, expect, it } from "vitest"

import {
  createTemplateBodySchema,
  createTemplateVersionBodySchema,
  publishTemplateBodySchema,
  templateListQuerySchema,
  testSendTemplateBodySchema,
  updateTemplateBodySchema,
} from "./schemas"

describe("template schemas", () => {
  it("defaults list limit and accepts filters", () => {
    expect(templateListQuerySchema.parse({})).toEqual({ limit: 50 })
    expect(
      templateListQuerySchema.parse({
        limit: "10",
        status: "draft",
        email_type: "thank_you",
        category_id: "019a0000-0000-7000-8000-000000000010",
      })
    ).toMatchObject({
      limit: 10,
      status: "draft",
      email_type: "thank_you",
    })
  })

  it("rejects unknown create fields", () => {
    expect(
      createTemplateBodySchema.safeParse({
        name: "A",
        category_id: "019a0000-0000-7000-8000-000000000010",
        email_type: "thank_you",
        extra: true,
      }).success
    ).toBe(false)
  })

  it("requires at least one patch field", () => {
    expect(updateTemplateBodySchema.safeParse({}).success).toBe(false)
    expect(
      updateTemplateBodySchema.safeParse({ status: "archived" }).success
    ).toBe(true)
  })

  it("requires subject and body_source for versions", () => {
    expect(
      createTemplateVersionBodySchema.safeParse({
        subject: "Hi",
        body_source: "<p>x</p>",
      }).success
    ).toBe(true)
    expect(
      createTemplateVersionBodySchema.safeParse({ subject: "Hi" }).success
    ).toBe(false)
  })

  it("requires version_id for publish", () => {
    expect(
      publishTemplateBodySchema.safeParse({
        version_id: "019a0000-0000-7000-8000-0000000000bb",
      }).success
    ).toBe(true)
  })

  it("accepts a test-send body and rejects recipient or environment", () => {
    const versionId = "019a0000-0000-7000-8000-0000000000bb"
    expect(
      testSendTemplateBodySchema.safeParse({ version_id: versionId }).success
    ).toBe(true)
    expect(
      testSendTemplateBodySchema.safeParse({
        version_id: versionId,
        offer_id: null,
        idempotency_key: "once",
        merge_data: { first_name: "Ada" },
      }).success
    ).toBe(true)
    expect(
      testSendTemplateBodySchema.safeParse({
        version_id: versionId,
        to: "other@example.com",
      }).success
    ).toBe(false)
    expect(
      testSendTemplateBodySchema.safeParse({
        version_id: versionId,
        environment: "test",
      }).success
    ).toBe(false)
  })
})
