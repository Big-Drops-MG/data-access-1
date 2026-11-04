import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const getSender = vi.hoisted(() => vi.fn())
const updateSender = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/senders/service", () => ({
  getSender,
  updateSender,
}))

import { GET, PATCH } from "./route"

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

const senderId = "019a0000-0000-7000-8000-0000000000aa"

describe("GET/PATCH /api/senders/{id}", () => {
  beforeEach(() => {
    getSession.mockReset()
    getSender.mockReset()
    updateSender.mockReset()
  })

  it("returns detail for a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    getSender.mockResolvedValue({
      id: senderId,
      from_email: "noreply@mail.example.com",
      version: 1,
    })
    const response = await GET(
      new Request(`http://localhost/api/senders/${senderId}`),
      { params: Promise.resolve({ id: senderId }) }
    )
    expect(response.status).toBe(200)
    expect(getSender).toHaveBeenCalledWith(senderId)
  })

  it("rejects viewer on patch", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await PATCH(
      new Request(`http://localhost/api/senders/${senderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1, from_name: "X" }),
      }),
      { params: Promise.resolve({ id: senderId }) }
    )
    expect(response.status).toBe(403)
  })

  it("patches for an operator with version", async () => {
    getSession.mockResolvedValue(session("operator"))
    updateSender.mockResolvedValue({
      id: senderId,
      from_name: "Updated",
      version: 2,
    })
    const response = await PATCH(
      new Request(`http://localhost/api/senders/${senderId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-2",
        },
        body: JSON.stringify({ version: 1, from_name: "Updated" }),
      }),
      { params: Promise.resolve({ id: senderId }) }
    )
    expect(response.status).toBe(200)
    expect(updateSender).toHaveBeenCalledWith(
      senderId,
      {
        version: 1,
        fromName: "Updated",
        localPart: undefined,
        replyTo: undefined,
        status: undefined,
      },
      {
        userId: session("operator").id,
        requestId: "req-2",
      }
    )
  })

  it("requires version on patch body", async () => {
    getSession.mockResolvedValue(session("operator"))
    const response = await PATCH(
      new Request(`http://localhost/api/senders/${senderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from_name: "No version" }),
      }),
      { params: Promise.resolve({ id: senderId }) }
    )
    expect(response.status).toBe(422)
    expect(updateSender).not.toHaveBeenCalled()
  })
})
