import { describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api-client"

import {
  applyServerErrors,
  isValidationFailedError,
} from "./apply-server-errors"

describe("applyServerErrors", () => {
  it("maps validation_failed details onto matching field paths", () => {
    const setError = vi.fn()
    const values = { name: "", reply_to: "" }
    const error = new ApiError(
      "Validation failed",
      422,
      "validation_failed",
      "r1",
      [
        { path: "name", message: "Must be a valid FQDN" },
        { path: "unknown", message: "Nope" },
      ]
    )

    const result = applyServerErrors(error, setError, values)

    expect(result.fieldMapped).toBe(true)
    expect(setError).toHaveBeenCalledWith("name", {
      type: "server",
      message: "Must be a valid FQDN",
    })
    expect(result.unmapped).toEqual([{ path: "unknown", message: "Nope" }])
  })

  it("maps conflict details onto fields (duplicate name)", () => {
    const setError = vi.fn()
    const error = new ApiError("Conflict", 409, "conflict", "r3", [
      { path: "name", message: "A domain with this name already exists" },
    ])

    const result = applyServerErrors(error, setError, { name: "" })

    expect(result.fieldMapped).toBe(true)
    expect(setError).toHaveBeenCalledWith("name", {
      type: "server",
      message: "A domain with this name already exists",
    })
    expect(result.unmapped).toEqual([])
  })

  it("returns a root message for non-field ApiErrors", () => {
    const setError = vi.fn()
    const error = new ApiError("Forbidden", 403, "forbidden", "r2")

    const result = applyServerErrors(error, setError, { name: "" })

    expect(result.fieldMapped).toBe(false)
    expect(setError).not.toHaveBeenCalled()
    expect(result.unmapped).toEqual([{ path: "root", message: "Forbidden" }])
  })

  it("detects validation_failed ApiErrors", () => {
    expect(
      isValidationFailedError(
        new ApiError("x", 422, "validation_failed", undefined, [])
      )
    ).toBe(true)
    expect(isValidationFailedError(new ApiError("x", 409, "conflict"))).toBe(
      false
    )
  })
})
