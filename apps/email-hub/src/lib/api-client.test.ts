import { describe, expect, it } from "vitest"

import { ApiError, apiFetch } from "./api-client.js"

describe("ApiError", () => {
  it("stores status code and optional fields", () => {
    const error = new ApiError("Nope", 422, "validation_failed", "req_1")
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("ApiError")
    expect(error.message).toBe("Nope")
    expect(error.status).toBe(422)
    expect(error.code).toBe("validation_failed")
    expect(error.requestId).toBe("req_1")
  })
})

describe("apiFetch", () => {
  it("is not implemented yet", async () => {
    await expect(apiFetch("/api/health")).rejects.toThrow(
      "apiFetch is not implemented yet"
    )
  })
})
