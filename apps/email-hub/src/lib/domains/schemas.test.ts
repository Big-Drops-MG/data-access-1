import { describe, expect, it } from "vitest"

import {
  createDomainBodySchema,
  domainListQuerySchema,
  fqdnSchema,
  updateDomainBodySchema,
} from "./schemas"

describe("fqdnSchema", () => {
  it("lowercases and accepts a multi-label host", () => {
    expect(fqdnSchema.parse("E.Quotifii.COM")).toBe("e.quotifii.com")
  })

  it("rejects bare labels and invalid hosts", () => {
    expect(fqdnSchema.safeParse("localhost").success).toBe(false)
    expect(fqdnSchema.safeParse("-bad.com").success).toBe(false)
    expect(fqdnSchema.safeParse("not a domain").success).toBe(false)
  })
})

describe("domain schemas", () => {
  it("defaults list limit", () => {
    expect(domainListQuerySchema.parse({})).toEqual({ limit: 50 })
  })

  it("requires name for create", () => {
    expect(
      createDomainBodySchema.safeParse({ name: "mail.example.com" }).success
    ).toBe(true)
    expect(createDomainBodySchema.safeParse({}).success).toBe(false)
  })

  it("requires status for patch", () => {
    expect(
      updateDomainBodySchema.safeParse({ status: "inactive" }).success
    ).toBe(true)
    expect(updateDomainBodySchema.safeParse({}).success).toBe(false)
  })
})
