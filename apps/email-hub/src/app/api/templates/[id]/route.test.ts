import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const getTemplate = vi.hoisted(() => vi.fn())
const updateTemplate = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/templates/service", () => ({
  getTemplate,
  updateTemplate,
}))

import { GET, PATCH } from "./route"

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

const templateId = "019a0000-0000-7000-8000-0000000000aa"

describe("GET/PATCH /api/templates/{id}", () => {
  beforeEach(() => {
    getSession.mockReset()
    getTemplate.mockReset()
    updateTemplate.mockReset()
  })

  it("returns detail for a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    getTemplate.mockResolvedValue({
      id: templateId,
      name: "T",
      versions: [],
    })
    const response = await GET(
      new Request(`http://localhost/api/templates/${templateId}`),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(response.status).toBe(200)
    expect(getTemplate).toHaveBeenCalledWith(templateId)
  })

  it("rejects viewer on patch", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await PATCH(
      new Request(`http://localhost/api/templates/${templateId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(response.status).toBe(403)
  })

  it("patches for an operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    updateTemplate.mockResolvedValue({ id: templateId, status: "archived" })
    const response = await PATCH(
      new Request(`http://localhost/api/templates/${templateId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-1",
        },
        body: JSON.stringify({ status: "archived" }),
      }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(response.status).toBe(200)
    expect(updateTemplate).toHaveBeenCalledWith(
      templateId,
      { name: undefined, categoryId: undefined, status: "archived" },
      { userId: session("operator").id, requestId: "req-1" }
    )
  })

  it("rejects invalid template id", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await GET(
      new Request("http://localhost/api/templates/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    )
    expect(response.status).toBe(422)
  })
})
