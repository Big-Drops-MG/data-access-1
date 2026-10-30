import { describe, expect, it } from "vitest"
import { z } from "zod"

import { AppError } from "@workspace/shared"

import { parseJsonBody, parseOrThrow, zodIssuesToDetails } from "./zod-parse"

describe("zod-parse", () => {
  it("maps zod issues to details", () => {
    const result = z.object({ name: z.string() }).safeParse({})
    expect(result.success).toBe(false)
    if (result.success) return
    expect(zodIssuesToDetails(result.error)).toEqual([
      expect.objectContaining({ path: "name" }),
    ])
  })

  it("parseOrThrow returns data or throws validation_failed", () => {
    const schema = z.object({ n: z.number() }).strict()
    expect(parseOrThrow(schema, { n: 1 })).toEqual({ n: 1 })
    expect(() => parseOrThrow(schema, { n: "x" })).toThrow(AppError)
  })

  it("parseJsonBody accepts JSON and rejects invalid bodies", async () => {
    await expect(
      parseJsonBody(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ a: 1 }),
          headers: { "content-type": "application/json" },
        })
      )
    ).resolves.toEqual({ a: 1 })

    await expect(
      parseJsonBody(
        new Request("http://localhost", {
          method: "POST",
          body: "{",
          headers: { "content-type": "application/json" },
        })
      )
    ).rejects.toMatchObject({ code: "bad_request", status: 400 })
  })
})
