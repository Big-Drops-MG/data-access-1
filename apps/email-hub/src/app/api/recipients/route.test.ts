import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const listRecipients = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/recipients/service", () => ({ listRecipients }))

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

describe("GET /api/recipients", () => {
  beforeEach(() => {
    getSession.mockReset()
    listRecipients.mockReset()
  })

  it("lists recipients for a viewer and masks emails", async () => {
    getSession.mockResolvedValue(session("viewer"))
    listRecipients.mockResolvedValue({
      data: [
        {
          id: "019a0000-0000-7000-8000-0000000000aa",
          email: "ada@example.com",
          status: "active",
          tier: "standard",
          external_user_id: "dev-ada",
          created_at: "2026-11-06T12:00:00.000Z",
          updated_at: "2026-11-06T12:00:00.000Z",
          last_emailed_at: null,
        },
      ],
      next_cursor: "019a0000-0000-7000-8000-0000000000aa",
    })

    const response = await GET(
      new Request(
        "http://localhost/api/recipients?limit=2&status=active&email=Ada@Example.com"
      )
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      data: [
        expect.objectContaining({
          email: "ad***@example.com",
          status: "active",
        }),
      ],
      next_cursor: "019a0000-0000-7000-8000-0000000000aa",
    })
    expect(body.data[0]).not.toHaveProperty("email_hash")
    expect(listRecipients).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 2,
        status: "active",
        email: "ada@example.com",
      })
    )
  })

  it("leaves operator list emails unmasked", async () => {
    getSession.mockResolvedValue(session("operator"))
    listRecipients.mockResolvedValue({
      data: [{ email: "ada@example.com" }],
      next_cursor: null,
    })

    const response = await GET(new Request("http://localhost/api/recipients"))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [{ email: "ada@example.com" }],
      next_cursor: null,
    })
  })

  it("rejects an unauthenticated list and a machine key", async () => {
    getSession.mockResolvedValue(null)
    const unauthenticated = await GET(
      new Request("http://localhost/api/recipients")
    )
    expect(unauthenticated.status).toBe(401)

    const machine = await GET(
      new Request("http://localhost/api/recipients", {
        headers: { "x-key-id": "lp_test" },
      })
    )
    expect(machine.status).toBe(401)
    expect(listRecipients).not.toHaveBeenCalled()
  })
})
