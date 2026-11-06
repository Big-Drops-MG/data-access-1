import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const listSends = vi.hoisted(() => vi.fn())
const createSend = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/sends/service", () => ({ listSends, createSend }))

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

const id = "019a0000-0000-7000-8000-000000000010"

function createBody(scheduledFor = "2026-11-05T18:00:00.000Z") {
  return {
    name: "October relationship update",
    template_version_id: id,
    sender_id: id,
    category_id: id,
    offer_id: id,
    scheduled_for: scheduledFor,
  }
}

describe("GET/POST /api/sends", () => {
  beforeEach(() => {
    getSession.mockReset()
    listSends.mockReset()
    createSend.mockReset()
  })

  it("lists for a viewer and keeps filters", async () => {
    getSession.mockResolvedValue(session("viewer"))
    listSends.mockResolvedValue({ data: [], next_cursor: null })
    const response = await GET(
      new Request(
        `http://localhost/api/sends?status=draft&category_id=${id}&limit=10`
      )
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [],
      next_cursor: null,
    })
    expect(listSends).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
        categoryId: id,
        limit: 10,
      })
    )
  })

  it("returns 401 when the session is missing", async () => {
    getSession.mockResolvedValue(null)
    const response = await GET(new Request("http://localhost/api/sends"))
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error.code).toBe("unauthorized")
    expect(JSON.stringify(body)).not.toMatch(/stack/i)
    expect(listSends).not.toHaveBeenCalled()
  })

  it("rejects a viewer on create", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await POST(
      new Request("http://localhost/api/sends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createBody()),
      })
    )
    expect(response.status).toBe(403)
    expect(createSend).not.toHaveBeenCalled()
  })

  it("creates a draft for an operator and passes the request id", async () => {
    getSession.mockResolvedValue(session("operator"))
    createSend.mockResolvedValue({ id, status: "draft" })
    const response = await POST(
      new Request("http://localhost/api/sends", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-send-1",
        },
        body: JSON.stringify(createBody()),
      })
    )
    expect(response.status).toBe(201)
    expect(createSend).toHaveBeenCalledWith(
      {
        name: "October relationship update",
        templateVersionId: id,
        senderId: id,
        categoryId: id,
        offerId: id,
        scheduledFor: new Date("2026-11-05T18:00:00.000Z"),
      },
      { userId: session("operator").id, requestId: "req-send-1" }
    )
  })

  it("rejects an offset timestamp and a missing scheduled time", async () => {
    getSession.mockResolvedValue(session("operator"))
    const offset = await POST(
      new Request("http://localhost/api/sends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createBody("2026-11-05T18:00:00.000+00:00")),
      })
    )
    expect(offset.status).toBe(422)
    const missing = await POST(
      new Request("http://localhost/api/sends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template_version_id: id,
          sender_id: id,
          category_id: id,
        }),
      })
    )
    expect(missing.status).toBe(422)
    expect(createSend).not.toHaveBeenCalled()
  })

  it("rejects invalid JSON and machine auth", async () => {
    getSession.mockResolvedValue(session("operator"))
    const badJson = await POST(
      new Request("http://localhost/api/sends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      })
    )
    expect(badJson.status).toBe(400)
    const machine = await GET(
      new Request("http://localhost/api/sends", {
        headers: { "x-key-id": "k1" },
      })
    )
    expect(machine.status).toBe(401)
    expect(createSend).not.toHaveBeenCalled()
  })
})
