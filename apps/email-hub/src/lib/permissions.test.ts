import { describe, expect, it } from "vitest"

import type { SessionUser } from "@/lib/auth"
import { canAccessAdmin, canManageUsers } from "@/lib/permissions"

function user(role: SessionUser["role"]): SessionUser {
  return {
    id: "1",
    email: "a@example.com",
    name: "A",
    role,
    twoFactorEnabled: true,
  }
}

describe("canAccessAdmin", () => {
  it("allows admin and operator", () => {
    expect(canAccessAdmin(user("admin"))).toBe(true)
    expect(canAccessAdmin(user("operator"))).toBe(true)
  })

  it("denies viewer and null", () => {
    expect(canAccessAdmin(user("viewer"))).toBe(false)
    expect(canAccessAdmin(null)).toBe(false)
  })
})

describe("canManageUsers", () => {
  it("allows only admin", () => {
    expect(canManageUsers(user("admin"))).toBe(true)
    expect(canManageUsers(user("operator"))).toBe(false)
    expect(canManageUsers(user("viewer"))).toBe(false)
    expect(canManageUsers(null)).toBe(false)
  })
})
