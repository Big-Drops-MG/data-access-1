import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@workspace/shared"

const getSession = vi.hoisted(() => vi.fn())
const inviteUser = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/users/service", () => ({ inviteUser }))

import { POST } from "./route"

const url = "http://localhost/api/admin/users/invitations"

function adminSession() {
  return {
    id: "019a0000-0000-7000-8000-0000000000aa",
    email: "admin@bigdropsmarketing.com",
    name: "Admin",
    role: "admin" as const,
    twoFactorEnabled: true,
  }
}

describe("POST /api/admin/users/invitations", () => {
  beforeEach(() => {
    getSession.mockReset()
    inviteUser.mockReset()
  })

  it("returns 401 when the caller is signed out", async () => {
    getSession.mockResolvedValue(null)
    const response = await POST(
      new Request(url, {
        method: "POST",
        body: JSON.stringify({
          email: "ada@bigdropsmarketing.com",
          role: "operator",
        }),
      })
    )
    expect(response.status).toBe(401)
    expect(inviteUser).not.toHaveBeenCalled()
  })

  it("returns 403 for a non-admin", async () => {
    getSession.mockResolvedValue({ ...adminSession(), role: "operator" })
    const response = await POST(
      new Request(url, {
        method: "POST",
        body: JSON.stringify({
          email: "ada@bigdropsmarketing.com",
          role: "operator",
        }),
      })
    )
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "forbidden" },
    })
    expect(inviteUser).not.toHaveBeenCalled()
  })

  it("returns 401 when machine keys hit the staff API", async () => {
    getSession.mockResolvedValue(adminSession())
    const response = await POST(
      new Request(url, {
        method: "POST",
        headers: { "X-Key-Id": "k1" },
        body: JSON.stringify({
          email: "ada@bigdropsmarketing.com",
          role: "operator",
        }),
      })
    )
    expect(response.status).toBe(401)
    expect(inviteUser).not.toHaveBeenCalled()
  })

  it("returns 422 for an invalid email or role", async () => {
    getSession.mockResolvedValue(adminSession())
    const response = await POST(
      new Request(url, {
        method: "POST",
        body: JSON.stringify({ email: "ada@gmail.com", role: "operator" }),
      })
    )
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "validation_failed",
        details: [{ path: "email" }],
      },
    })
    expect(inviteUser).not.toHaveBeenCalled()
  })

  it("returns 201 for a new invitation and hides the secret", async () => {
    getSession.mockResolvedValue(adminSession())
    inviteUser.mockResolvedValue({
      id: "019a0000-0000-7000-8000-000000000010",
      email: "ada@bigdropsmarketing.com",
      role: "operator",
      status: "invited",
      expires_at: "2026-11-19T00:00:00.000Z",
      created: true,
    })
    const response = await POST(
      new Request(url, {
        method: "POST",
        body: JSON.stringify({
          email: "ada@bigdropsmarketing.com",
          role: "operator",
        }),
      })
    )
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      id: "019a0000-0000-7000-8000-000000000010",
      email: "ada@bigdropsmarketing.com",
      role: "operator",
      status: "invited",
      expires_at: "2026-11-19T00:00:00.000Z",
      created: true,
    })
  })

  it("returns 409 when the user already exists", async () => {
    getSession.mockResolvedValue(adminSession())
    inviteUser.mockRejectedValue(
      AppError.conflict([{ path: "email", message: "User already exists" }])
    )
    const response = await POST(
      new Request(url, {
        method: "POST",
        body: JSON.stringify({
          email: "ada@bigdropsmarketing.com",
          role: "operator",
        }),
      })
    )
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "conflict" },
    })
  })
})
