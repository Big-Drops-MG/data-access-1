import { describe, expect, it } from "vitest"

import {
  createApiClientBodySchema,
  updateApiClientAllowlistBodySchema,
  updateApiClientScopesBodySchema,
} from "./schemas"

describe("API client request schemas", () => {
  it("accepts a name, known scopes, and exact IP addresses", () => {
    const parsed = createApiClientBodySchema.parse({
      name: " Billing ",
      scopes: ["emails:read", "emails:send"],
      ip_allowlist: ["203.0.113.10", "::1"],
    })
    expect(parsed.name).toBe("Billing")
    expect(parsed.scopes).toEqual(["emails:read", "emails:send"])
  })

  it("rejects unknown scopes and invalid CIDR", () => {
    expect(
      createApiClientBodySchema.safeParse({
        name: "Billing",
        scopes: ["admin"],
      }).success
    ).toBe(false)
    expect(
      updateApiClientScopesBodySchema.safeParse({ scopes: ["emails:send"] })
        .success
    ).toBe(true)
    const cidr = updateApiClientAllowlistBodySchema.safeParse({
      ip_allowlist: ["10.0.0.0/8"],
    })
    expect(cidr.success).toBe(false)
    const bad = updateApiClientAllowlistBodySchema.safeParse({
      ip_allowlist: ["2001:db8::/129"],
    })
    expect(bad.success).toBe(false)
  })
})
