import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const rotateApiClientSecret = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/api-clients/service", () => ({ rotateApiClientSecret }))

import { POST } from "./route"

const id = "019a0000-0000-7000-8000-0000000000cc"
const url = `http://localhost/api/admin/api-clients/${id}/rotate`

function adminSession(role: "admin" | "operator" | "viewer" = "admin") {
  return {
    id: "019a0000-0000-7000-8000-0000000000aa",
    email: "admin@bigdropsmarketing.com",
    name: "Admin",
    role,
    twoFactorEnabled: true,
  }
}

describe("POST /api/admin/api-clients/[id]/rotate", () => {
  beforeEach(() => {
    getSession.mockReset()
    rotateApiClientSecret.mockReset()
  })

  it("returns 401 and 403 for callers who are not admins", async () => {
    getSession.mockResolvedValue(null)
    const signedOut = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ id }),
    })
    expect(signedOut.status).toBe(401)

    getSession.mockResolvedValue(adminSession("viewer"))
    const viewer = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ id }),
    })
    expect(viewer.status).toBe(403)
    expect(rotateApiClientSecret).not.toHaveBeenCalled()
  })

  it("returns the new secret once", async () => {
    getSession.mockResolvedValue(adminSession())
    rotateApiClientSecret.mockResolvedValue({
      id,
      secret: "shown-once",
      previous_secret_expires_at: "2026-11-14T12:00:00.000Z",
    })
    const response = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ id }),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      secret: "shown-once",
    })
  })
})
