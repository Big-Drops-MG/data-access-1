import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const sendTemplateTest = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/templates/test-send", () => ({
  sendTemplateTest,
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

function request(body: unknown) {
  return new Request(`http://localhost/api/templates/${templateId}/test-send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/templates/{id}/test-send", () => {
  beforeEach(() => {
    getSession.mockReset()
    sendTemplateTest.mockReset()
  })

  it("rejects a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const response = await POST(request({ version_id: versionId }), {
      params: Promise.resolve({ id: templateId }),
    })
    expect(response.status).toBe(403)
    expect(sendTemplateTest).not.toHaveBeenCalled()
  })

  it("queues for an operator and does not let the body set the recipient", async () => {
    getSession.mockResolvedValue(session("operator"))
    sendTemplateTest.mockResolvedValue({
      message_id: "019a0000-0000-7000-8000-0000000000cc",
      status: "queued",
      environment: "test",
      httpStatus: 202,
    })
    const response = await POST(
      request({
        version_id: versionId,
        offer_id: null,
      }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({
      message_id: "019a0000-0000-7000-8000-0000000000cc",
      status: "queued",
      environment: "test",
    })
    expect(sendTemplateTest).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId,
        versionId,
        email: "a@example.com",
        offerId: null,
      }),
      expect.objectContaining({ userId: session("operator").id })
    )
  })

  it("rejects a body that names a recipient", async () => {
    getSession.mockResolvedValue(session("operator"))
    const response = await POST(
      request({ version_id: versionId, email: "other@example.com" }),
      { params: Promise.resolve({ id: templateId }) }
    )
    expect(response.status).toBe(422)
    expect(sendTemplateTest).not.toHaveBeenCalled()
  })
})
