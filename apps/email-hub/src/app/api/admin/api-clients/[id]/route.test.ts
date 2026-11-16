import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const getApiClient = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/api-clients/service", () => ({ getApiClient }))

import { GET } from "./route"

const id = "019a0000-0000-7000-8000-0000000000cc"
const url = `http://localhost/api/admin/api-clients/${id}`

function adminSession() {
  return {
    id: "019a0000-0000-7000-8000-0000000000aa",
    email: "admin@bigdropsmarketing.com",
    name: "Admin",
    role: "admin" as const,
    twoFactorEnabled: true,
  }
}

describe("GET /api/admin/api-clients/[id]", () => {
  beforeEach(() => {
    getSession.mockReset()
    getApiClient.mockReset()
  })

  it("returns 401 when signed out and 403 for an operator", async () => {
    getSession.mockResolvedValue(null)
    const signedOut = await GET(new Request(url), {
      params: Promise.resolve({ id }),
    })
    expect(signedOut.status).toBe(401)

    getSession.mockResolvedValue({ ...adminSession(), role: "operator" })
    const operator = await GET(new Request(url), {
      params: Promise.resolve({ id }),
    })
    expect(operator.status).toBe(403)
    expect(getApiClient).not.toHaveBeenCalled()
  })

  it("returns the client without a secret", async () => {
    getSession.mockResolvedValue(adminSession())
    getApiClient.mockResolvedValue({
      id,
      name: "Billing",
      status: "active",
      scopes: ["emails:send"],
    })
    const response = await GET(new Request(url), {
      params: Promise.resolve({ id }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).not.toHaveProperty("secret")
    expect(JSON.stringify(body)).not.toContain("secret")
  })

  it("returns 400 for a bad id", async () => {
    getSession.mockResolvedValue(adminSession())
    const response = await GET(new Request(url), {
      params: Promise.resolve({ id: "nope" }),
    })
    expect(response.status).toBe(400)
    expect(getApiClient).not.toHaveBeenCalled()
  })
})
