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

  it("leaves other errors unmapped", () => {
    expect(appErrorFromPostgresConstraint(new Error("boom"))).toBeNull()
    expect(appErrorFromPostgresConstraint({ code: "42P01" })).toBeNull()
  })
})
