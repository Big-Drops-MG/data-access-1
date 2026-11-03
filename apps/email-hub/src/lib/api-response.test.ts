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

  it("maps unknown errors to internal without leaking stacks", async () => {
    const response = toErrorResponse(new Error("boom stack secret"))
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toEqual({
      error: { code: "internal", message: "Internal error", details: [] },
    })
    expect(JSON.stringify(body)).not.toContain("boom")
    expect(JSON.stringify(body)).not.toContain("stack")
  })

  it("maps postgres unique violations to conflict", async () => {
    const response = toErrorResponse(
      Object.assign(new Error("dup"), { code: "23505" })
    )
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "conflict" },
    })
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
