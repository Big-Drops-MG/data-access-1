import { describe, expect, it } from "vitest"

import { alertIdParamSchema, alertListQuerySchema } from "./schemas"

const cursor = "019a0000-0000-7000-8000-0000000000aa"

describe("alertListQuerySchema", () => {
  it("defaults the page size and accepts filters", () => {
    expect(
      alertListQuerySchema.parse({
        status: "open",
        severity: "critical",
        type: " send_late ",
        cursor,
      })
    ).toEqual({
      limit: 50,
      status: "open",
      severity: "critical",
      type: "send_late",
      cursor,
    })
  })

  it("rejects unknown keys, a bad cursor, and an oversized page", () => {
    expect(alertListQuerySchema.safeParse({ sort: "id" }).success).toBe(false)
    expect(alertListQuerySchema.safeParse({ cursor: "abc" }).success).toBe(
      false
    )
    expect(alertListQuerySchema.safeParse({ limit: 201 }).success).toBe(false)
    expect(alertListQuerySchema.safeParse({ status: "closed" }).success).toBe(
      false
    )
    expect(alertListQuerySchema.safeParse({ type: " " }).success).toBe(false)
  })
})

describe("alertIdParamSchema", () => {
  it("accepts a uuidv7 and rejects anything else", () => {
    expect(alertIdParamSchema.parse(cursor)).toBe(cursor)
    expect(alertIdParamSchema.safeParse("not-an-id").success).toBe(false)
  })
})
