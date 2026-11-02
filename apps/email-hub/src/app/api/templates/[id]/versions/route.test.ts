import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const createTemplateVersion = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/templates/service", () => ({
  createTemplateVersion,
}))

import { POST } from "./route"

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

describe("POST /api/templates/{id}/versions", () => {
  beforeEach(() => {
    getSession.mockReset()
    createTemplateVersion.mockReset()
  })

  it("rejects viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await POST(
      new Request(`http://localhost/api/templates/${templateId}/versions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: "Hi",
          body_source: "<p>x</p>",
        }),
      }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(response.status).toBe(403)
  })

  it("creates a version for an operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    createTemplateVersion.mockResolvedValue({
      id: "019a0000-0000-7000-8000-0000000000bb",
      version_no: 1,
    })
    const response = await POST(
      new Request(`http://localhost/api/templates/${templateId}/versions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-1",
        },
        body: JSON.stringify({
          subject: "Hi {{first_name}}",
          body_source: "<p>Hello</p>",
        }),
      }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(response.status).toBe(201)
    expect(createTemplateVersion).toHaveBeenCalledWith(
      templateId,
      { subject: "Hi {{first_name}}", bodySource: "<p>Hello</p>" },
      { userId: session("operator").id, requestId: "req-1" }
    )
  })
})
