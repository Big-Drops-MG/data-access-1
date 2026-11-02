import { beforeEach, describe, expect, it, vi } from "vitest"

import { SesWebhookError } from "@/lib/ses-webhook"

import { POST } from "./route.js"

const webhook = vi.hoisted(() => {
  class SesWebhookError extends Error {
    readonly kind: "unauthorized" | "unavailable"
    readonly detail: string

    constructor(kind: "unauthorized" | "unavailable", detail: string) {
      super(kind)
      this.name = "SesWebhookError"
      this.kind = kind
      this.detail = detail
    }

    get status(): 401 | 503 {
      return this.kind === "unauthorized" ? 401 : 503
    }
  }

  return {
    handleSesWebhook: vi.fn(),
    SesWebhookError,
  }
})

vi.mock("@/lib/ses-webhook", () => ({
  handleSesWebhook: webhook.handleSesWebhook,
  SesWebhookError: webhook.SesWebhookError,
}))

function post(body: string, contentType = "text/plain; charset=UTF-8") {
  return new Request("https://emailhub.test/api/ext/webhooks/ses", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  })
}

describe("POST /api/ext/webhooks/ses", () => {
  beforeEach(() => {
    webhook.handleSesWebhook.mockReset()
    webhook.handleSesWebhook.mockResolvedValue(undefined)
  })

  it("parses the text/plain body and returns 200", async () => {
    const response = await POST(post('{"Type":"Notification"}'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(webhook.handleSesWebhook).toHaveBeenCalledWith({
      contentType: "text/plain; charset=UTF-8",
      body: '{"Type":"Notification"}',
    })
  })

  it("returns 401 when the notification is rejected", async () => {
    webhook.handleSesWebhook.mockRejectedValue(
      new SesWebhookError("unauthorized", "Signature")
    )

    const response = await POST(post("{}"))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "unauthorized",
        message: "Unauthorized",
        details: [{ path: "Signature", message: "rejected" }],
      },
    })
  })

  it("returns 503 when a dependency is unavailable", async () => {
    webhook.handleSesWebhook.mockRejectedValue(
      new SesWebhookError("unavailable", "redis")
    )

    const response = await POST(post("{}"))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "unavailable",
        message: "Service unavailable",
        details: [{ path: "redis", message: "unreachable" }],
      },
    })
  })

  it("returns 503 without the internal error when handling throws", async () => {
    webhook.handleSesWebhook.mockRejectedValue(new Error("database password"))

    const response = await POST(post("{}"))

    expect(response.status).toBe(503)
    await expect(response.text()).resolves.not.toContain("database password")
  })
})
