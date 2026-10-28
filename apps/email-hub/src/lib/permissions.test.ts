import { describe, expect, it } from "vitest"

import type { SessionUser } from "@/lib/auth"
import {
  canAccessAdmin,
  canManageUsers,
  canWriteStaff,
  hasAtLeastRole,
  isAppRole,
  ROLE_RANK,
} from "@/lib/permissions"

function user(role: SessionUser["role"]): SessionUser {
  return {
    id: "1",
    email: "a@example.com",
    name: "A",
    image: null,
    role,
    jobTitle: "Web Developer",
    twoFactorEnabled: true,
  }
}

describe("ROLE_RANK / hasAtLeastRole", () => {
  it("orders viewer < operator < admin", () => {
    expect(ROLE_RANK.viewer).toBeLessThan(ROLE_RANK.operator)
    expect(ROLE_RANK.operator).toBeLessThan(ROLE_RANK.admin)
  })

  it("denies null and under-privileged roles", () => {
    expect(hasAtLeastRole(null, "viewer")).toBe(false)
    expect(hasAtLeastRole(user("viewer"), "operator")).toBe(false)
    expect(hasAtLeastRole(user("operator"), "admin")).toBe(false)
  })

  it("allows equal and higher roles", () => {
    expect(hasAtLeastRole(user("viewer"), "viewer")).toBe(true)
    expect(hasAtLeastRole(user("operator"), "viewer")).toBe(true)
    expect(hasAtLeastRole(user("admin"), "operator")).toBe(true)
    expect(hasAtLeastRole(user("admin"), "admin")).toBe(true)
  })

  it("recognises app roles", () => {
    expect(isAppRole("viewer")).toBe(true)
    expect(isAppRole("guest")).toBe(false)
  })
})

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

describe("canWriteStaff", () => {
  it("denies viewers on writes", () => {
    expect(canWriteStaff(user("viewer"))).toBe(false)
    expect(canWriteStaff(user("operator"))).toBe(true)
    expect(canWriteStaff(user("admin"))).toBe(true)
    expect(canWriteStaff(null)).toBe(false)
  })
})
