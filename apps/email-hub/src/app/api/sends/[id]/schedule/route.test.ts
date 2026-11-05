import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@workspace/shared"

const getSession = vi.hoisted(() => vi.fn())
const scheduleSend = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/sends/service", () => ({ scheduleSend }))

import { POST } from "./route"

const sendId = "019a0000-0000-7000-8000-0000000000aa"

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

describe("POST /api/sends/{id}/schedule", () => {
  beforeEach(() => {
    getSession.mockReset()
    scheduleSend.mockReset()
  })

  it("rejects a viewer and a missing version", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const denied = await POST(
      new Request(`http://localhost/api/sends/${sendId}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1 }),
      }),
      { params: Promise.resolve({ id: sendId }) }
    )
    expect(denied.status).toBe(403)
    expect(scheduleSend).not.toHaveBeenCalled()

    getSession.mockResolvedValue(session("operator"))
    const missing = await POST(
      new Request(`http://localhost/api/sends/${sendId}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: sendId }) }
    )
    expect(missing.status).toBe(422)
  })

  it("schedules for an operator and maps a conflict", async () => {
    getSession.mockResolvedValue(session("operator"))
    scheduleSend.mockResolvedValueOnce({ id: sendId, status: "scheduled" })
    const ok = await POST(
      new Request(`http://localhost/api/sends/${sendId}/schedule`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-schedule-1",
        },
        body: JSON.stringify({ version: 1 }),
      }),
      { params: Promise.resolve({ id: sendId }) }
    )
    expect(ok.status).toBe(200)
    expect(scheduleSend).toHaveBeenCalledWith(sendId, 1, {
      userId: session("operator").id,
      requestId: "req-schedule-1",
    })

    scheduleSend.mockRejectedValueOnce(
      AppError.conflict([
        {
          path: "status",
          message: "Cannot transition from scheduled to scheduled",
        },
      ])
    )
    const conflict = await POST(
      new Request(`http://localhost/api/sends/${sendId}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 2 }),
      }),
      { params: Promise.resolve({ id: sendId }) }
    )
    expect(conflict.status).toBe(409)
    const body = await conflict.json()
    expect(body.error.code).toBe("conflict")
    expect(body).not.toHaveProperty("stack")
  })
})
