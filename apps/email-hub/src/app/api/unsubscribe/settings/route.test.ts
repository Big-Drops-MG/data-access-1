import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const getUnsubscribeSettings = vi.hoisted(() => vi.fn())
const patchUnsubscribeSettings = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/unsubscribe-admin/settings-service", () => ({
  getUnsubscribeSettings,
  patchUnsubscribeSettings,
}))

import { GET, PATCH } from "./route"

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

const settingsJson = {
  id: "019a0000-0000-7000-8000-0000000000aa",
  logo_url: null,
  custom_domain: null,
  custom_domain_status: "unset",
  verification_token: null,
  verified_at: null,
  public_base_url: "https://hub.example.com",
  hub_host: "hub.example.com",
  dns_records: [],
  updated_at: "2026-11-17T00:00:00.000Z",
}

describe("GET /api/unsubscribe/settings", () => {
  beforeEach(() => {
    getSession.mockReset()
    getUnsubscribeSettings.mockReset()
    patchUnsubscribeSettings.mockReset()
  })

  it("returns settings for a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    getUnsubscribeSettings.mockResolvedValue(settingsJson)

    const response = await GET(
      new Request("http://localhost/api/unsubscribe/settings")
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(settingsJson)
  })

  it("rejects unauthenticated callers", async () => {
    getSession.mockResolvedValue(null)
    const response = await GET(
      new Request("http://localhost/api/unsubscribe/settings")
    )
    expect(response.status).toBe(401)
  })
})

describe("PATCH /api/unsubscribe/settings", () => {
  beforeEach(() => {
    getSession.mockReset()
    getUnsubscribeSettings.mockReset()
    patchUnsubscribeSettings.mockReset()
  })

  it("updates settings for an operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    patchUnsubscribeSettings.mockResolvedValue({
      ...settingsJson,
      logo_url: "https://cdn.example.com/logo.png",
    })

    const response = await PATCH(
      new Request("http://localhost/api/unsubscribe/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          logo_url: "https://cdn.example.com/logo.png",
        }),
      })
    )
    expect(response.status).toBe(200)
    expect(patchUnsubscribeSettings).toHaveBeenCalledWith(
      {
        logoUrl: "https://cdn.example.com/logo.png",
        customDomain: undefined,
      },
      { userId: session("operator").id }
    )
  })

  it("forbids viewers from patching", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await PATCH(
      new Request("http://localhost/api/unsubscribe/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logo_url: null }),
      })
    )
    expect(response.status).toBe(403)
  })

  it("rejects an empty body", async () => {
    getSession.mockResolvedValue(session("operator"))
    const response = await PATCH(
      new Request("http://localhost/api/unsubscribe/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      })
    )
    expect(response.status).toBe(422)
  })
})
