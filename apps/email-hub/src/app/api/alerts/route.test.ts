import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const listAlerts = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/alerts/service", () => ({ listAlerts }))

import { GET } from "./route"

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

const cursor = "019a0000-0000-7000-8000-0000000000aa"

describe("GET /api/alerts", () => {
  beforeEach(() => {
    getSession.mockReset()
    listAlerts.mockReset()
  })

  it("lists alerts for an operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    listAlerts.mockResolvedValue({
      data: [
        {
          id: cursor,
          type: "send_late",
          severity: "warning",
          status: "open",
        },
      ],
      next_cursor: cursor,
    })

    const response = await GET(
      new Request(
        `http://localhost/api/alerts?limit=2&status=open&severity=warning&type=send_late&cursor=${cursor}`
      )
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: cursor,
          type: "send_late",
          severity: "warning",
          status: "open",
        },
      ],
      next_cursor: cursor,
    })
    expect(listAlerts).toHaveBeenCalledWith({
      limit: 2,
      cursor,
      status: "open",
      severity: "warning",
      type: "send_late",
    })
  })

  it("lists alerts for an admin", async () => {
    getSession.mockResolvedValue(session("admin"))
    listAlerts.mockResolvedValue({ data: [], next_cursor: null })

    const response = await GET(new Request("http://localhost/api/alerts"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [],
      next_cursor: null,
    })
  })

  it("rejects a viewer, a missing session, and a machine key", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const viewer = await GET(new Request("http://localhost/api/alerts"))
    expect(viewer.status).toBe(403)

    getSession.mockResolvedValue(null)
    const missing = await GET(new Request("http://localhost/api/alerts"))
    expect(missing.status).toBe(401)

    const machine = await GET(
      new Request("http://localhost/api/alerts", {
        headers: { "x-key-id": "k1" },
      })
    )
    expect(machine.status).toBe(401)
    expect(listAlerts).not.toHaveBeenCalled()
  })

  it("rejects an unknown filter and an oversized page", async () => {
    getSession.mockResolvedValue(session("operator"))
    const unknown = await GET(
      new Request("http://localhost/api/alerts?sort=created_at")
    )
    expect(unknown.status).toBe(422)
    const oversized = await GET(
      new Request("http://localhost/api/alerts?limit=201")
    )
    expect(oversized.status).toBe(422)
    expect(listAlerts).not.toHaveBeenCalled()
  })
})
