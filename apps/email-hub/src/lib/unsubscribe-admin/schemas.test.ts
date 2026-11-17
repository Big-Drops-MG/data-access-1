import { describe, expect, it } from "vitest"

import {
  optOutListQuerySchema,
  patchUnsubscribeSettingsBodySchema,
} from "./schemas"

describe("optOutListQuerySchema", () => {
  it("applies defaults for limit and scope", () => {
    expect(optOutListQuerySchema.parse({})).toEqual({
      limit: 50,
      scope: "all_types",
    })
  })

  it("accepts filters and rejects invalid values", () => {
    expect(
      optOutListQuerySchema.parse({
        limit: "10",
        cursor: "abc",
        q: "ada",
        scope: "category",
      })
    ).toEqual({
      limit: 10,
      cursor: "abc",
      q: "ada",
      scope: "category",
    })
    expect(optOutListQuerySchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(optOutListQuerySchema.safeParse({ scope: "nope" }).success).toBe(
      false
    )
  })
})

describe("patchUnsubscribeSettingsBodySchema", () => {
  it("requires at least one field", () => {
    expect(patchUnsubscribeSettingsBodySchema.safeParse({}).success).toBe(false)
  })

  it("accepts https logo urls and hostnames", () => {
    expect(
      patchUnsubscribeSettingsBodySchema.parse({
        logo_url: "https://cdn.example.com/logo.png",
        custom_domain: "unsub.example.com",
      })
    ).toEqual({
      logo_url: "https://cdn.example.com/logo.png",
      custom_domain: "unsub.example.com",
    })
  })

  it("rejects http logos and invalid hostnames", () => {
    expect(
      patchUnsubscribeSettingsBodySchema.safeParse({
        logo_url: "http://cdn.example.com/logo.png",
      }).success
    ).toBe(false)
    expect(
      patchUnsubscribeSettingsBodySchema.safeParse({
        custom_domain: "not a host",
      }).success
    ).toBe(false)
  })

  it("allows clearing logo and domain with null", () => {
    expect(
      patchUnsubscribeSettingsBodySchema.parse({
        logo_url: null,
        custom_domain: null,
      })
    ).toEqual({ logo_url: null, custom_domain: null })
  })
})
