import { describe, expect, it, vi } from "vitest"

import { type AppError } from "@workspace/shared"

import {
  MACHINE_OLD_SECRET_TTL_MS,
  authenticateMachineRequest,
  buildMachineSigningPayload,
  signMachinePayload,
  type MachineClientAuthRecord,
} from "@/lib/auth/machine-hmac"

const SECRET = "test-secret-current"
const OLD_SECRET = "test-secret-old"
const KEY_ID = "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44"

function activeClient(
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
    ...overrides,
  }
}

function signedRequest(input: {
  method?: string
  path?: string
  body?: string
  secret?: string
  timestamp?: number
  keyId?: string
  signature?: string
}): { request: Request; body: Buffer; timestamp: number } {
  const method = input.method ?? "POST"
  const path = input.path ?? "/api/ext/emails/send"
  const body = Buffer.from(input.body ?? '{"ok":true}', "utf8")
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000)
  const secret = input.secret ?? SECRET
  const payload = buildMachineSigningPayload({
    timestamp: String(timestamp),
    method,
    pathWithQuery: path,
    body,
  })
  const signature = input.signature ?? signMachinePayload(secret, payload)

  const request = new Request(`https://emailhub.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-key-id": input.keyId ?? KEY_ID,
      "x-timestamp": String(timestamp),
      "x-signature": signature,
      "x-forwarded-for": "203.0.113.10",
    },
    body,
  })

  return { request, body, timestamp }
}

describe("authenticateMachineRequest", () => {
  it("accepts a valid HMAC signature", async () => {
    const { request, body } = signedRequest({})
    const client = await authenticateMachineRequest(request, body, {
      requiredScope: "emails:send",
      resolveClient: async () => activeClient(),
      consumeRateLimit: async () => "ok",
    })
    expect(client.id).toBe(KEY_ID)
  })

  it("returns 401 for a bad signature", async () => {
    const { request, body } = signedRequest({ signature: "deadbeef".repeat(8) })
    await expect(
      authenticateMachineRequest(request, body, {
        requiredScope: "emails:send",
        resolveClient: async () => activeClient(),
        consumeRateLimit: async () => "ok",
      })
    ).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    } satisfies Partial<AppError>)
  })

  it("returns 401 for an old timestamp", async () => {
    const now = new Date("2026-10-29T12:00:00.000Z")
    const { request, body } = signedRequest({
      timestamp: Math.floor(now.getTime() / 1000) - 301,
    })
    await expect(
      authenticateMachineRequest(request, body, {
        requiredScope: "emails:send",
        resolveClient: async () => activeClient(),
        consumeRateLimit: async () => "ok",
        now: () => now,
      })
    ).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    } satisfies Partial<AppError>)
  })

  it("returns 403 for the wrong scope", async () => {
    const { request, body } = signedRequest({})
    await expect(
      authenticateMachineRequest(request, body, {
        requiredScope: "emails:read",
        resolveClient: async () => activeClient({ scopes: ["emails:send"] }),
        consumeRateLimit: async () => "ok",
      })
    ).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    } satisfies Partial<AppError>)
  })

  it("returns 429 when the key is rate limited", async () => {
    const { request, body } = signedRequest({})
    await expect(
      authenticateMachineRequest(request, body, {
        requiredScope: "emails:send",
        resolveClient: async () => activeClient(),
        consumeRateLimit: async () => "limited",
      })
    ).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    } satisfies Partial<AppError>)
  })

  it("returns 503 when the rate limiter is unavailable", async () => {
    const { request, body } = signedRequest({})
    await expect(
      authenticateMachineRequest(request, body, {
        requiredScope: "emails:send",
        resolveClient: async () => activeClient(),
        consumeRateLimit: async () => "unavailable",
      })
    ).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    } satisfies Partial<AppError>)
  })

  it("accepts the old secret within the 24 h rotation window", async () => {
    const now = new Date("2026-10-29T12:00:00.000Z")
    const rotatedAt = new Date(now.getTime() - MACHINE_OLD_SECRET_TTL_MS / 2)
    const { request, body } = signedRequest({
      secret: OLD_SECRET,
      timestamp: Math.floor(now.getTime() / 1000),
    })
    const client = await authenticateMachineRequest(request, body, {
      requiredScope: "emails:send",
      resolveClient: async () =>
        activeClient({
          secret: SECRET,
          oldSecret: OLD_SECRET,
          rotatedAt,
        }),
      consumeRateLimit: async () => "ok",
      now: () => now,
    })
    expect(client.id).toBe(KEY_ID)
  })

  it("rejects the old secret after the 24 h window", async () => {
    const now = new Date("2026-10-29T12:00:00.000Z")
    const rotatedAt = new Date(now.getTime() - MACHINE_OLD_SECRET_TTL_MS - 1)
    const { request, body } = signedRequest({
      secret: OLD_SECRET,
      timestamp: Math.floor(now.getTime() / 1000),
    })
    await expect(
      authenticateMachineRequest(request, body, {
        requiredScope: "emails:send",
        resolveClient: async () =>
          activeClient({
            secret: SECRET,
            oldSecret: OLD_SECRET,
            rotatedAt,
          }),
        consumeRateLimit: async () => "ok",
        now: () => now,
      })
    ).rejects.toMatchObject({ code: "unauthorized", status: 401 })
  })

  it("returns 403 when the client IP is not allowlisted", async () => {
    const { request, body } = signedRequest({})
    await expect(
      authenticateMachineRequest(request, body, {
        requiredScope: "emails:send",
        resolveClient: async () =>
          activeClient({ ipAllowlist: ["198.51.100.1"] }),
        consumeRateLimit: async () => "ok",
      })
    ).rejects.toMatchObject({ code: "forbidden", status: 403 })
  })

  it("includes path query in the signing string", async () => {
    const resolveClient = vi.fn(async () => activeClient())
    const { request, body } = signedRequest({
      path: "/api/ext/emails/send?dry_run=1",
    })
    await authenticateMachineRequest(request, body, {
      requiredScope: "emails:send",
      resolveClient,
      consumeRateLimit: async () => "ok",
    })
    expect(resolveClient).toHaveBeenCalledWith(KEY_ID)
  })
})
