import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const getReport = vi.hoisted(() => vi.fn())
const parseReportName = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/reports/service", () => ({
  getReport,
  parseReportName,
}))

import { AppError } from "@workspace/shared"

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

describe("GET /api/reports/[name]", () => {
  beforeEach(() => {
    getSession.mockReset()
    getReport.mockReset()
    parseReportName.mockReset()
    parseReportName.mockImplementation((name: string) => name)
  })

  it("returns a report for a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    getReport.mockResolvedValue({
      name: "sending",
      from: "2026-03-08",
      to: "2026-03-08",
      include_machine: false,
      data: [{ day: "2026-03-08", sent: 1 }],
    })

    const response = await GET(
      new Request(
        "http://localhost/api/reports/sending?from=2026-03-08&to=2026-03-08"
      ),
      { params: Promise.resolve({ name: "sending" }) }
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      name: "sending",
      from: "2026-03-08",
      to: "2026-03-08",
      include_machine: false,
      data: [{ day: "2026-03-08", sent: 1 }],
    })
    expect(parseReportName).toHaveBeenCalledWith("sending")
    expect(getReport).toHaveBeenCalledWith("sending", {
      from: "2026-03-08",
      to: "2026-03-08",
      include_machine: false,
    })
  })

  it("returns 422 when the range exceeds 92 days", async () => {
    getSession.mockResolvedValue(session("viewer"))

    const response = await GET(
      new Request(
        "http://localhost/api/reports/sending?from=2026-03-01&to=2026-06-01"
      ),
      { params: Promise.resolve({ name: "sending" }) }
    )

    expect(response.status).toBe(422)
    expect(getReport).not.toHaveBeenCalled()
  })

  it("returns 404 for an unknown report name", async () => {
    getSession.mockResolvedValue(session("viewer"))
    parseReportName.mockImplementation(() => {
      throw AppError.notFound([
        { path: "name", message: "Unknown report name" },
      ])
    })

    const response = await GET(
      new Request(
        "http://localhost/api/reports/nope?from=2026-03-08&to=2026-03-08"
      ),
      { params: Promise.resolve({ name: "nope" }) }
    )

    expect(response.status).toBe(404)
    expect(getReport).not.toHaveBeenCalled()
  })

  it("rejects unauthenticated callers", async () => {
    getSession.mockResolvedValue(null)

    const response = await GET(
      new Request(
        "http://localhost/api/reports/sending?from=2026-03-08&to=2026-03-08"
      ),
      { params: Promise.resolve({ name: "sending" }) }
    )

    expect(response.status).toBe(401)
  })
})
