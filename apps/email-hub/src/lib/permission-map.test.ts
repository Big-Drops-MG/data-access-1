import { describe, expect, it } from "vitest"

import { isWriteMethod, minRoleForStaffApi } from "@/lib/permission-map"

describe("minRoleForStaffApi", () => {
  it("returns admin for the 2FA reset route", () => {
    expect(
      minRoleForStaffApi(
        "POST",
        "/api/admin/users/019a0000-0000-7000-8000-000000000001/two-factor/reset"
      )
    ).toBe("admin")
  })

  it("denies unmapped routes by default", () => {
    expect(minRoleForStaffApi("GET", "/api/admin/users")).toBeNull()
    expect(minRoleForStaffApi("POST", "/api/unknown")).toBeNull()
  })

  it("is method-sensitive", () => {
    expect(
      minRoleForStaffApi(
        "GET",
        "/api/admin/users/019a0000-0000-7000-8000-000000000001/two-factor/reset"
      )
    ).toBeNull()
  })
})

describe("isWriteMethod", () => {
  it("treats mutating verbs as writes", () => {
    expect(isWriteMethod("POST")).toBe(true)
    expect(isWriteMethod("patch")).toBe(true)
    expect(isWriteMethod("GET")).toBe(false)
    expect(isWriteMethod("HEAD")).toBe(false)
  })
})
