import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const revokeInvitation = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/users/service", () => ({ revokeInvitation }))

import { DELETE } from "./route"

const invitationId = "019a0000-0000-7000-8000-000000000005"
const url = `http://localhost/api/admin/users/invitations/${invitationId}`

function adminSession() {
  return {
    id: "019a0000-0000-7000-8000-0000000000aa",
    email: "admin@bigdropsmarketing.com",
    name: "Admin",
    role: "admin" as const,
    twoFactorEnabled: true,
  }
}

describe("DELETE /api/admin/users/invitations/[invitationId]", () => {
  beforeEach(() => {
    getSession.mockReset()
    revokeInvitation.mockReset()
  })

  it("returns 403 for a non-admin", async () => {
    getSession.mockResolvedValue({ ...adminSession(), role: "operator" })
    const response = await DELETE(new Request(url, { method: "DELETE" }), {
      params: Promise.resolve({ invitationId }),
    })
    expect(response.status).toBe(403)
    expect(revokeInvitation).not.toHaveBeenCalled()
  })

  it("revokes the invitation for an admin", async () => {
    getSession.mockResolvedValue(adminSession())
    revokeInvitation.mockResolvedValue({ id: invitationId, deleted: true })

    const response = await DELETE(new Request(url, { method: "DELETE" }), {
      params: Promise.resolve({ invitationId }),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: invitationId,
      deleted: true,
    })
    expect(revokeInvitation).toHaveBeenCalledWith(
      invitationId,
      expect.objectContaining({ userId: adminSession().id })
    )
  })
})
