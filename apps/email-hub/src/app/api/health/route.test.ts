import { describe, expect, it } from "vitest"

import { GET } from "./route"

describe("GET /api/health", () => {
  it("returns the incoming request id", async () => {
    const response = await GET(
      new Request("http://localhost/api/health", {
        headers: { "x-request-id": "req-health" },
      })
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("x-request-id")).toBe("req-health")
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it("generates an id when the header is missing", async () => {
    const response = await GET(new Request("http://localhost/api/health"))
    expect(response.status).toBe(200)
    expect(response.headers.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
  })
})
