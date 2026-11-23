import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const getDashboardSummary = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/dashboard/service", () => ({ getDashboardSummary }))

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

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    getSession.mockReset()
    getDashboardSummary.mockReset()
  })

  it("returns the dashboard summary for a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    getDashboardSummary.mockResolvedValue({
      day: "2026-11-20",
      kpis: { sent: 1, delivered: 1, bounced: 0, complaints: 0 },
      queues: [],
      open_alerts: [],
      recent_sends: [],
      upcoming_sends: [],
      email_routes: [],
    })

    const response = await GET(new Request("http://localhost/api/dashboard"))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      day: "2026-11-20",
      kpis: { sent: 1, delivered: 1, bounced: 0, complaints: 0 },
      queues: [],
      open_alerts: [],
      recent_sends: [],
      upcoming_sends: [],
      email_routes: [],
    })
    expect(getDashboardSummary).toHaveBeenCalledOnce()
  })

  it("returns 401 when there is no session", async () => {
    getSession.mockResolvedValue(null)

    const response = await GET(new Request("http://localhost/api/dashboard"))

    expect(response.status).toBe(401)
    expect(getDashboardSummary).not.toHaveBeenCalled()
  })
})
