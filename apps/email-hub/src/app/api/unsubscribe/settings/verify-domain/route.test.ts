import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const verifyUnsubscribeCustomDomain = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/unsubscribe-admin/settings-service", () => ({
  verifyUnsubscribeCustomDomain,
}))

import { POST } from "./route"

function session(role: "viewer" | "operator" | "admin") {
  return {
    id: "019a0000-0000-7000-8000-000000000001",
    email: "staff@example.com",
    name: "Staff",
    image: null,
    role,
    jobTitle: "Web Developer",
    twoFactorEnabled: true,
  }
}

describe("POST /api/unsubscribe/settings/verify-domain", () => {
  beforeEach(() => {
    getSession.mockReset()
    verifyUnsubscribeCustomDomain.mockReset()
  })

  it("verifies for an operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    verifyUnsubscribeCustomDomain.mockResolvedValue({
      id: "019a0000-0000-7000-8000-0000000000aa",
      custom_domain: "unsub.example.com",
      custom_domain_status: "verified",
    })

    const response = await POST(
      new Request("http://localhost/api/unsubscribe/settings/verify-domain", {
        method: "POST",
      })
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      custom_domain_status: "verified",
    })
  })

  it("forbids viewers", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await POST(
      new Request("http://localhost/api/unsubscribe/settings/verify-domain", {
        method: "POST",
      })
    )
    expect(response.status).toBe(403)
  })

  it("rejects unauthenticated callers", async () => {
    getSession.mockResolvedValue(null)
    const response = await POST(
      new Request("http://localhost/api/unsubscribe/settings/verify-domain", {
        method: "POST",
      })
    )
    expect(response.status).toBe(401)
  })
})
