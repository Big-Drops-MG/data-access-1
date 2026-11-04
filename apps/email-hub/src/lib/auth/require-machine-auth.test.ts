import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))

import { type AppError } from "@workspace/shared"

import {
  buildMachineSigningPayload,
  signMachinePayload,
  type MachineClientAuthRecord,
} from "@/lib/auth/machine-hmac"
import { requireMachineAuth } from "@/lib/auth/require-machine"

const SECRET = "wire-secret"
const KEY_ID = "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d99"

function client(): MachineClientAuthRecord {
  return {
    id: KEY_ID,
    status: "active",
    scopes: ["emails:send"],
    ipAllowlist: [],
    secret: SECRET,
    oldSecret: null,
    rotatedAt: null,
  }
}

describe("requireMachineAuth", () => {
  beforeEach(() => {
    getSession.mockReset()
    getSession.mockResolvedValue(null)
  })

  it("verifies HMAC and returns the raw body for the route", async () => {
    const bodyText = '{"email":"a@example.com"}'
    const body = Buffer.from(bodyText, "utf8")
    const timestamp = Math.floor(Date.now() / 1000)
    const path = "/api/ext/emails/send"
    const signature = signMachinePayload(
      SECRET,
      buildMachineSigningPayload({
        timestamp: String(timestamp),
        method: "POST",
        pathWithQuery: path,
        body,
      })
    )

    const request = new Request(`https://emailhub.test${path}`, {
      method: "POST",
      headers: {
        "x-key-id": KEY_ID,
        "x-timestamp": String(timestamp),
        "x-signature": signature,
      },
      body: bodyText,
    })

    const result = await requireMachineAuth(request, {
      scope: "emails:send",
      skipTouch: true,
      deps: {
        resolveClient: async () => client(),
        consumeRateLimit: async () => "ok",
      },
    })

    expect(result.client.id).toBe(KEY_ID)
    expect(result.rawBody.toString("utf8")).toBe(bodyText)
  })

  it("rejects session callers before HMAC", async () => {
    getSession.mockResolvedValue({
      id: "1",
      email: "a@example.com",
      name: "A",
      image: null,
      role: "admin",
      jobTitle: null,
      twoFactorEnabled: true,
    })

    await expect(
      requireMachineAuth(
        new Request("https://emailhub.test/api/ext/emails/send", {
          method: "POST",
        }),
        {
          scope: "emails:send",
          skipTouch: true,
          deps: {
            resolveClient: async () => client(),
            consumeRateLimit: async () => "ok",
          },
        }
      )
    ).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    } satisfies Partial<AppError>)
  })
})
