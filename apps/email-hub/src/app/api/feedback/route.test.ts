import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const listFeedback = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/feedback/service", () => ({ listFeedback }))

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

describe("GET /api/feedback", () => {
  beforeEach(() => {
    getSession.mockReset()
    listFeedback.mockReset()
  })

  it("lists for a viewer and masks emails", async () => {
    getSession.mockResolvedValue(session("viewer"))
    listFeedback.mockResolvedValue({
      data: [
        {
          id: "019a0000-0000-7000-8000-0000000000aa",
          email: "ada@example.com",
          status: "pending",
        },
      ],
      next_cursor: null,
    })

    const response = await GET(
      new Request("http://localhost/api/feedback?status=pending&limit=10")
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data[0].email).toBe("ad***@example.com")
    expect(listFeedback).toHaveBeenCalledWith({
      limit: 10,
      cursor: undefined,
      status: "pending",
    })
  })

  it("rejects unauthenticated callers", async () => {
    getSession.mockResolvedValue(null)
    const response = await GET(new Request("http://localhost/api/feedback"))
    expect(response.status).toBe(401)
  })
})
