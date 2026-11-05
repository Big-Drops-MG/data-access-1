import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const listSuppressions = vi.hoisted(() => vi.fn())
const addManualSuppression = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/suppressions/service", () => ({
  listSuppressions,
  addManualSuppression,
}))

import { GET, POST } from "./route"

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

const offerId = "019a0000-0000-7000-8000-000000000012"

describe("GET/POST /api/suppressions", () => {
  beforeEach(() => {
    getSession.mockReset()
    listSuppressions.mockReset()
    addManualSuppression.mockReset()
  })

  it("lists an empty page for a viewer and masks emails", async () => {
    getSession.mockResolvedValue(session("viewer"))
    listSuppressions.mockResolvedValue({
      data: [
        {
          id: "019a0000-0000-7000-8000-0000000000aa",
          email: "ada@example.com",
          recipient_id: null,
          scope: "global",
          offer_id: null,
          source: "manual",
          reason: null,
          added_by: session("operator").id,
          created_at: "2026-11-05T12:00:00.000Z",
          removed_at: null,
        },
      ],
      next_cursor: "019a0000-0000-7000-8000-0000000000aa",
    })

    const response = await GET(
      new Request(
        "http://localhost/api/suppressions?limit=2&source=manual&email=ada@example.com"
      )
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      data: [
        expect.objectContaining({
          email: "ad***@example.com",
          source: "manual",
        }),
      ],
      next_cursor: "019a0000-0000-7000-8000-0000000000aa",
    })
    expect(body.data[0]).not.toHaveProperty("email_hash")
    expect(listSuppressions).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 2,
        source: "manual",
        email: "ada@example.com",
        includeRemoved: false,
      })
    )
  })

  it("leaves operator list emails unmasked", async () => {
    getSession.mockResolvedValue(session("operator"))
    listSuppressions.mockResolvedValue({
      data: [{ email: "ada@example.com" }],
      next_cursor: null,
    })

    const response = await GET(new Request("http://localhost/api/suppressions"))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [{ email: "ada@example.com" }],
      next_cursor: null,
    })
  })

  it("rejects an unauthenticated list and a machine key", async () => {
    getSession.mockResolvedValue(null)
    const missing = await GET(new Request("http://localhost/api/suppressions"))
    expect(missing.status).toBe(401)

    const machine = await GET(
      new Request("http://localhost/api/suppressions", {
        headers: { "x-key-id": "k1" },
      })
    )
    expect(machine.status).toBe(401)
    expect(listSuppressions).not.toHaveBeenCalled()
  })

  it("rejects an unknown list filter and an oversized page", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const unknown = await GET(
      new Request("http://localhost/api/suppressions?sort=created_at")
    )
    expect(unknown.status).toBe(422)
    const oversized = await GET(
      new Request("http://localhost/api/suppressions?limit=201")
    )
    expect(oversized.status).toBe(422)
    expect(listSuppressions).not.toHaveBeenCalled()
  })

  it("rejects a viewer and an unauthenticated create", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const denied = await POST(
      new Request("http://localhost/api/suppressions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "ada@example.com",
          reason: "manual",
          role: "admin",
        }),
      })
    )
    expect(denied.status).toBe(403)

    getSession.mockResolvedValue(null)
    const missing = await POST(
      new Request("http://localhost/api/suppressions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ada@example.com", reason: "manual" }),
      })
    )
    expect(missing.status).toBe(401)
    expect(addManualSuppression).not.toHaveBeenCalled()
  })

  it("creates for an operator using the session user as added_by", async () => {
    getSession.mockResolvedValue(session("operator"))
    addManualSuppression.mockResolvedValue({
      id: "019a0000-0000-7000-8000-0000000000aa",
      email: "ada@example.com",
      created: true,
    })

    const response = await POST(
      new Request("http://localhost/api/suppressions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-1",
        },
        body: JSON.stringify({
          email: "  Ada@Example.com ",
          offer_id: offerId,
          reason: "manual",
        }),
      })
    )

    expect(response.status).toBe(201)
    expect(addManualSuppression).toHaveBeenCalledWith(
      { email: "ada@example.com", offerId },
      { userId: session("operator").id, requestId: "req-1" }
    )
  })

  it("returns 200 when the service reports an existing suppression", async () => {
    getSession.mockResolvedValue(session("admin"))
    addManualSuppression.mockResolvedValue({
      id: "019a0000-0000-7000-8000-0000000000aa",
      created: false,
    })
    const response = await POST(
      new Request("http://localhost/api/suppressions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ada@example.com", reason: "manual" }),
      })
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ created: false })
  })

  it("rejects invalid bodies before calling the service", async () => {
    getSession.mockResolvedValue(session("operator"))
    const cases = [
      { body: "{", status: 400 },
      { body: JSON.stringify({ reason: "manual" }), status: 422 },
      {
        body: JSON.stringify({ email: "nope", reason: "manual" }),
        status: 422,
      },
      {
        body: JSON.stringify({
          email: "ada@example.com",
          reason: "hard_bounce",
        }),
        status: 422,
      },
      {
        body: JSON.stringify({
          email: "ada@example.com",
          reason: "manual",
          added_by: "019a0000-0000-7000-8000-000000000099",
        }),
        status: 422,
      },
      {
        body: JSON.stringify({
          email: "ada@example.com",
          reason: "manual",
          offer_id: "",
        }),
        status: 422,
      },
    ]

    for (const entry of cases) {
      const response = await POST(
        new Request("http://localhost/api/suppressions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: entry.body,
        })
      )
      expect(response.status).toBe(entry.status)
    }
    expect(addManualSuppression).not.toHaveBeenCalled()
  })
})
