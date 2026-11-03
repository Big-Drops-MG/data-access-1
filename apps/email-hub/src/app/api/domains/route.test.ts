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
    listDomains.mockResolvedValue({
      data: [],
      next_cursor: null,
      status_counts: {
        all: 0,
        pending: 0,
        verifying: 0,
        verified: 0,
        failed: 0,
        inactive: 0,
      },
    })
    const response = await GET(new Request("http://localhost/api/domains"))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [],
      next_cursor: null,
      status_counts: {
        all: 0,
        pending: 0,
        verifying: 0,
        verified: 0,
        failed: 0,
        inactive: 0,
      },
    })
  })

  it("rejects operator on create (admin-only writes)", async () => {
    getSession.mockResolvedValue(session("operator"))
    const response = await POST(
      new Request("http://localhost/api/domains", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-403",
        },
        body: JSON.stringify({ name: "e.quotifii.com" }),
      })
    )
    expect(response.status).toBe(403)
    expect(response.headers.get("x-request-id")).toBe("req-403")
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
        body: JSON.stringify({
          name: "E.Quotifii.COM",
          mail_from_subdomain: "Bounce",
        }),
      })
    )
    expect(response.status).toBe(201)
    expect(response.headers.get("x-request-id")).toBe("req-1")
    expect(createDomain).toHaveBeenCalledWith(
      { name: "e.quotifii.com", mailFromSubdomain: "bounce" },
      {
        userId: session("admin").id,
        requestId: "req-1",
      }
    )
  })

  it("rejects an invalid MAIL FROM subdomain", async () => {
    getSession.mockResolvedValue(session("admin"))
    const response = await POST(
      new Request("http://localhost/api/domains", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "e.quotifii.com",
          mail_from_subdomain: "a.b",
        }),
      })
    )
    expect(response.status).toBe(422)
    expect(createDomain).not.toHaveBeenCalled()
  })

  it("rejects machine auth headers", async () => {
    const response = await GET(
      new Request("http://localhost/api/domains", {
        headers: { "x-key-id": "k1", "x-request-id": "req-401" },
      })
    )
    expect(response.status).toBe(401)
    expect(response.headers.get("x-request-id")).toBe("req-401")
  })

  it("returns the request id on a validation error", async () => {
    getSession.mockResolvedValue(session("admin"))
    const response = await POST(
      new Request("http://localhost/api/domains", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-422",
        },
        body: JSON.stringify({ name: "not a domain" }),
      })
    )
    expect(response.status).toBe(422)
    expect(response.headers.get("x-request-id")).toBe("req-422")
  })

  it("returns the request id on an unexpected server error", async () => {
    getSession.mockResolvedValue(session("viewer"))
    listDomains.mockRejectedValue(new Error("synthetic database failure"))
    const response = await GET(
      new Request("http://localhost/api/domains", {
        headers: { "x-request-id": "req-500" },
      })
    )
    expect(response.status).toBe(500)
    expect(response.headers.get("x-request-id")).toBe("req-500")
    const body = (await response.json()) as { error: { message: string } }
    expect(body.error.message).toBe("Internal error")
    expect(JSON.stringify(body)).not.toContain("synthetic database failure")
  })
})
