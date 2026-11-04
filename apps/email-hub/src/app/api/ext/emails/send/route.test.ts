import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const resolveMachineClientFromDb = vi.hoisted(() => vi.fn())
const touchMachineClientLastUsed = vi.hoisted(() => vi.fn())
const consumeMachineRateLimitFromEnv = vi.hoisted(() => vi.fn())
const submitExternalEmail = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/auth/machine-client-lookup", () => ({
  resolveMachineClientFromDb,
  touchMachineClientLastUsed,
}))
vi.mock("@/lib/auth/machine-rate-limit", () => ({
  consumeMachineRateLimitFromEnv,
}))
vi.mock("@/lib/ext-emails/service", () => ({
  submitExternalEmail,
}))

import {
  buildMachineSigningPayload,
  signMachinePayload,
  type MachineClientAuthRecord,
} from "@/lib/auth/machine-hmac"

import { POST } from "./route"

const SECRET = "send-secret"
const KEY_ID = "019a0000-0000-7000-8000-0000000000aa"
const MESSAGE_ID = "019a0000-0000-7000-8000-0000000000bb"

function client(
  overrides: Partial<MachineClientAuthRecord> = {}
): MachineClientAuthRecord {
  return {
    id: KEY_ID,
    status: "active",
    scopes: ["emails:send"],
    ipAllowlist: [],
    secret: SECRET,
    oldSecret: null,
    rotatedAt: null,
    expiresAt: null,
    ...overrides,
  }
}

function signedPost(body: string, scopes = ["emails:send"]): Request {
  resolveMachineClientFromDb.mockResolvedValue(client({ scopes }))
  const path = "/api/ext/emails/send"
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = signMachinePayload(
    SECRET,
    buildMachineSigningPayload({
      timestamp,
      method: "POST",
      pathWithQuery: path,
      body: Buffer.from(body),
    })
  )
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-key-id": KEY_ID,
      "x-timestamp": timestamp,
      "x-signature": signature,
      "x-request-id": "req-send-1",
    },
    body,
  })
}

describe("POST /api/ext/emails/send", () => {
  beforeEach(() => {
    getSession.mockReset()
    getSession.mockResolvedValue(null)
    resolveMachineClientFromDb.mockReset()
    touchMachineClientLastUsed.mockReset()
    touchMachineClientLastUsed.mockResolvedValue(undefined)
    consumeMachineRateLimitFromEnv.mockReset()
    consumeMachineRateLimitFromEnv.mockResolvedValue("ok")
    submitExternalEmail.mockReset()
  })

  it("returns 202 when a message is queued", async () => {
    submitExternalEmail.mockResolvedValue({
      httpStatus: 202,
      body: { message_id: MESSAGE_ID, status: "queued" },
    })
    const body = JSON.stringify({
      to: "person@example.com",
      email_type: "thank_you",
      idempotency_key: "order-1",
    })

    const response = await POST(signedPost(body))

    expect(response.status).toBe(202)
    expect(response.headers.get("x-request-id")).toBe("req-send-1")
    await expect(response.json()).resolves.toEqual({
      message_id: MESSAGE_ID,
      status: "queued",
    })
    expect(submitExternalEmail).toHaveBeenCalledWith({
      apiClientId: KEY_ID,
      to: "person@example.com",
      emailType: "thank_you",
      idempotencyKey: "order-1",
      offerId: null,
      externalUserId: null,
      mergeData: undefined,
    })
  })

  it("returns 200 when the message is recorded but not queued", async () => {
    submitExternalEmail.mockResolvedValue({
      httpStatus: 200,
      body: { message_id: MESSAGE_ID, status: "skipped" },
    })
    const response = await POST(
      signedPost(
        JSON.stringify({
          to: "person@example.com",
          email_type: "engagement",
          idempotency_key: "order-2",
        })
      )
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      message_id: MESSAGE_ID,
      status: "skipped",
    })
  })

  it("returns 401 without machine headers", async () => {
    const response = await POST(
      new Request("http://localhost/api/ext/emails/send", {
        method: "POST",
        body: "{}",
      })
    )
    expect(response.status).toBe(401)
    expect(submitExternalEmail).not.toHaveBeenCalled()
  })

  it("returns 403 when the key cannot send", async () => {
    const response = await POST(
      signedPost(
        JSON.stringify({
          to: "person@example.com",
          email_type: "thank_you",
          idempotency_key: "order-3",
        }),
        ["emails:read"]
      )
    )
    expect(response.status).toBe(403)
    expect(submitExternalEmail).not.toHaveBeenCalled()
  })

  it("returns 400, 413, and 422 for bad bodies", async () => {
    const invalidJson = await POST(signedPost("{"))
    expect(invalidJson.status).toBe(400)

    const tooLarge = await POST(signedPost("{".repeat(64 * 1024 + 1)))
    expect(tooLarge.status).toBe(413)

    const unknownField = await POST(
      signedPost(
        JSON.stringify({
          to: "person@example.com",
          email_type: "thank_you",
          idempotency_key: "order-4",
          template_version_id: MESSAGE_ID,
        })
      )
    )
    expect(unknownField.status).toBe(422)
    expect(submitExternalEmail).not.toHaveBeenCalled()
  })
})
