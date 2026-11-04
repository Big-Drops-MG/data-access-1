import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@workspace/shared"

const getSession = vi.hoisted(() => vi.fn())
const resolveMachineClientFromDb = vi.hoisted(() => vi.fn())
const touchMachineClientLastUsed = vi.hoisted(() => vi.fn())
const consumeMachineRateLimitFromEnv = vi.hoisted(() => vi.fn())
const getExternalEmailStatus = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/auth/machine-client-lookup", () => ({
  resolveMachineClientFromDb,
  touchMachineClientLastUsed,
}))
vi.mock("@/lib/auth/machine-rate-limit", () => ({
  consumeMachineRateLimitFromEnv,
}))
vi.mock("@/lib/ext-emails/service", () => ({
  getExternalEmailStatus,
}))

import {
  buildMachineSigningPayload,
  signMachinePayload,
  type MachineClientAuthRecord,
} from "@/lib/auth/machine-hmac"

import { GET } from "./route"

const SECRET = "read-secret"
const KEY_ID = "019a0000-0000-7000-8000-0000000000aa"
const MESSAGE_ID = "019a0000-0000-7000-8000-0000000000bb"

function client(
  overrides: Partial<MachineClientAuthRecord> = {}
): MachineClientAuthRecord {
  return {
    id: KEY_ID,
    status: "active",
    scopes: ["emails:read"],
    ipAllowlist: [],
    secret: SECRET,
    oldSecret: null,
    rotatedAt: null,
    expiresAt: null,
    ...overrides,
  }
}

function signedGet(messageId: string, scopes = ["emails:read"]): Request {
  resolveMachineClientFromDb.mockResolvedValue(client({ scopes }))
  const path = `/api/ext/emails/${messageId}`
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = signMachinePayload(
    SECRET,
    buildMachineSigningPayload({
      timestamp,
      method: "GET",
      pathWithQuery: path,
      body: Buffer.alloc(0),
    })
  )
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: {
      "x-key-id": KEY_ID,
      "x-timestamp": timestamp,
      "x-signature": signature,
      "x-request-id": "req-read-1",
    },
  })
}

describe("GET /api/ext/emails/{message_id}", () => {
  beforeEach(() => {
    getSession.mockReset()
    getSession.mockResolvedValue(null)
    resolveMachineClientFromDb.mockReset()
    touchMachineClientLastUsed.mockReset()
    touchMachineClientLastUsed.mockResolvedValue(undefined)
    consumeMachineRateLimitFromEnv.mockReset()
    consumeMachineRateLimitFromEnv.mockResolvedValue("ok")
    getExternalEmailStatus.mockReset()
  })

  it("returns the stored status", async () => {
    getExternalEmailStatus.mockResolvedValue({
      message_id: MESSAGE_ID,
      status: "sent",
    })

    const response = await GET(signedGet(MESSAGE_ID), {
      params: Promise.resolve({ message_id: MESSAGE_ID }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("x-request-id")).toBe("req-read-1")
    await expect(response.json()).resolves.toEqual({
      message_id: MESSAGE_ID,
      status: "sent",
    })
    expect(getExternalEmailStatus).toHaveBeenCalledWith(MESSAGE_ID, KEY_ID)
  })

  it("returns 404 when the message does not exist", async () => {
    getExternalEmailStatus.mockRejectedValue(
      AppError.notFound([{ path: "message_id", message: "Not found" }])
    )
    const response = await GET(signedGet(MESSAGE_ID), {
      params: Promise.resolve({ message_id: MESSAGE_ID }),
    })
    expect(response.status).toBe(404)
  })

  it("returns 422 for a message id that is not a uuid v7", async () => {
    const response = await GET(signedGet("not-a-uuid"), {
      params: Promise.resolve({ message_id: "not-a-uuid" }),
    })
    expect(response.status).toBe(422)
    expect(getExternalEmailStatus).not.toHaveBeenCalled()
  })

  it("returns 403 when the key cannot read", async () => {
    const response = await GET(signedGet(MESSAGE_ID, ["emails:send"]), {
      params: Promise.resolve({ message_id: MESSAGE_ID }),
    })
    expect(response.status).toBe(403)
    expect(getExternalEmailStatus).not.toHaveBeenCalled()
  })
})
