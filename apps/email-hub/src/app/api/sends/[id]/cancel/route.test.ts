import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@workspace/shared"

const getSession = vi.hoisted(() => vi.fn())
const cancelSend = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/sends/service", () => ({ cancelSend }))

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

describe("POST /api/sends/{id}/cancel", () => {
  beforeEach(() => {
    getSession.mockReset()
    cancelSend.mockReset()
  })

  it("rejects a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const denied = await POST(
      new Request(`http://localhost/api/sends/${sendId}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1 }),
      }),
      { params: Promise.resolve({ id: sendId }) }
    )
    expect(denied.status).toBe(403)
    expect(cancelSend).not.toHaveBeenCalled()
  })

  it("cancels for an operator and maps an invalid transition", async () => {
    getSession.mockResolvedValue(session("operator"))
    cancelSend.mockResolvedValueOnce({ id: sendId, status: "cancelled" })
    const ok = await POST(
      new Request(`http://localhost/api/sends/${sendId}/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-cancel-1",
        },
        body: JSON.stringify({ version: 2 }),
      }),
      { params: Promise.resolve({ id: sendId }) }
    )
    expect(ok.status).toBe(200)
    expect(cancelSend).toHaveBeenCalledWith(sendId, 2, {
      userId: session("operator").id,
      requestId: "req-cancel-1",
    })

    cancelSend.mockRejectedValueOnce(
      AppError.conflict([
        {
          path: "status",
          message: "Cannot transition from completed to cancelled",
        },
      ])
    )
    const rejected = await POST(
      new Request(`http://localhost/api/sends/${sendId}/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1 }),
      }),
      { params: Promise.resolve({ id: sendId }) }
    )
    expect(rejected.status).toBe(409)
  })
})
