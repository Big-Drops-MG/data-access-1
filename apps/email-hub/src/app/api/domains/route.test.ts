import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth", () => ({ getSession }))

import { GET } from "./route"

function session(role: "viewer" | "operator" | "admin") {
  return {
    id: "u1",
    email: "a@example.com",
    name: "A",
    image: null,
    role,
    jobTitle: "Web Developer",
    twoFactorEnabled: true,
  }
}

describe("GET /api/domains", () => {
  beforeEach(() => {
    getSession.mockReset()
  })

  it("returns an empty list for a viewer session", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await GET(new Request("http://localhost/api/domains"))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [],
      next_cursor: null,
    })
  })

  it("rejects machine auth headers", async () => {
    const response = await GET(
      new Request("http://localhost/api/domains", {
        headers: { "x-key-id": "k1" },
      })
    )
    expect(response.status).toBe(401)
  })

  it("rejects unauthenticated callers", async () => {
    getSession.mockResolvedValue(null)
    const response = await GET(new Request("http://localhost/api/domains"))
    expect(response.status).toBe(401)
  })
})
