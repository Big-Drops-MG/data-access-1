import { AppError } from "@workspace/shared"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { handler } from "./handler"

describe("handler()", () => {
  it("returns success bodies with an x-request-id", async () => {
    const GET = handler(async () => Response.json({ ok: true }))
    const response = await GET(
      new Request("http://localhost/api/demo", {
        headers: { "x-request-id": "req-ok" },
      })
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("x-request-id")).toBe("req-ok")
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it("maps AppError, ZodError, and unique violations without stacks", async () => {
    const cases: Array<{
      name: string
      throwValue: unknown
      status: number
      code: string
    }> = [
      {
        name: "app",
        throwValue: AppError.notFound(),
        status: 404,
        code: "not_found",
      },
      {
        name: "zod",
        throwValue: (() => {
          try {
            z.object({ email: z.string().email() }).parse({ email: 1 })
          } catch (error) {
            return error
          }
          return new Error("expected zod failure")
        })(),
        status: 422,
        code: "validation_failed",
      },
      {
        name: "unique",
        throwValue: Object.assign(new Error("dup"), { code: "23505" }),
        status: 409,
        code: "conflict",
      },
      {
        name: "fk",
        throwValue: { cause: { code: "23503" } },
        status: 409,
        code: "conflict",
      },
      {
        name: "unknown",
        throwValue: new Error("synthetic boom with stack"),
        status: 500,
        code: "internal",
      },
    ]

    for (const testCase of cases) {
      const GET = handler(async () => {
        throw testCase.throwValue
      })
      const response = await GET(
        new Request("http://localhost/api/demo", {
          headers: { "x-request-id": `req-${testCase.name}` },
        })
      )
      expect(response.status).toBe(testCase.status)
      expect(response.headers.get("x-request-id")).toBe(`req-${testCase.name}`)
      const body = (await response.json()) as {
        error: { code: string; message: string }
      }
      expect(body.error.code).toBe(testCase.code)
      const raw = JSON.stringify(body)
      expect(raw).not.toContain("stack")
      expect(raw).not.toContain("synthetic boom")
    }
  })
})
