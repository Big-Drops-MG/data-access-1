import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const listSenders = vi.hoisted(() => vi.fn())
const createSender = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/senders/service", () => ({
  listSenders,
  createSender,
}))

import { GET, POST } from "./route"

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

const domainId = "019a0000-0000-7000-8000-000000000010"

describe("GET/POST /api/senders", () => {
  beforeEach(() => {
    getSession.mockReset()
    listSenders.mockReset()
    createSender.mockReset()
  })

  it("lists for a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    listSenders.mockResolvedValue({ data: [], next_cursor: null })
    const response = await GET(new Request("http://localhost/api/senders"))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [],
      next_cursor: null,
    })
  })

  it("rejects viewer on create (operator writes)", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await POST(
      new Request("http://localhost/api/senders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain_id: domainId,
          from_name: "Ops",
          local_part: "noreply",
        }),
      })
    )
    expect(response.status).toBe(403)
  })

  it("creates for an operator and rejects invalid reply_to", async () => {
    getSession.mockResolvedValue(session("operator"))

    const invalid = await POST(
      new Request("http://localhost/api/senders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain_id: domainId,
          from_name: "Ops",
          local_part: "noreply",
          reply_to: "not-an-email",
        }),
      })
    )
    expect(invalid.status).toBe(422)
    expect(createSender).not.toHaveBeenCalled()

    createSender.mockResolvedValue({
      id: "019a0000-0000-7000-8000-000000000099",
      domain_id: domainId,
      from_name: "Ops",
      from_email: "noreply@mail.example.com",
      reply_to: null,
      status: "active",
      version: 1,
    })
    const response = await POST(
      new Request("http://localhost/api/senders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-1",
        },
        body: JSON.stringify({
          domain_id: domainId,
          from_name: " Ops ",
          local_part: "NoReply",
        }),
      })
    )
    expect(response.status).toBe(201)
    expect(createSender).toHaveBeenCalledWith(
      {
        domainId,
        fromName: "Ops",
        localPart: "noreply",
        replyTo: undefined,
      },
      {
        userId: session("operator").id,
        requestId: "req-1",
      }
    )
  })
})
