import { beforeEach, describe, expect, it, vi } from "vitest"

import { GET } from "./route.js"

const readiness = vi.hoisted(() => ({
  checkReadiness: vi.fn(),
}))

vi.mock("@/lib/readiness", () => ({
  checkReadiness: readiness.checkReadiness,
}))

describe("GET /api/ready", () => {
  beforeEach(() => {
    readiness.checkReadiness.mockReset()
  })

  it("returns ok when every dependency is reachable", async () => {
    readiness.checkReadiness.mockResolvedValue([])

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it("returns 503 naming the failing dependency", async () => {
    readiness.checkReadiness.mockResolvedValue(["redis"])

    const response = await GET()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "unavailable",
        message: "Service unavailable",
        details: [{ path: "redis", message: "unreachable" }],
      },
    })
  })

  it("names every failing dependency", async () => {
    readiness.checkReadiness.mockResolvedValue([
      "postgres",
      "redis",
      "clickhouse",
    ])

    const response = await GET()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "unavailable",
        message: "Service unavailable",
        details: [
          { path: "postgres", message: "unreachable" },
          { path: "redis", message: "unreachable" },
          { path: "clickhouse", message: "unreachable" },
        ],
      },
    })
  })
})
