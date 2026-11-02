import { describe, expect, it } from "vitest"

import {
  createSenderBodySchema,
  localPartSchema,
  updateSenderBodySchema,
} from "./schemas"

describe("localPartSchema", () => {
  it("lowercases and accepts simple local parts", () => {
    expect(localPartSchema.parse("  NoReply ")).toBe("noreply")
    expect(localPartSchema.parse("support+ops")).toBe("support+ops")
  })

  it("rejects empty or invalid local parts", () => {
    expect(localPartSchema.safeParse("").success).toBe(false)
    expect(localPartSchema.safeParse(".leading").success).toBe(false)
    expect(localPartSchema.safeParse("trailing.").success).toBe(false)
    expect(localPartSchema.safeParse("has space").success).toBe(false)
  })
})

describe("createSenderBodySchema", () => {
  const domainId = "019a0000-0000-7000-8000-000000000010"

  it("accepts a valid create body and normalises reply_to", () => {
    expect(
      createSenderBodySchema.parse({
        domain_id: domainId,
        from_name: " Quotifii ",
        local_part: "Hello",
        reply_to: "  Reply@Example.COM ",
      })
    ).toEqual({
      domain_id: domainId,
      from_name: "Quotifii",
      local_part: "hello",
      reply_to: "reply@example.com",
    })
  })

  it("rejects invalid reply_to", () => {
    expect(
      createSenderBodySchema.safeParse({
        domain_id: domainId,
        from_name: "Quotifii",
        local_part: "noreply",
        reply_to: "not-an-email",
      }).success
    ).toBe(false)
  })
})

describe("updateSenderBodySchema", () => {
  it("requires version and at least one mutable field", () => {
    expect(updateSenderBodySchema.safeParse({ version: 1 }).success).toBe(false)
    expect(
      updateSenderBodySchema.parse({
        version: 2,
        status: "inactive",
      })
    ).toEqual({ version: 2, status: "inactive" })
  })

  it("rejects non-positive version", () => {
    expect(
      updateSenderBodySchema.safeParse({
        version: 0,
        from_name: "X",
      }).success
    ).toBe(false)
  })
})
