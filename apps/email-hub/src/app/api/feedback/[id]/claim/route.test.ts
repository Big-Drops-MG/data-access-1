import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const claimFeedback = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/feedback/service", () => ({ claimFeedback }))

import { POST } from "./route"

const id = "019a0000-0000-7000-8000-0000000000aa"

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

describe("POST /api/feedback/{id}/claim", () => {
  beforeEach(() => {
    getSession.mockReset()
    claimFeedback.mockReset()
  })

  it("claims for an operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    claimFeedback.mockResolvedValue({
      id,
      status: "in_review",
      reviewing_by: session("operator").id,
    })

    const response = await POST(
      new Request(`http://localhost/api/feedback/${id}/claim`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id }) }
    )
    expect(response.status).toBe(200)
    expect(claimFeedback).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ userId: session("operator").id })
    )
  })

  it("forbids viewers from claiming", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await POST(
      new Request(`http://localhost/api/feedback/${id}/claim`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id }) }
    )
    expect(response.status).toBe(403)
    expect(claimFeedback).not.toHaveBeenCalled()
  })
})
