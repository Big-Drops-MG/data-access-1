import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const listAuditActors = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/audit-log/service", () => ({ listAuditActors }))

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

describe("GET /api/audit-log/actors", () => {
  beforeEach(() => {
    getSession.mockReset()
    listAuditActors.mockReset()
  })

  it("lists actors for an operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    listAuditActors.mockResolvedValue({ data: [] })

    const response = await GET(
      new Request("http://localhost/api/audit-log/actors")
    )

    expect(response.status).toBe(200)
    expect(listAuditActors).toHaveBeenCalledOnce()
  })

  it("forbids viewers", async () => {
    getSession.mockResolvedValue(session("viewer"))

    const response = await GET(
      new Request("http://localhost/api/audit-log/actors")
    )

    expect(response.status).toBe(403)
    expect(listAuditActors).not.toHaveBeenCalled()
  })
})
