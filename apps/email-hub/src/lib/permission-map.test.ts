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

  it("allows viewers to list domains", () => {
    expect(minRoleForStaffApi("GET", "/api/domains")).toBe("viewer")
  })

  it("maps domain writes to admin and detail reads to viewer", () => {
    expect(minRoleForStaffApi("POST", "/api/domains")).toBe("admin")
    expect(
      minRoleForStaffApi(
        "GET",
        "/api/domains/019a0000-0000-7000-8000-000000000001"
      )
    ).toBe("viewer")
    expect(
      minRoleForStaffApi(
        "PATCH",
        "/api/domains/019a0000-0000-7000-8000-000000000001"
      )
    ).toBe("admin")
    expect(
      minRoleForStaffApi(
        "DELETE",
        "/api/domains/019a0000-0000-7000-8000-000000000001"
      )
    ).toBe("admin")
  })

  it("restricts manual DNS check to admin", () => {
    expect(
      minRoleForStaffApi(
        "POST",
        "/api/domains/019a0000-0000-7000-8000-000000000001/check"
      )
    ).toBe("admin")
  })

  it("maps templates staff routes (viewer read, operator write)", () => {
    expect(minRoleForStaffApi("GET", "/api/email-categories")).toBe("viewer")
    expect(minRoleForStaffApi("GET", "/api/templates")).toBe("viewer")
    expect(minRoleForStaffApi("POST", "/api/templates")).toBe("operator")
    expect(minRoleForStaffApi("POST", "/api/templates/preview")).toBe(
      "operator"
    )
    expect(
      minRoleForStaffApi(
        "GET",
        "/api/templates/019a0000-0000-7000-8000-000000000001"
      )
    ).toBe("viewer")
    expect(
      minRoleForStaffApi(
        "PATCH",
        "/api/templates/019a0000-0000-7000-8000-000000000001"
      )
    ).toBe("operator")
    expect(
      minRoleForStaffApi(
        "POST",
        "/api/templates/019a0000-0000-7000-8000-000000000001/versions"
      )
    ).toBe("operator")
    expect(
      minRoleForStaffApi(
        "POST",
        "/api/templates/019a0000-0000-7000-8000-000000000001/publish"
      )
    ).toBe("operator")
    expect(
      minRoleForStaffApi(
        "PUT",
        "/api/templates/019a0000-0000-7000-8000-000000000001/versions"
      )
    ).toBeNull()
  })

  it("maps senders staff routes (viewer read, operator write)", () => {
    expect(minRoleForStaffApi("GET", "/api/senders")).toBe("viewer")
    expect(minRoleForStaffApi("POST", "/api/senders")).toBe("operator")
    expect(
      minRoleForStaffApi(
        "GET",
        "/api/senders/019a0000-0000-7000-8000-000000000001"
      )
    ).toBe("viewer")
    expect(
      minRoleForStaffApi(
        "PATCH",
        "/api/senders/019a0000-0000-7000-8000-000000000001"
      )
    ).toBe("operator")
    expect(
      minRoleForStaffApi(
        "DELETE",
        "/api/senders/019a0000-0000-7000-8000-000000000001"
      )
    ).toBeNull()
  })

  it("maps email route staff routes (viewer read, operator write)", () => {
    expect(minRoleForStaffApi("GET", "/api/email-routes")).toBe("viewer")
    expect(minRoleForStaffApi("POST", "/api/email-routes")).toBe("operator")
    expect(
      minRoleForStaffApi(
        "GET",
        "/api/email-routes/019a0000-0000-7000-8000-000000000001"
      )
    ).toBe("viewer")
    expect(
      minRoleForStaffApi(
        "PATCH",
        "/api/email-routes/019a0000-0000-7000-8000-000000000001"
      )
    ).toBe("operator")
    expect(
      minRoleForStaffApi(
        "DELETE",
        "/api/email-routes/019a0000-0000-7000-8000-000000000001"
      )
    ).toBeNull()
    expect(
      minRoleForStaffApi(
        "POST",
        "/api/email-routes/019a0000-0000-7000-8000-000000000001/archive"
      )
    ).toBe("operator")
    expect(
      minRoleForStaffApi(
        "GET",
        "/api/email-routes/019a0000-0000-7000-8000-000000000001/archive"
      )
    ).toBeNull()
  })

  it("maps send staff routes (viewer read, operator write)", () => {
    const id = "019a0000-0000-7000-8000-000000000001"
    expect(minRoleForStaffApi("GET", "/api/sends")).toBe("viewer")
    expect(minRoleForStaffApi("POST", "/api/sends")).toBe("operator")
    expect(minRoleForStaffApi("GET", `/api/sends/${id}`)).toBe("viewer")
    expect(minRoleForStaffApi("PATCH", `/api/sends/${id}`)).toBe("operator")
    expect(minRoleForStaffApi("DELETE", `/api/sends/${id}`)).toBe("operator")
    expect(minRoleForStaffApi("POST", `/api/sends/${id}/schedule`)).toBe(
      "operator"
    )
    expect(minRoleForStaffApi("POST", `/api/sends/${id}/cancel`)).toBe(
      "operator"
    )
    expect(minRoleForStaffApi("GET", `/api/sends/${id}/schedule`)).toBeNull()
    expect(minRoleForStaffApi("DELETE", "/api/sends")).toBeNull()
  })

  it("maps suppression routes (viewer read, operator add, admin remove)", () => {
    const id = "019a0000-0000-7000-8000-000000000001"
    expect(minRoleForStaffApi("GET", "/api/suppressions")).toBe("viewer")
    expect(minRoleForStaffApi("POST", "/api/suppressions")).toBe("operator")
    expect(minRoleForStaffApi("POST", `/api/suppressions/${id}/remove`)).toBe(
      "admin"
    )
    expect(
      minRoleForStaffApi("GET", `/api/suppressions/${id}/remove`)
    ).toBeNull()
    expect(minRoleForStaffApi("DELETE", `/api/suppressions/${id}`)).toBeNull()
    expect(minRoleForStaffApi("POST", "/api/suppressions/remove")).toBeNull()
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
