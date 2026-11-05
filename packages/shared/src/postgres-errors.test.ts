import { describe, expect, it } from "vitest"

import { AppError } from "./errors.js"
import {
  appErrorFromPostgresConstraint,
  getPostgresErrorCode,
  isForeignKeyViolation,
  isUniqueViolation,
} from "./postgres-errors.js"

describe("postgres-errors", () => {
  it("reads SQLSTATE from the error and its cause chain", () => {
    expect(getPostgresErrorCode({ code: "23505" })).toBe("23505")
    expect(
      getPostgresErrorCode({
        message: "wrapped",
        cause: { code: "23503" },
      })
    ).toBe("23503")
  })

  it("maps unique and foreign-key violations to conflict", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true)
    expect(isForeignKeyViolation({ code: "23503" })).toBe(true)

    const unique = appErrorFromPostgresConstraint({ code: "23505" })
    expect(unique).toBeInstanceOf(AppError)
    expect(unique?.code).toBe("conflict")
    expect(unique?.status).toBe(409)

    const fk = appErrorFromPostgresConstraint({
      cause: { code: "23503" },
    })
    expect(fk?.code).toBe("conflict")
  })

  it("maps the send edit-lock trigger to conflict", () => {
    const locked = appErrorFromPostgresConstraint({
      message: "Failed query: update send",
      cause: {
        code: "P0001",
        message: "send can only be edited while status is draft",
      },
    })
    expect(locked).toBeInstanceOf(AppError)
    expect(locked?.status).toBe(409)
    expect(locked?.code).toBe("conflict")
    expect(locked?.details).toEqual([
      { path: "status", message: "Send configuration is locked" },
    ])
  })

  it("leaves other errors unmapped", () => {
    expect(appErrorFromPostgresConstraint(new Error("boom"))).toBeNull()
    expect(appErrorFromPostgresConstraint({ code: "42P01" })).toBeNull()
    expect(
      appErrorFromPostgresConstraint({
        code: "P0001",
        message: "audit_log is append-only",
      })
    ).toBeNull()
  })
})
