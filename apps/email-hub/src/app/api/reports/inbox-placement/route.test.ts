import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const getInboxPlacement = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/reports/inbox-placement", () => ({
  getInboxPlacement,
}))

import { GET } from "./route"

function session() {
  return {
    id: "019a0000-0000-7000-8000-000000000001",
    email: "staff@example.com",
    name: "Staff",
    image: null,
    role: "viewer" as const,
    jobTitle: "Web Developer",
    twoFactorEnabled: true,
  }
}

describe("GET /api/reports/inbox-placement", () => {
  beforeEach(() => {
    getSession.mockReset()
    getInboxPlacement.mockReset()
  })

  it("returns seed placement for a viewer", async () => {
    getSession.mockResolvedValue(session())
    getInboxPlacement.mockResolvedValue({
      from: "2026-03-08",
      to: "2026-03-08",
      placement: [],
      latest_sends: [],
      blocklists: [],
    })

    const response = await GET(
      new Request(
        "http://localhost/api/reports/inbox-placement?from=2026-03-08&to=2026-03-08"
      )
    )

    expect(response.status).toBe(200)
    expect(getInboxPlacement).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "2026-03-08",
        to: "2026-03-08",
        include_machine: false,
      })
    )
  })

  it("rejects unauthenticated callers", async () => {
    getSession.mockResolvedValue(null)

    const response = await GET(
      new Request(
        "http://localhost/api/reports/inbox-placement?from=2026-03-08&to=2026-03-08"
      )
    )

    expect(response.status).toBe(401)
    expect(getInboxPlacement).not.toHaveBeenCalled()
  })
})
