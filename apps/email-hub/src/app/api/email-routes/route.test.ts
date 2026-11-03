import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const listEmailRoutes = vi.hoisted(() => vi.fn())
const createEmailRoute = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/email-routes/service", () => ({
  listEmailRoutes,
  createEmailRoute,
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

const templateId = "019a0000-0000-7000-8000-000000000010"
const senderId = "019a0000-0000-7000-8000-000000000011"
const offerId = "019a0000-0000-7000-8000-000000000012"

describe("GET/POST /api/email-routes", () => {
  beforeEach(() => {
    getSession.mockReset()
    listEmailRoutes.mockReset()
    createEmailRoute.mockReset()
  })

  it("lists for a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    listEmailRoutes.mockResolvedValue({ data: [], next_cursor: null })
    const response = await GET(
      new Request("http://localhost/api/email-routes?status=active")
    )
    expect(response.status).toBe(200)
    expect(listEmailRoutes).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", limit: 50 })
    )
  })

  it("rejects a viewer on create", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await POST(
      new Request("http://localhost/api/email-routes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email_type: "thank_you",
          template_id: templateId,
          sender_id: senderId,
        }),
      })
    )
    expect(response.status).toBe(403)
    expect(createEmailRoute).not.toHaveBeenCalled()
  })

  it("creates for an operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    createEmailRoute.mockResolvedValue({ id: "route-1", status: "active" })
    const response = await POST(
      new Request("http://localhost/api/email-routes", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-1",
        },
        body: JSON.stringify({
          email_type: "thank_you",
          offer_id: offerId,
          template_id: templateId,
          sender_id: senderId,
        }),
      })
    )
    expect(response.status).toBe(201)
    expect(createEmailRoute).toHaveBeenCalledWith(
      {
        emailType: "thank_you",
        offerId,
        templateId,
        senderId,
      },
      { userId: session("operator").id, requestId: "req-1" }
    )
  })

  it("rejects machine auth headers", async () => {
    const response = await GET(
      new Request("http://localhost/api/email-routes", {
        headers: { "x-key-id": "k1" },
      })
    )
    expect(response.status).toBe(401)
  })
})
