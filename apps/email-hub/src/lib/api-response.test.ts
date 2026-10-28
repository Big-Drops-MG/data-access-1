import { describe, expect, it } from "vitest"

import { AppError } from "@workspace/shared"

import { jsonAppError, jsonForRole, toErrorResponse } from "@/lib/api-response"

describe("api-response helpers", () => {
  it("serializes AppError bodies", async () => {
    const response = jsonAppError(AppError.forbidden())
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: { code: "forbidden", message: "Forbidden", details: [] },
    })
  })

  it("maps unknown errors to internal", async () => {
    const response = toErrorResponse(new Error("boom"))
    expect(response.status).toBe(500)
  })

  it("masks emails for viewer JSON responses", async () => {
    const response = jsonForRole("viewer", { email: "jane@example.com" })
    await expect(response.json()).resolves.toEqual({
      email: "ja***@example.com",
    })
  })

  it("does not mask emails for operators", async () => {
    const response = jsonForRole("operator", { email: "jane@example.com" })
    await expect(response.json()).resolves.toEqual({
      email: "jane@example.com",
    })
  })
})
