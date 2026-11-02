import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const publishTemplateVersion = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/templates/service", () => ({
  publishTemplateVersion,
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
const versionId = "019a0000-0000-7000-8000-0000000000bb"

describe("POST /api/templates/{id}/publish", () => {
  beforeEach(() => {
    getSession.mockReset()
    publishTemplateVersion.mockReset()
  })

  it("rejects viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await POST(
      new Request(`http://localhost/api/templates/${templateId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version_id: versionId }),
      }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(response.status).toBe(403)
  })

  it("publishes for operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    publishTemplateVersion.mockResolvedValue({
      id: templateId,
      current_version_id: versionId,
      status: "active",
    })
    const response = await POST(
      new Request(`http://localhost/api/templates/${templateId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version_id: versionId }),
      }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(response.status).toBe(200)
    expect(publishTemplateVersion).toHaveBeenCalledWith(
      templateId,
      versionId,
      expect.objectContaining({ userId: session("operator").id })
    )
  })
})
