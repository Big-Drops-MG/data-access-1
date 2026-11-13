import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@workspace/shared"

const getSession = vi.hoisted(() => vi.fn())
const disableUser = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/users/service", () => ({ disableUser }))

import { POST } from "./route"

const userId = "019a0000-0000-7000-8000-000000000003"
const url = `http://localhost/api/admin/users/${userId}/disable`

function adminSession() {
  return {
    id: "019a0000-0000-7000-8000-0000000000aa",
    email: "admin@bigdropsmarketing.com",
    name: "Admin",
    role: "admin" as const,
    twoFactorEnabled: true,
  }
}

describe("POST /api/admin/users/[userId]/disable", () => {
  beforeEach(() => {
    getSession.mockReset()
    disableUser.mockReset()
  })

  it("returns 401 when the caller is signed out", async () => {
    getSession.mockResolvedValue(null)
    const response = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ userId }),
    })
    expect(response.status).toBe(401)
    expect(disableUser).not.toHaveBeenCalled()
  })

  it("returns 403 for an operator", async () => {
    getSession.mockResolvedValue({ ...adminSession(), role: "operator" })
    const response = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ userId }),
    })
    expect(response.status).toBe(403)
    expect(disableUser).not.toHaveBeenCalled()
  })

  it("returns the disabled user", async () => {
    getSession.mockResolvedValue(adminSession())
    disableUser.mockResolvedValue({
      id: userId,
      email: "op@bigdropsmarketing.com",
      name: "Op",
      role: "operator",
      status: "deactivated",
      two_factor_enabled: true,
      already_disabled: false,
    })
    const response = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ userId }),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      status: "deactivated",
      already_disabled: false,
    })
  })

  it("returns 403 and 409 from the disable rules", async () => {
    getSession.mockResolvedValue(adminSession())
    disableUser.mockRejectedValueOnce(
      AppError.forbidden([
        { path: "userId", message: "You cannot disable your own account" },
      ])
    )
    const forbidden = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ userId }),
    })
    expect(forbidden.status).toBe(403)

    disableUser.mockRejectedValueOnce(
      AppError.conflict([
        {
          path: "status",
          message: "The last active Admin cannot be disabled",
        },
      ])
    )
    const conflict = await POST(new Request(url, { method: "POST" }), {
      params: Promise.resolve({ userId }),
    })
    expect(conflict.status).toBe(409)
  })
})
