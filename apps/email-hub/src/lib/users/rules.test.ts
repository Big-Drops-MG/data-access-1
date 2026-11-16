import { describe, expect, it } from "vitest"

import { isActiveAdmin, isSameUser, removalLeavesNoActiveAdmin } from "./rules"

describe("user admin rules", () => {
  it("treats only active admins as active admins", () => {
    expect(isActiveAdmin({ role: "admin", status: "active" })).toBe(true)
    expect(isActiveAdmin({ role: "admin", status: "deactivated" })).toBe(false)
    expect(isActiveAdmin({ role: "operator", status: "active" })).toBe(false)
  })

  it("blocks a removal that would leave zero active admins", () => {
    expect(
      removalLeavesNoActiveAdmin({
        targetIsActiveAdmin: true,
        activeAdminCount: 1,
      })
    ).toBe(true)
    expect(
      removalLeavesNoActiveAdmin({
        targetIsActiveAdmin: true,
        activeAdminCount: 2,
      })
    ).toBe(false)
    expect(
      removalLeavesNoActiveAdmin({
        targetIsActiveAdmin: false,
        activeAdminCount: 1,
      })
    ).toBe(false)
  })

  it("matches a user to themselves regardless of id case", () => {
    expect(
      isSameUser(
        "019A0000-0000-7000-8000-000000000001",
        "019a0000-0000-7000-8000-000000000001"
      )
    ).toBe(true)
    expect(
      isSameUser(
        "019a0000-0000-7000-8000-000000000001",
        "019a0000-0000-7000-8000-000000000002"
      )
    ).toBe(false)
  })
})
