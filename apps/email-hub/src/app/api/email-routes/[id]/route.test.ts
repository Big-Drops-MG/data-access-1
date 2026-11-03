import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const getEmailRoute = vi.hoisted(() => vi.fn())
const updateEmailRoute = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/email-routes/service", () => ({
  getEmailRoute,
  updateEmailRoute,
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

const routeId = "019a0000-0000-7000-8000-0000000000aa"

describe("GET/PATCH /api/email-routes/{id}", () => {
  beforeEach(() => {
    getSession.mockReset()
    getEmailRoute.mockReset()
    updateEmailRoute.mockReset()
  })

  it("returns detail for a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    getEmailRoute.mockResolvedValue({ id: routeId, version: 1 })
    const response = await GET(
      new Request(`http://localhost/api/email-routes/${routeId}`),
      { params: Promise.resolve({ id: routeId }) }
    )
    expect(response.status).toBe(200)
    expect(getEmailRoute).toHaveBeenCalledWith(routeId)
  })

  it("rejects a viewer on patch", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await PATCH(
      new Request(`http://localhost/api/email-routes/${routeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1, status: "inactive" }),
      }),
      { params: Promise.resolve({ id: routeId }) }
    )
    expect(response.status).toBe(403)
  })

  it("archives for an operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    updateEmailRoute.mockResolvedValue({
      id: routeId,
      status: "inactive",
      version: 2,
    })
    const response = await PATCH(
      new Request(`http://localhost/api/email-routes/${routeId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-2",
        },
        body: JSON.stringify({ version: 1, status: "inactive" }),
      }),
      { params: Promise.resolve({ id: routeId }) }
    )
    expect(response.status).toBe(200)
    expect(updateEmailRoute).toHaveBeenCalledWith(
      routeId,
      {
        version: 1,
        emailType: undefined,
        offerId: undefined,
        templateId: undefined,
        senderId: undefined,
        status: "inactive",
      },
      { userId: session("operator").id, requestId: "req-2" }
    )
  })

  it("requires a change on patch", async () => {
    getSession.mockResolvedValue(session("operator"))
    const response = await PATCH(
      new Request(`http://localhost/api/email-routes/${routeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1 }),
      }),
      { params: Promise.resolve({ id: routeId }) }
    )
    expect(response.status).toBe(422)
    expect(updateEmailRoute).not.toHaveBeenCalled()
  })
})
