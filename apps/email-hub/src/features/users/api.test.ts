import { afterEach, describe, expect, it, vi } from "vitest"

import {
  disableStaffUser,
  fetchUsersList,
  inviteStaffUser,
  resetStaffUserTwoFactor,
  updateStaffUserRole,
} from "@/features/users/api"

describe("users feature API helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("calls GET /api/admin/users", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ users: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const res = await fetchUsersList()
    expect(res).toEqual({ users: [] })
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users",
      expect.objectContaining({ credentials: "same-origin" })
    )
  })

  it("calls POST /api/admin/users/invitations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "inv-1",
          email: "riya@bigdropsmarketing.com",
          role: "operator",
          status: "invited",
          expires_at: "2026-10-15T00:00:00.000Z",
          created: true,
        }),
        { status: 201, headers: { "content-type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    await inviteStaffUser({
      email: "riya@bigdropsmarketing.com",
      role: "operator",
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/invitations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "riya@bigdropsmarketing.com",
          role: "operator",
        }),
      })
    )
  })

  it("calls PATCH role, POST disable, and POST two-factor reset", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    await updateStaffUserRole("u-1", "admin")
    await disableStaffUser("u-1")
    await resetStaffUserTwoFactor("u-1")

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/users/u-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ role: "admin" }),
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/users/u-1/disable",
      expect.objectContaining({ method: "POST" })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/admin/users/u-1/two-factor/reset",
      expect.objectContaining({ method: "POST" })
    )
  })
})
