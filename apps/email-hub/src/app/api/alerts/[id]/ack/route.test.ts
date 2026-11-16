import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@workspace/shared"

const getSession = vi.hoisted(() => vi.fn())
const acknowledgeAlert = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/alerts/service", () => ({ acknowledgeAlert }))

import { POST } from "./route"

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

const alertId = "019a0000-0000-7000-8000-0000000000aa"

function ackRequest(headers?: HeadersInit): Request {
  return new Request(`http://localhost/api/alerts/${alertId}/ack`, {
    method: "POST",
    headers,
  })
}

describe("POST /api/alerts/{id}/ack", () => {
  beforeEach(() => {
    getSession.mockReset()
    acknowledgeAlert.mockReset()
  })

  it("lets an operator acknowledge and ignores a client role field", async () => {
    getSession.mockResolvedValue(session("operator"))
    acknowledgeAlert.mockResolvedValue({
      id: alertId,
      status: "open",
      acknowledged_by: session("operator").id,
    })

    const response = await POST(
      new Request(`http://localhost/api/alerts/${alertId}/ack`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-ack-1",
        },
        body: JSON.stringify({ role: "admin", acknowledged_by: "someone" }),
      }),
      { params: Promise.resolve({ id: alertId }) }
    )

    expect(response.status).toBe(200)
    expect(acknowledgeAlert).toHaveBeenCalledWith(alertId, {
      userId: session("operator").id,
      requestId: "req-ack-1",
    })
    await expect(response.json()).resolves.toMatchObject({
      acknowledged_by: session("operator").id,
      status: "open",
    })
  })

  it("lets an admin acknowledge", async () => {
    getSession.mockResolvedValue(session("admin"))
    acknowledgeAlert.mockResolvedValue({ id: alertId, status: "open" })

    const response = await POST(ackRequest(), {
      params: Promise.resolve({ id: alertId }),
    })

    expect(response.status).toBe(200)
    expect(acknowledgeAlert).toHaveBeenCalledWith(alertId, {
      userId: session("admin").id,
      requestId: expect.any(String),
    })
  })

  it("rejects a viewer, a missing session, and a machine key", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const viewer = await POST(ackRequest(), {
      params: Promise.resolve({ id: alertId }),
    })
    expect(viewer.status).toBe(403)

    getSession.mockResolvedValue(null)
    const missing = await POST(ackRequest(), {
      params: Promise.resolve({ id: alertId }),
    })
    expect(missing.status).toBe(401)

    const machine = await POST(ackRequest({ "x-key-id": "k1" }), {
      params: Promise.resolve({ id: alertId }),
    })
    expect(machine.status).toBe(401)
    expect(acknowledgeAlert).not.toHaveBeenCalled()
  })

  it("rejects an invalid id before calling the service", async () => {
    getSession.mockResolvedValue(session("operator"))
    const response = await POST(
      new Request("http://localhost/api/alerts/not-an-id/ack", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "not-an-id" }) }
    )

    expect(response.status).toBe(422)
    expect(acknowledgeAlert).not.toHaveBeenCalled()
  })

  it("returns 404 when the alert does not exist", async () => {
    getSession.mockResolvedValue(session("admin"))
    acknowledgeAlert.mockRejectedValue(
      AppError.notFound([{ path: "id", message: "Alert not found" }])
    )

    const response = await POST(ackRequest(), {
      params: Promise.resolve({ id: alertId }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "not_found" },
    })
  })
})
