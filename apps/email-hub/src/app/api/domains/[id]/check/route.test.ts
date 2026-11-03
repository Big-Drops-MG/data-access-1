import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const checkDomainDns = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/domains/service", () => ({
  checkDomainDns,
}))

import { POST } from "./route"

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

describe("POST /api/domains/{id}/check", () => {
  beforeEach(() => {
    getSession.mockReset()
    checkDomainDns.mockReset()
  })

  it("rejects operator (admin-only)", async () => {
    getSession.mockResolvedValue(session("operator"))
    const response = await POST(
      new Request(`http://localhost/api/domains/${domainId}/check`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: domainId }) }
    )
    expect(response.status).toBe(403)
  })

  it("checks DNS for an admin", async () => {
    getSession.mockResolvedValue(session("admin"))
    checkDomainDns.mockResolvedValue({
      id: domainId,
      name: "send.example.com",
      status: "pending",
      dns_records: [],
      setup_steps: [],
      sender_count: 0,
      ses_region: "us-east-1",
      last_checked_at: null,
    })
    const response = await POST(
      new Request(`http://localhost/api/domains/${domainId}/check`, {
        method: "POST",
        headers: { "x-request-id": "req-check" },
      }),
      { params: Promise.resolve({ id: domainId }) }
    )
    expect(response.status).toBe(200)
    expect(checkDomainDns).toHaveBeenCalledWith(domainId, {
      userId: session("admin").id,
      requestId: "req-check",
    })
  })
})
