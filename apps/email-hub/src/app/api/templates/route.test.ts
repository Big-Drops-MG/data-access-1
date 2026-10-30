import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const listTemplates = vi.hoisted(() => vi.fn())
const createTemplate = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/templates/service", () => ({
  listTemplates,
  createTemplate,
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

describe("GET/POST /api/templates", () => {
  beforeEach(() => {
    getSession.mockReset()
    listTemplates.mockReset()
    createTemplate.mockReset()
  })

  it("lists for a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    listTemplates.mockResolvedValue({ data: [], next_cursor: null })
    const response = await GET(new Request("http://localhost/api/templates"))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [],
      next_cursor: null,
    })
  })

  it("rejects viewer on create", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await POST(
      new Request("http://localhost/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "X",
          category_id: "019a0000-0000-7000-8000-000000000010",
          email_type: "thank_you",
        }),
      })
    )
    expect(response.status).toBe(403)
  })

  it("creates for an operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    createTemplate.mockResolvedValue({
      id: "019a0000-0000-7000-8000-000000000099",
      name: "X",
      status: "draft",
    })
    const response = await POST(
      new Request("http://localhost/api/templates", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-1",
        },
        body: JSON.stringify({
          name: "X",
          category_id: "019a0000-0000-7000-8000-000000000010",
          email_type: "thank_you",
        }),
      })
    )
    expect(response.status).toBe(201)
    expect(createTemplate).toHaveBeenCalledWith(
      {
        name: "X",
        categoryId: "019a0000-0000-7000-8000-000000000010",
        emailType: "thank_you",
      },
      { userId: session("operator").id, requestId: "req-1" }
    )
  })

  it("rejects machine auth headers", async () => {
    const response = await GET(
      new Request("http://localhost/api/templates", {
        headers: { "x-key-id": "k1" },
      })
    )
    expect(response.status).toBe(401)
  })
})
