import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@workspace/shared"

const getSession = vi.hoisted(() => vi.fn())
const getSend = vi.hoisted(() => vi.fn())
const updateSend = vi.hoisted(() => vi.fn())
const deleteSend = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/sends/service", () => ({ getSend, updateSend, deleteSend }))

import { DELETE, GET, PATCH } from "./route"

const sendId = "019a0000-0000-7000-8000-0000000000aa"
const senderId = "019a0000-0000-7000-8000-000000000011"

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

describe("GET/PATCH/DELETE /api/sends/{id}", () => {
  beforeEach(() => {
    getSession.mockReset()
    getSend.mockReset()
    updateSend.mockReset()
    deleteSend.mockReset()
  })

  it("returns one send for a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    getSend.mockResolvedValue({ id: sendId, status: "draft" })
    const response = await GET(
      new Request(`http://localhost/api/sends/${sendId}`),
      { params: Promise.resolve({ id: sendId }) }
    )
    expect(response.status).toBe(200)
    expect(getSend).toHaveBeenCalledWith(sendId)
  })

  it("404s an unknown send without a stack trace", async () => {
    getSession.mockResolvedValue(session("viewer"))
    getSend.mockRejectedValue(
      AppError.notFound([{ path: "id", message: "Send not found" }])
    )
    const response = await GET(
      new Request(`http://localhost/api/sends/${sendId}`),
      { params: Promise.resolve({ id: sendId }) }
    )
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe("not_found")
    expect(body).not.toHaveProperty("stack")
    expect(response.headers.get("x-request-id")).toBeTruthy()
  })

  it("rejects a viewer patch and updates for an operator", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const denied = await PATCH(
      new Request(`http://localhost/api/sends/${sendId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1, sender_id: senderId }),
      }),
      { params: Promise.resolve({ id: sendId }) }
    )
    expect(denied.status).toBe(403)
    expect(updateSend).not.toHaveBeenCalled()

    getSession.mockResolvedValue(session("operator"))
    updateSend.mockResolvedValue({ id: sendId, version: 2 })
    const updated = await PATCH(
      new Request(`http://localhost/api/sends/${sendId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-patch-1",
        },
        body: JSON.stringify({ version: 1, sender_id: senderId }),
      }),
      { params: Promise.resolve({ id: sendId }) }
    )
    expect(updated.status).toBe(200)
    expect(updateSend).toHaveBeenCalledWith(
      sendId,
      { version: 1, senderId, offerId: undefined, scheduledFor: undefined },
      { userId: session("operator").id, requestId: "req-patch-1" }
    )
  })

  it("deletes a draft only with a version query", async () => {
    getSession.mockResolvedValue(session("operator"))
    const missingVersion = await DELETE(
      new Request(`http://localhost/api/sends/${sendId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: sendId }) }
    )
    expect(missingVersion.status).toBe(422)
    expect(deleteSend).not.toHaveBeenCalled()

    deleteSend.mockResolvedValue({ id: sendId, status: "draft" })
    const deleted = await DELETE(
      new Request(`http://localhost/api/sends/${sendId}?version=1`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: sendId }) }
    )
    expect(deleted.status).toBe(200)
    expect(deleteSend).toHaveBeenCalledWith(sendId, 1, {
      userId: session("operator").id,
      requestId: expect.any(String),
    })
  })
})
