import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const listAuditLog = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/audit-log/service", () => ({ listAuditLog }))

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

describe("GET /api/audit-log", () => {
  beforeEach(() => {
    getSession.mockReset()
    listAuditLog.mockReset()
  })

  it("lists for an operator with filters", async () => {
    getSession.mockResolvedValue(session("operator"))
    listAuditLog.mockResolvedValue({ data: [], next_cursor: null })

    const response = await GET(
      new Request(
        "http://localhost/api/audit-log?object_id=019a0000-0000-7000-8000-000000000002&from=2026-11-01&to=2026-11-10"
      )
    )

    expect(response.status).toBe(200)
    expect(listAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: "019a0000-0000-7000-8000-000000000002",
        from: "2026-11-01",
        to: "2026-11-10",
      })
    )
  })

  it("forbids viewers", async () => {
    getSession.mockResolvedValue(session("viewer"))

    const response = await GET(new Request("http://localhost/api/audit-log"))

    expect(response.status).toBe(403)
    expect(listAuditLog).not.toHaveBeenCalled()
  })
})
