import { describe, expect, it } from "vitest"

import {
  AppError,
  ERROR_CODES,
  ERROR_STATUS,
  isAppError,
  isErrorCode,
} from "./errors.js"

describe("ERROR_CODES / ERROR_STATUS", () => {
  it("lists every SD#10.1 code with its status", () => {
    expect(ERROR_CODES).toEqual([
      "bad_request",
      "unauthorized",
      "forbidden",
      "not_found",
      "conflict",
      "validation_failed",
      "rate_limited",
      "internal",
      "unavailable",
    ])
    expect(ERROR_STATUS).toEqual({
      bad_request: 400,
      unauthorized: 401,
      forbidden: 403,
      not_found: 404,
      conflict: 409,
      validation_failed: 422,
      rate_limited: 429,
      internal: 500,
      unavailable: 503,
    })
  })

  it("narrows error codes", () => {
    expect(isErrorCode("not_found")).toBe(true)
    expect(isErrorCode("nope")).toBe(false)
  })
})

describe("AppError", () => {
  it("uses the canonical status and message for a code", () => {
    const error = new AppError("not_found")
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("AppError")
    expect(error.code).toBe("not_found")
    expect(error.status).toBe(404)
    expect(error.message).toBe("Not found")
    expect(error.details).toEqual([])
    expect(isAppError(error)).toBe(true)
    expect(isAppError(new Error("x"))).toBe(false)
  })

  it("accepts an explicit status and details", () => {
    const details = [{ path: "email", message: "Required" }]
    const error = new AppError("validation_failed", 422, details)
    expect(error.status).toBe(422)
    expect(error.details).toEqual(details)
    expect(error.toJSON()).toEqual({
      error: {
        code: "validation_failed",
        message: "Validation failed",
        details,
      },
    })
  })

  it("provides factories for each code", () => {
    expect(AppError.badRequest().status).toBe(400)
    expect(AppError.unauthorized().code).toBe("unauthorized")
    expect(AppError.forbidden().status).toBe(403)
    expect(AppError.notFound().code).toBe("not_found")
    expect(AppError.conflict().status).toBe(409)
    expect(
      AppError.validationFailed([{ path: "a", message: "b" }]).details
    ).toEqual([{ path: "a", message: "b" }])
    expect(AppError.rateLimited().status).toBe(429)
    expect(AppError.internal().code).toBe("internal")
    expect(AppError.unavailable().status).toBe(503)
  })
})
