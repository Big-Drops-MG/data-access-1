import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const createApiClient = vi.hoisted(() => vi.fn())
const listApiClients = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/api-clients/service", () => ({
  createApiClient,
  listApiClients,
}))

import { GET, POST } from "./route"

const url = "http://localhost/api/admin/api-clients"

function adminSession() {
  return {
    id: "019a0000-0000-7000-8000-0000000000aa",
    email: "admin@bigdropsmarketing.com",
    name: "Admin",
    role: "admin" as const,
    twoFactorEnabled: true,
  }
}

function json(body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("API client collection routes", () => {
  beforeEach(() => {
    getSession.mockReset()
    createApiClient.mockReset()
    listApiClients.mockReset()
  })

  it("returns 401 when the caller is signed out", async () => {
    getSession.mockResolvedValue(null)
    const response = await POST(
      json({ name: "Billing", scopes: ["emails:send"] })
    )
    expect(response.status).toBe(401)
    expect(createApiClient).not.toHaveBeenCalled()
  })

  it("returns 403 for an operator and a viewer", async () => {
    getSession.mockResolvedValue({ ...adminSession(), role: "operator" })
    const operator = await POST(
      json({ name: "Billing", scopes: ["emails:send"] })
    )
    expect(operator.status).toBe(403)

    getSession.mockResolvedValue({ ...adminSession(), role: "viewer" })
    const viewer = await GET(new Request(url))
    expect(viewer.status).toBe(403)
    expect(createApiClient).not.toHaveBeenCalled()
    expect(listApiClients).not.toHaveBeenCalled()
  })

  it("returns 401 when a machine key calls the staff route", async () => {
    getSession.mockResolvedValue(adminSession())
    const response = await POST(
      new Request(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-key-id": "019a0000-0000-7000-8000-0000000000bb",
        },
        body: JSON.stringify({ name: "Billing", scopes: ["emails:send"] }),
      })
    )
    expect(response.status).toBe(401)
    expect(createApiClient).not.toHaveBeenCalled()
  })

  it("returns the secret once on create and omits it from the list", async () => {
    getSession.mockResolvedValue(adminSession())
    createApiClient.mockResolvedValue({
      id: "019a0000-0000-7000-8000-0000000000cc",
      name: "Billing",
      secret: "shown-once",
      status: "active",
    })
    listApiClients.mockResolvedValue({
      api_clients: [
        {
          id: "019a0000-0000-7000-8000-0000000000cc",
          name: "Billing",
          status: "active",
        },
      ],
    })

    const created = await POST(
      json({ name: "Billing", scopes: ["emails:send"], ip_allowlist: [] })
    )
    expect(created.status).toBe(201)
    await expect(created.json()).resolves.toMatchObject({
      secret: "shown-once",
    })

    const listed = await GET(new Request(url))
    const body = await listed.json()
    expect(JSON.stringify(body)).not.toContain("shown-once")
    expect(body.api_clients[0]).not.toHaveProperty("secret")
  })

  it("rejects an unknown scope", async () => {
    getSession.mockResolvedValue(adminSession())
    const response = await POST(
      json({ name: "Billing", scopes: ["emails:admin"] })
    )
    expect(response.status).toBe(422)
    expect(createApiClient).not.toHaveBeenCalled()
  })
})
