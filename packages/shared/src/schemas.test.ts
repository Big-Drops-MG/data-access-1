import { describe, expect, it } from "vitest"

import {
  emailSchema,
  isoUtcTimestampSchema,
  paginationSchema,
  uuidSchema,
} from "./schemas.js"

describe("uuidSchema", () => {
  it("accepts lowercase uuid v7", () => {
    expect(uuidSchema.parse("0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44")).toBe(
      "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44"
    )
  })

  it("lowercases input", () => {
    expect(uuidSchema.parse("0192F6C0-7A3E-7C1E-9D2B-3F6A5B8C1D44")).toBe(
      "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44"
    )
  })

  it("rejects non-v7 uuids", () => {
    expect(
      uuidSchema.safeParse("550e8400-e29b-41d4-a716-446655440000").success
    ).toBe(false)
  })
})

describe("emailSchema", () => {
  it("trims and lowercases", () => {
    expect(emailSchema.parse("  Jane.Doe@Example.COM ")).toBe(
      "jane.doe@example.com"
    )
  })

  it("rejects invalid emails", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false)
  })
})

describe("isoUtcTimestampSchema", () => {
  it("accepts ISO UTC with Z", () => {
    expect(isoUtcTimestampSchema.parse("2026-10-07T14:03:11.482Z")).toBe(
      "2026-10-07T14:03:11.482Z"
    )
  })

  it("rejects offsets and local datetimes", () => {
    expect(
      isoUtcTimestampSchema.safeParse("2026-10-07T14:03:11.482+00:00").success
    ).toBe(false)
    expect(isoUtcTimestampSchema.safeParse("2026-10-07T14:03:11").success).toBe(
      false
    )
  })
})

describe("paginationSchema", () => {
  it("defaults limit to 50", () => {
    expect(paginationSchema.parse({})).toEqual({ limit: 50 })
  })

  it("coerces limit and accepts cursor", () => {
    expect(paginationSchema.parse({ limit: "100", cursor: "abc" })).toEqual({
      limit: 100,
      cursor: "abc",
    })
  })

  it("rejects limit above 200 and unknown fields", () => {
    expect(paginationSchema.safeParse({ limit: 201 }).success).toBe(false)
    expect(
      paginationSchema.safeParse({ limit: 50, unexpected: true }).success
    ).toBe(false)
  })
})
