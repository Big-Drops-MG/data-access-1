import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@workspace/shared"

const getSession = vi.hoisted(() => vi.fn())
const updateUserRole = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/users/service", () => ({ updateUserRole }))

import { PATCH } from "./route"

const userId = "019a0000-0000-7000-8000-000000000003"
const url = `http://localhost/api/admin/users/${userId}`

function adminSession(id = "019a0000-0000-7000-8000-0000000000aa") {
  return {
    id,
    email: "admin@bigdropsmarketing.com",
    name: "Admin",
    role: "admin" as const,
    twoFactorEnabled: true,
  }
}

describe("PATCH /api/admin/users/[userId]", () => {
  beforeEach(() => {
    getSession.mockReset()
    updateUserRole.mockReset()
  })

  it("returns 401 when the caller is signed out", async () => {
    getSession.mockResolvedValue(null)
    const response = await PATCH(
      new Request(url, {
        method: "PATCH",
        body: JSON.stringify({ role: "viewer" }),
      }),
      { params: Promise.resolve({ userId }) }
    )
    expect(response.status).toBe(401)
    expect(updateUserRole).not.toHaveBeenCalled()
  })

  it("returns 403 for a viewer", async () => {
    getSession.mockResolvedValue({ ...adminSession(), role: "viewer" })
    const response = await PATCH(
      new Request(url, {
        method: "PATCH",
        body: JSON.stringify({ role: "viewer" }),
      }),
      { params: Promise.resolve({ userId }) }
    )
    expect(response.status).toBe(403)
    expect(updateUserRole).not.toHaveBeenCalled()
  })

  it("returns 400 for an invalid user id and 422 for an invalid role", async () => {
    getSession.mockResolvedValue(adminSession())
    const invalidId = await PATCH(
      new Request("http://localhost/api/admin/users/nope", {
        method: "PATCH",
        body: JSON.stringify({ role: "viewer" }),
      }),
      { params: Promise.resolve({ userId: "nope" }) }
    )
    expect(invalidId.status).toBe(400)
    const invalidRole = await PATCH(
      new Request(url, {
        method: "PATCH",
        body: JSON.stringify({ role: "owner" }),
      }),
      { params: Promise.resolve({ userId }) }
    )
    expect(invalidRole.status).toBe(422)
    expect(updateUserRole).not.toHaveBeenCalled()
  })

  it("returns the updated user", async () => {
    getSession.mockResolvedValue(adminSession())
    updateUserRole.mockResolvedValue({
      id: userId,
      email: "op@bigdropsmarketing.com",
      name: "Op",
      role: "viewer",
      status: "active",
      two_factor_enabled: true,
    })
    const response = await PATCH(
      new Request(url, {
        method: "PATCH",
        body: JSON.stringify({ role: "viewer" }),
      }),
      { params: Promise.resolve({ userId }) }
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ role: "viewer" })
    expect(updateUserRole).toHaveBeenCalledWith(
      userId,
      "viewer",
      expect.objectContaining({ userId: adminSession().id })
    )
  })

  it("returns 403 and 409 from the role rules", async () => {
    getSession.mockResolvedValue(adminSession())
    updateUserRole.mockRejectedValueOnce(
      AppError.forbidden([
        { path: "userId", message: "You cannot change your own role" },
      ])
    )
    const forbidden = await PATCH(
      new Request(url, {
        method: "PATCH",
        body: JSON.stringify({ role: "viewer" }),
      }),
      { params: Promise.resolve({ userId }) }
    )
    expect(forbidden.status).toBe(403)

    updateUserRole.mockRejectedValueOnce(
      AppError.conflict([
        {
          path: "role",
          message: "The last active Admin cannot be demoted",
        },
      ])
    )
    const conflict = await PATCH(
      new Request(url, {
        method: "PATCH",
        body: JSON.stringify({ role: "viewer" }),
      }),
      { params: Promise.resolve({ userId }) }
    )
    expect(conflict.status).toBe(409)
  })
})
