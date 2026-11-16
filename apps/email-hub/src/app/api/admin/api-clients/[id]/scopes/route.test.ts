import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const updateApiClientScopes = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/api-clients/service", () => ({ updateApiClientScopes }))

import { PATCH } from "./route"

const id = "019a0000-0000-7000-8000-0000000000cc"
const url = `http://localhost/api/admin/api-clients/${id}/scopes`

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

describe("PATCH /api/admin/api-clients/[id]/scopes", () => {
  beforeEach(() => {
    getSession.mockReset()
    updateApiClientScopes.mockReset()
  })

  it("returns 401 and 403 for callers who are not admins", async () => {
    getSession.mockResolvedValue(null)
    const signedOut = await PATCH(json({ scopes: ["emails:read"] }), {
      params: Promise.resolve({ id }),
    })
    expect(signedOut.status).toBe(401)

    getSession.mockResolvedValue(adminSession("viewer"))
    const viewer = await PATCH(json({ scopes: ["emails:read"] }), {
      params: Promise.resolve({ id }),
    })
    expect(viewer.status).toBe(403)
    expect(updateApiClientScopes).not.toHaveBeenCalled()
  })

  it("rejects an unknown scope and returns the updated list", async () => {
    getSession.mockResolvedValue(adminSession())
    const invalid = await PATCH(json({ scopes: ["root"] }), {
      params: Promise.resolve({ id }),
    })
    expect(invalid.status).toBe(422)
    expect(updateApiClientScopes).not.toHaveBeenCalled()

    updateApiClientScopes.mockResolvedValue({
      id,
      scopes: ["emails:read"],
    })
    const response = await PATCH(json({ scopes: ["emails:read"] }), {
      params: Promise.resolve({ id }),
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.scopes).toEqual(["emails:read"])
    expect(body).not.toHaveProperty("secret")
  })
})
