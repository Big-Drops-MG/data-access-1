import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const disableApiClient = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/api-clients/service", () => ({ disableApiClient }))

import { POST } from "./route"

const id = "019a0000-0000-7000-8000-0000000000cc"
const url = `http://localhost/api/admin/api-clients/${id}/disable`

function adminSession(role: "admin" | "operator" | "viewer" = "admin") {
  return {
    id: "019a0000-0000-7000-8000-0000000000aa",
    email: "admin@bigdropsmarketing.com",
    name: "Admin",
    role,
    twoFactorEnabled: true,
  }
}

describe("POST /api/admin/api-clients/[id]/disable", () => {
  beforeEach(() => {
    getSession.mockReset()
    disableApiClient.mockReset()
  })

  it("returns 401 and 403 for callers who are not admins", async () => {
    getSession.mockResolvedValue(null)
    const signedOut = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ id }),
    })
    expect(signedOut.status).toBe(401)

    getSession.mockResolvedValue(adminSession("operator"))
    const operator = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ id }),
    })
    expect(operator.status).toBe(403)
    expect(disableApiClient).not.toHaveBeenCalled()
  })

  it("returns the revoked client without a secret", async () => {
    getSession.mockResolvedValue(adminSession())
    disableApiClient.mockResolvedValue({
      id,
      status: "revoked",
      already_disabled: false,
    })
    const response = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ id }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ status: "revoked", already_disabled: false })
    expect(body).not.toHaveProperty("secret")
  })
})
