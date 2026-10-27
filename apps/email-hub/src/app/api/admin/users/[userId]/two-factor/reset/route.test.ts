import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const resetTwoFactorForAdmin = vi.hoisted(() => vi.fn())
const logAuthEvent = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/auth/two-factor-lockout", () => ({ resetTwoFactorForAdmin }))
vi.mock("@/lib/auth/auth-events", () => ({ logAuthEvent }))

import { POST } from "./route"

const userId = "019a0000-0000-7000-8000-000000000001"

describe("POST /api/admin/users/[userId]/two-factor/reset", () => {
  beforeEach(() => {
    getSession.mockReset()
    resetTwoFactorForAdmin.mockReset()
    logAuthEvent.mockReset()
  })

  it("returns 403 for non-admin sessions", async () => {
    getSession.mockResolvedValue({
      id: "op",
      email: "op@bigdropsmarketing.com",
      name: "Op",
      role: "operator",
      twoFactorEnabled: true,
    })
    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ userId }),
    })
    expect(response.status).toBe(403)
    expect(resetTwoFactorForAdmin).not.toHaveBeenCalled()
  })

  it("resets 2FA for an admin and logs auth.2fa_reset", async () => {
    getSession.mockResolvedValue({
      id: "admin-1",
      email: "admin@bigdropsmarketing.com",
      name: "Admin",
      role: "admin",
      twoFactorEnabled: true,
    })
    resetTwoFactorForAdmin.mockResolvedValue(undefined)

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ userId }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(resetTwoFactorForAdmin).toHaveBeenCalledWith(userId)
    expect(logAuthEvent).toHaveBeenCalledWith("auth.2fa_reset", {
      user_id: userId,
      admin_user_id: "admin-1",
    })
  })

  it("rejects invalid user ids", async () => {
    getSession.mockResolvedValue({
      id: "admin-1",
      email: "admin@bigdropsmarketing.com",
      name: "Admin",
      role: "admin",
      twoFactorEnabled: true,
    })
    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ userId: "not-a-uuid" }),
    })
    expect(response.status).toBe(400)
    expect(resetTwoFactorForAdmin).not.toHaveBeenCalled()
  })
})
