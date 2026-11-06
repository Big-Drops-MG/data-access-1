import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const getRecipientDetail = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/recipients/service", () => ({ getRecipientDetail }))

import { GET } from "./route"

function session(role: "viewer" | "operator" | "admin") {
  return {
    id: "019a0000-0000-7000-8000-000000000001",
    email: "staff@example.com",
    name: "Staff",
    image: null,
    role,
    jobTitle: "Web Developer",
    twoFactorEnabled: true,
  }
}

const recipientId = "019a0000-0000-7000-8000-0000000000aa"

describe("GET /api/recipients/{id}", () => {
  beforeEach(() => {
    getSession.mockReset()
    getRecipientDetail.mockReset()
  })

  it("returns detail for a viewer with masked email", async () => {
    getSession.mockResolvedValue(session("viewer"))
    getRecipientDetail.mockResolvedValue({
      id: recipientId,
      email: "ada@example.com",
      status: "active",
      tier: "standard",
      external_user_id: "dev-ada",
      created_at: "2026-11-06T12:00:00.000Z",
      updated_at: "2026-11-06T12:00:00.000Z",
      last_emailed_at: null,
      preferences: [
        {
          category_id: "019a0000-0000-7000-8000-0000000000bb",
          category_key: "engagement",
          category_name: "Engagement",
          kind: "relationship",
          opted_out: true,
          source: "unsubscribe_link",
          updated_at: "2026-11-06T12:00:00.000Z",
        },
      ],
      messages: [],
    })

    const response = await GET(
      new Request(`http://localhost/api/recipients/${recipientId}`),
      { params: Promise.resolve({ id: recipientId }) }
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.email).toBe("ad***@example.com")
    expect(body.preferences).toHaveLength(1)
    expect(body).not.toHaveProperty("email_hash")
    expect(getRecipientDetail).toHaveBeenCalledWith(recipientId)
  })

  it("rejects invalid ids", async () => {
    getSession.mockResolvedValue(session("operator"))
    const response = await GET(
      new Request("http://localhost/api/recipients/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    )
    expect(response.status).toBe(422)
    expect(getRecipientDetail).not.toHaveBeenCalled()
  })
})
