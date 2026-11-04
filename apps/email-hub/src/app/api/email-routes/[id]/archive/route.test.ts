import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const archiveEmailRoute = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/email-routes/service", () => ({
  archiveEmailRoute,
}))

import { POST } from "./route"

function session(role: "viewer" | "operator") {
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

const routeId = "019a0000-0000-7000-8000-0000000000aa"

describe("POST /api/email-routes/{id}/archive", () => {
  beforeEach(() => {
    getSession.mockReset()
    archiveEmailRoute.mockReset()
  })

  it("rejects a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await POST(
      new Request(`http://localhost/api/email-routes/${routeId}/archive`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: routeId }) }
    )
    expect(response.status).toBe(403)
    expect(archiveEmailRoute).not.toHaveBeenCalled()
  })

  it("archives for an operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    archiveEmailRoute.mockResolvedValue({
      id: routeId,
      status: "inactive",
      version: 2,
    })
    const response = await POST(
      new Request(`http://localhost/api/email-routes/${routeId}/archive`, {
        method: "POST",
        headers: { "x-request-id": "req-archive" },
      }),
      { params: Promise.resolve({ id: routeId }) }
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: routeId,
      status: "inactive",
    })
    expect(archiveEmailRoute).toHaveBeenCalledWith(routeId, {
      userId: session("operator").id,
      requestId: "req-archive",
    })
  })
})
