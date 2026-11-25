import { beforeEach, describe, expect, it, vi } from "vitest"

const { listUsers, requireUsersStaffAccess } = vi.hoisted(() => ({
  listUsers: vi.fn(),
  requireUsersStaffAccess: vi.fn(),
}))

vi.mock("@/lib/users/service", () => ({
  listUsers,
}))

vi.mock("@/lib/users/staff-access", () => ({
  requireUsersStaffAccess,
}))

import { AppError } from "@workspace/shared"

import { GET } from "./route"

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireUsersStaffAccess.mockResolvedValue({
      id: "019a0000-0000-7000-8000-000000000001",
      role: "admin",
    })
  })

  it("returns 403 when staff access is denied", async () => {
    requireUsersStaffAccess.mockRejectedValue(AppError.forbidden())

    const response = await GET(
      new Request("https://hub.example/api/admin/users")
    )
    expect(response.status).toBe(403)
    expect(listUsers).not.toHaveBeenCalled()
  })

  it("returns the managed users list", async () => {
    const users = [
      {
        id: "019a0000-0000-7000-8000-000000000001",
        email: "sami@bigdropsmarketing.com",
        name: "Sami Wasta",
        role: "admin",
        status: "active",
        two_factor_enabled: true,
        two_factor_locked: false,
        last_sign_in_at: "2026-10-08T13:02:00.000Z",
        expires_at: null,
      },
    ]
    listUsers.mockResolvedValue(users)

    const response = await GET(
      new Request("https://hub.example/api/admin/users")
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ users })
  })
})
