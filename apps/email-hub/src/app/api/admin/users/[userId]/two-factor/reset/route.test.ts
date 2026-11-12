import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@workspace/shared"

const getSession = vi.hoisted(() => vi.fn())
const resetManagedUserTwoFactor = vi.hoisted(() => vi.fn())
const logAuthEvent = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/users/service", () => ({ resetManagedUserTwoFactor }))
vi.mock("@/lib/auth/auth-events", () => ({ logAuthEvent }))

import { POST } from "./route"

const userId = "019a0000-0000-7000-8000-000000000001"
const url = `http://localhost/api/admin/users/${userId}/two-factor/reset`

describe("POST /api/admin/users/[userId]/two-factor/reset", () => {
  beforeEach(() => {
    getSession.mockReset()
    resetManagedUserTwoFactor.mockReset()
    logAuthEvent.mockReset()
  })

  it("returns 403 for viewer writes", async () => {
    getSession.mockResolvedValue({
      id: "v",
      email: "viewer@bigdropsmarketing.com",
      name: "Viewer",
      role: "viewer",
      twoFactorEnabled: true,
    })
    const response = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ userId }),
    })
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "forbidden" },
    })
    expect(resetManagedUserTwoFactor).not.toHaveBeenCalled()
  })

  it("returns 403 for non-admin sessions", async () => {
    getSession.mockResolvedValue({
      id: "op",
      email: "op@bigdropsmarketing.com",
      name: "Op",
      role: "operator",
      twoFactorEnabled: true,
    })
    const response = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ userId }),
    })
    expect(response.status).toBe(403)
    expect(resetManagedUserTwoFactor).not.toHaveBeenCalled()
  })

  it("returns 401 when machine keys hit the staff API", async () => {
    getSession.mockResolvedValue({
      id: "admin-1",
      email: "admin@bigdropsmarketing.com",
      name: "Admin",
      role: "admin",
      twoFactorEnabled: true,
    })
    const response = await POST(
      new Request(url, {
        method: "POST",
        headers: { "X-Key-Id": "k1", "X-Signature": "sig" },
      }),
      { params: Promise.resolve({ userId }) }
    )
    expect(response.status).toBe(401)
    expect(resetManagedUserTwoFactor).not.toHaveBeenCalled()
  })

  it("returns 401 when the caller is signed out", async () => {
    getSession.mockResolvedValue(null)
    const response = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ userId }),
    })
    expect(response.status).toBe(401)
    expect(resetManagedUserTwoFactor).not.toHaveBeenCalled()
  })

  it("resets 2FA for an admin and logs auth.2fa_reset", async () => {
    getSession.mockResolvedValue({
      id: "admin-1",
      email: "admin@bigdropsmarketing.com",
      name: "Admin",
      role: "admin",
      twoFactorEnabled: true,
    })
    resetManagedUserTwoFactor.mockResolvedValue(undefined)

    const response = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ userId }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(resetManagedUserTwoFactor).toHaveBeenCalledWith(userId, {
      userId: "admin-1",
      requestId: expect.any(String),
    })
    expect(logAuthEvent).toHaveBeenCalledWith("auth.2fa_reset", {
      user_id: userId,
      admin_user_id: "admin-1",
    })
  })

  it("returns 403 when the service rejects a self reset", async () => {
    getSession.mockResolvedValue({
      id: "admin-1",
      email: "admin@bigdropsmarketing.com",
      name: "Admin",
      role: "admin",
      twoFactorEnabled: true,
    })
    resetManagedUserTwoFactor.mockRejectedValue(
      AppError.forbidden([
        {
          path: "userId",
          message: "You cannot reset your own two-factor authentication",
        },
      ])
    )
    const response = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ userId }),
    })
    expect(response.status).toBe(403)
    expect(logAuthEvent).not.toHaveBeenCalled()
  })

  it("rejects invalid user ids", async () => {
    getSession.mockResolvedValue({
      id: "admin-1",
      email: "admin@bigdropsmarketing.com",
      name: "Admin",
      role: "admin",
      twoFactorEnabled: true,
    })
    const response = await POST(
      new Request(
        "http://localhost/api/admin/users/not-a-uuid/two-factor/reset",
        { method: "POST" }
      ),
      { params: Promise.resolve({ userId: "not-a-uuid" }) }
    )
    expect(response.status).toBe(400)
    expect(resetManagedUserTwoFactor).not.toHaveBeenCalled()
  })
})
