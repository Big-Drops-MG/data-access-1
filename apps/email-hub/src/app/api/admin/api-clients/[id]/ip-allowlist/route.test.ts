import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const updateApiClientAllowlist = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/api-clients/service", () => ({ updateApiClientAllowlist }))

import { PATCH } from "./route"

const id = "019a0000-0000-7000-8000-0000000000cc"
const url = `http://localhost/api/admin/api-clients/${id}/ip-allowlist`

function adminSession(role: "admin" | "operator" | "viewer" = "admin") {
  return {
    id: "019a0000-0000-7000-8000-0000000000aa",
    email: "admin@bigdropsmarketing.com",
    name: "Admin",
    role,
    twoFactorEnabled: true,
  }
}

function json(body: unknown) {
  return new Request(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("PATCH /api/admin/api-clients/[id]/ip-allowlist", () => {
  beforeEach(() => {
    getSession.mockReset()
    updateApiClientAllowlist.mockReset()
  })

  it("returns 401 and 403 for callers who are not admins", async () => {
    getSession.mockResolvedValue(null)
    const signedOut = await PATCH(json({ ip_allowlist: [] }), {
      params: Promise.resolve({ id }),
    })
    expect(signedOut.status).toBe(401)

    getSession.mockResolvedValue(adminSession("operator"))
    const operator = await PATCH(json({ ip_allowlist: ["203.0.113.10"] }), {
      params: Promise.resolve({ id }),
    })
    expect(operator.status).toBe(403)
    expect(updateApiClientAllowlist).not.toHaveBeenCalled()
  })

  it("rejects an invalid CIDR", async () => {
    getSession.mockResolvedValue(adminSession())
    const response = await PATCH(json({ ip_allowlist: ["10.0.0.0/8"] }), {
      params: Promise.resolve({ id }),
    })
    expect(response.status).toBe(422)
    expect(updateApiClientAllowlist).not.toHaveBeenCalled()
  })
})
