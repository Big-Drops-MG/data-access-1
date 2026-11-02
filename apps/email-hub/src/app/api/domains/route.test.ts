import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const listDomains = vi.hoisted(() => vi.fn())
const createDomain = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/domains/service", () => ({
  listDomains,
  createDomain,
}))

import { GET, POST } from "./route"

function session(role: "viewer" | "operator" | "admin") {
  return {
    id: "019a0000-0000-7000-8000-000000000001",
    email: "a@example.com",
    name: "A",
    image: null,
    role,
    jobTitle: "Web Developer",
    twoFactorEnabled: true,
  }
}

describe("GET/POST /api/domains", () => {
  beforeEach(() => {
    getSession.mockReset()
    listDomains.mockReset()
    createDomain.mockReset()
  })

  it("lists for a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    listDomains.mockResolvedValue({ data: [], next_cursor: null })
    const response = await GET(new Request("http://localhost/api/domains"))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [],
      next_cursor: null,
    })
  })

  it("rejects operator on create (admin-only writes)", async () => {
    getSession.mockResolvedValue(session("operator"))
    const response = await POST(
      new Request("http://localhost/api/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "e.quotifii.com" }),
      })
    )
    expect(response.status).toBe(403)
  })

  it("creates for an admin", async () => {
    getSession.mockResolvedValue(session("admin"))
    createDomain.mockResolvedValue({
      id: "019a0000-0000-7000-8000-000000000099",
      name: "e.quotifii.com",
      status: "pending",
      dns_records: [],
      setup_steps: [],
    })
    const response = await POST(
      new Request("http://localhost/api/domains", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-1",
        },
        body: JSON.stringify({ name: "E.Quotifii.COM" }),
      })
    )
    expect(response.status).toBe(201)
    expect(createDomain).toHaveBeenCalledWith("e.quotifii.com", {
      userId: session("admin").id,
      requestId: "req-1",
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
})
