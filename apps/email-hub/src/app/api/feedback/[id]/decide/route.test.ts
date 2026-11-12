import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const decideFeedback = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/feedback/service", () => ({ decideFeedback }))

import { POST } from "./route"

const id = "019a0000-0000-7000-8000-0000000000aa"
const classificationId = "019a0000-0000-7000-8000-0000000000c1"

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

describe("POST /api/feedback/{id}/decide", () => {
  beforeEach(() => {
    getSession.mockReset()
    decideFeedback.mockReset()
  })

  it("decides for an operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    decideFeedback.mockResolvedValue({
      id,
      status: "resolved",
      decision: "no_action",
    })

    const response = await POST(
      new Request(`http://localhost/api/feedback/${id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classification_id: classificationId,
          decision: "no_action",
        }),
      }),
      { params: Promise.resolve({ id }) }
    )
    expect(response.status).toBe(200)
    expect(decideFeedback).toHaveBeenCalledWith(
      id,
      {
        classificationId,
        decision: "no_action",
      },
      expect.objectContaining({ userId: session("operator").id })
    )
  })

  it("forbids viewers from deciding", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await POST(
      new Request(`http://localhost/api/feedback/${id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classification_id: classificationId,
          decision: "escalate",
        }),
      }),
      { params: Promise.resolve({ id }) }
    )
    expect(response.status).toBe(403)
    expect(decideFeedback).not.toHaveBeenCalled()
  })
})
