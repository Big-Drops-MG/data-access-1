import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const getDomain = vi.hoisted(() => vi.fn())
const updateDomainStatus = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/domains/service", () => ({
  getDomain,
  updateDomainStatus,
}))

import { GET, PATCH } from "./route"

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

const domainId = "019a0000-0000-7000-8000-0000000000aa"

describe("GET/PATCH /api/domains/{id}", () => {
  beforeEach(() => {
    getSession.mockReset()
    getDomain.mockReset()
    updateDomainStatus.mockReset()
  })

  it("returns detail for a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    getDomain.mockResolvedValue({
      id: domainId,
      name: "e.example.com",
      status: "pending",
      dns_records: [],
      setup_steps: [],
    })
    const response = await GET(
      new Request(`http://localhost/api/domains/${domainId}`),
      { params: Promise.resolve({ id: domainId }) }
    )
    expect(response.status).toBe(200)
    expect(getDomain).toHaveBeenCalledWith(domainId)
  })

  it("rejects operator on patch (admin-only)", async () => {
    getSession.mockResolvedValue(session("operator"))
    const response = await PATCH(
      new Request(`http://localhost/api/domains/${domainId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "inactive" }),
      }),
      { params: Promise.resolve({ id: domainId }) }
    )
    expect(response.status).toBe(403)
  })

  it("patches status for an admin", async () => {
    getSession.mockResolvedValue(session("admin"))
    updateDomainStatus.mockResolvedValue({
      id: domainId,
      name: "e.example.com",
      status: "inactive",
    })
    const response = await PATCH(
      new Request(`http://localhost/api/domains/${domainId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-1",
        },
        body: JSON.stringify({ status: "inactive" }),
      }),
      { params: Promise.resolve({ id: domainId }) }
    )
    expect(response.status).toBe(200)
    expect(updateDomainStatus).toHaveBeenCalledWith(domainId, "inactive", {
      userId: session("admin").id,
      requestId: "req-1",
    })
  })

  it("rejects invalid domain id", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await GET(
      new Request("http://localhost/api/domains/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    )
    expect(response.status).toBe(422)
  })
})
