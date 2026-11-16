import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const listOffers = vi.hoisted(() => vi.fn())
const importOfferFromEverflow = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/offers/service", () => ({
  listOffers,
  importOfferFromEverflow,
}))

import { GET, POST } from "./route"

function session(role: "viewer" | "operator" | "admin") {
  return {
    id: "019a0000-0000-7000-8000-000000000001",
    email: "a@example.com",
    name: "A",
    image: null,
    role,
    jobTitle: "Web Developer",
    twoFactorEnabled: true,
  }
}

describe("GET /api/offers", () => {
  beforeEach(() => {
    getSession.mockReset()
    listOffers.mockReset()
    importOfferFromEverflow.mockReset()
  })

  it("lists active offers for a viewer by default", async () => {
    getSession.mockResolvedValue(session("viewer"))
    listOffers.mockResolvedValue({ data: [] })
    const response = await GET(new Request("http://localhost/api/offers"))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ data: [] })
    expect(listOffers).toHaveBeenCalledWith({ limit: 100, status: "active" })
  })

  it("rejects unauthenticated callers", async () => {
    getSession.mockResolvedValue(null)
    const response = await GET(new Request("http://localhost/api/offers"))
    expect(response.status).toBe(401)
    expect(listOffers).not.toHaveBeenCalled()
  })

  it("rejects unknown query parameters", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await GET(
      new Request("http://localhost/api/offers?bogus=1")
    )
    expect(response.status).toBe(422)
  })
})

describe("POST /api/offers", () => {
  beforeEach(() => {
    getSession.mockReset()
    listOffers.mockReset()
    importOfferFromEverflow.mockReset()
  })

  it("imports an offer for an admin", async () => {
    getSession.mockResolvedValue(session("admin"))
    importOfferFromEverflow.mockResolvedValue({
      id: "019a0000-0000-7000-8000-0000000000aa",
      everflow_offer_id: 2049,
      name: "Quotifii",
      has_optizmo_mailer_access_key: true,
    })

    const response = await POST(
      new Request("http://localhost/api/offers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ everflow_offer_id: 2049 }),
      })
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      everflow_offer_id: 2049,
    })
    expect(importOfferFromEverflow).toHaveBeenCalledWith(
      2049,
      expect.objectContaining({ userId: session("admin").id })
    )
  })

  it("forbids viewers from importing", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await POST(
      new Request("http://localhost/api/offers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ everflow_offer_id: 2049 }),
      })
    )
    expect(response.status).toBe(403)
    expect(importOfferFromEverflow).not.toHaveBeenCalled()
  })
})
