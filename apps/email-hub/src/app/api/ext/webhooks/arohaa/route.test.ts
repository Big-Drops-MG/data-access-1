import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const resolveMachineClientFromDb = vi.hoisted(() => vi.fn())
const touchMachineClientLastUsed = vi.hoisted(() => vi.fn())
const consumeMachineRateLimitFromEnv = vi.hoisted(() => vi.fn())
const enqueueArohaaTierWebhook = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/auth/machine-client-lookup", () => ({
  resolveMachineClientFromDb,
  touchMachineClientLastUsed,
}))
vi.mock("@/lib/auth/machine-rate-limit", () => ({
  consumeMachineRateLimitFromEnv,
}))
vi.mock("@/lib/arohaa/enqueue", () => ({
  enqueueArohaaTierWebhook,
}))

import {
  buildMachineSigningPayload,
  signMachinePayload,
  type MachineClientAuthRecord,
} from "@/lib/auth/machine-hmac"

import { POST } from "./route"

const SECRET = "arohaa-secret"
const KEY_ID = "019a0000-0000-7000-8000-0000000000aa"

function client(
  overrides: Partial<MachineClientAuthRecord> = {}
): MachineClientAuthRecord {
  return {
    id: KEY_ID,
    status: "active",
    scopes: ["arohaa:webhook"],
    ipAllowlist: [],
    secret: SECRET,
    oldSecret: null,
    rotatedAt: null,
    expiresAt: null,
    ...overrides,
  }
}

function signedPost(body: string, scopes = ["arohaa:webhook"]): Request {
  resolveMachineClientFromDb.mockResolvedValue(client({ scopes }))
  const path = "/api/ext/webhooks/arohaa"
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
      "x-request-id": "019a0000-0000-7000-8000-0000000000ff",
    },
    body,
  })
}

const validBody = {
  event_id: "evt_01J9TEST",
  email: "jane@example.com",
  tier: "premium",
  previous_tier: "standard",
  occurred_at: "2026-10-07T14:00:00.000Z",
}

describe("POST /api/ext/webhooks/arohaa", () => {
  beforeEach(() => {
    getSession.mockReset()
    getSession.mockResolvedValue(null)
    resolveMachineClientFromDb.mockReset()
    touchMachineClientLastUsed.mockReset()
    touchMachineClientLastUsed.mockResolvedValue(undefined)
    consumeMachineRateLimitFromEnv.mockReset()
    consumeMachineRateLimitFromEnv.mockResolvedValue("ok")
    enqueueArohaaTierWebhook.mockReset()
    enqueueArohaaTierWebhook.mockResolvedValue("queued")
  })

  it("returns 202 and enqueues tier sync", async () => {
    const response = await POST(signedPost(JSON.stringify(validBody)))

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: "queued" })
    expect(enqueueArohaaTierWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt_01J9TEST",
        email: "jane@example.com",
        tier: "premium",
        previousTier: "standard",
        occurredAt: "2026-10-07T14:00:00.000Z",
      })
    )
  })

  it("returns 202 for duplicate event enqueue", async () => {
    enqueueArohaaTierWebhook.mockResolvedValue("duplicate")
    const response = await POST(signedPost(JSON.stringify(validBody)))
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ status: "queued" })
  })

  it("rejects missing machine auth", async () => {
    const response = await POST(
      new Request("http://localhost/api/ext/webhooks/arohaa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody),
      })
    )
    expect(response.status).toBe(401)
    expect(enqueueArohaaTierWebhook).not.toHaveBeenCalled()
  })

  it("rejects wrong scope", async () => {
    const response = await POST(
      signedPost(JSON.stringify(validBody), ["emails:send"])
    )
    expect(response.status).toBe(403)
    expect(enqueueArohaaTierWebhook).not.toHaveBeenCalled()
  })

  it("rejects invalid body", async () => {
    const response = await POST(
      signedPost(
        JSON.stringify({
          event_id: "evt_1",
          email: "not-an-email",
          tier: "premium",
          occurred_at: "2026-10-07T14:00:00.000Z",
        })
      )
    )
    expect(response.status).toBe(422)
    expect(enqueueArohaaTierWebhook).not.toHaveBeenCalled()
  })

  it("rejects unknown tier values", async () => {
    const response = await POST(
      signedPost(
        JSON.stringify({
          ...validBody,
          tier: "gold",
        })
      )
    )
    expect(response.status).toBe(422)
  })

  it("returns 503 when Redis enqueue fails", async () => {
    const { AppError } = await import("@workspace/shared")
    enqueueArohaaTierWebhook.mockRejectedValue(
      AppError.unavailable([
        { path: "queue", message: "Sync queue unavailable" },
      ])
    )
    const response = await POST(signedPost(JSON.stringify(validBody)))
    expect(response.status).toBe(503)
  })
})
