import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const listUnsubscribeOptOuts = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/unsubscribe-admin/opt-outs-service", () => ({
  listUnsubscribeOptOuts,
}))

import { GET } from "./route"

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

describe("GET /api/unsubscribe/opt-outs", () => {
  beforeEach(() => {
    getSession.mockReset()
    listUnsubscribeOptOuts.mockReset()
  })

  it("lists opt-outs for a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    listUnsubscribeOptOuts.mockResolvedValue({
      data: [
        {
          id: "019a0000-0000-7000-8000-0000000000aa",
          kind: "category",
          email: "ada@example.com",
        },
      ],
      next_cursor: null,
    })

    const response = await GET(
      new Request(
        "http://localhost/api/unsubscribe/opt-outs?limit=10&scope=category&q=ada"
      )
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      data: [{ kind: "category" }],
      next_cursor: null,
    })
    expect(listUnsubscribeOptOuts).toHaveBeenCalledWith({
      limit: 10,
      cursor: undefined,
      q: "ada",
      scope: "category",
    })
  })

  it("rejects unauthenticated callers", async () => {
    getSession.mockResolvedValue(null)
    const response = await GET(
      new Request("http://localhost/api/unsubscribe/opt-outs")
    )
    expect(response.status).toBe(401)
  })

  it("rejects invalid query params", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await GET(
      new Request("http://localhost/api/unsubscribe/opt-outs?scope=nope")
    )
    expect(response.status).toBe(422)
  })
})
