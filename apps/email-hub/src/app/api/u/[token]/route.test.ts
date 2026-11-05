import { beforeEach, describe, expect, it, vi } from "vitest"

const consumeUnsubscribeRateLimitFromEnv = vi.hoisted(() => vi.fn())
const applyUnsubscribe = vi.hoisted(() => vi.fn())
const getDb = vi.hoisted(() => vi.fn())
const loadServerEnv = vi.hoisted(() => vi.fn())
const verifyUnsubscribeToken = vi.hoisted(() => vi.fn())

vi.mock("@/lib/unsubscribe-rate-limit", () => ({
  consumeUnsubscribeRateLimitFromEnv,
}))
vi.mock("@workspace/db/client", () => ({ getDb }))
vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    applyUnsubscribe,
    loadServerEnv,
    verifyUnsubscribeToken,
  }
})

import { POST } from "./route"

const MESSAGE_ID = "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44"
const SECRET = "test-unsubscribe-secret"
const TOKEN = "v1.0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44.1762344000.test-mac"
const ONE_CLICK_BODY = "List-Unsubscribe=One-Click"

function post(body: string, token = TOKEN): Request {
  return new Request(`http://localhost/api/u/${token}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.50",
      "x-request-id": "req-u-1",
    },
    body,
  })
}

describe("POST /api/u/[token]", () => {
  beforeEach(() => {
    consumeUnsubscribeRateLimitFromEnv.mockReset()
    consumeUnsubscribeRateLimitFromEnv.mockResolvedValue("ok")
    applyUnsubscribe.mockReset()
    applyUnsubscribe.mockResolvedValue({
      status: "applied",
      recipientId: "01900000-0000-7000-8000-000000000047",
      categoryIds: ["01900000-0000-7000-8000-000000000048"],
    })
    getDb.mockReset()
    getDb.mockReturnValue({})
    loadServerEnv.mockReset()
    loadServerEnv.mockReturnValue({
      UNSUBSCRIBE_TOKEN_SECRET: SECRET,
      UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS: undefined,
    })
    verifyUnsubscribeToken.mockReset()
    verifyUnsubscribeToken.mockReturnValue({
      status: "valid",
      messageId: MESSAGE_ID,
      issuedAt: new Date("2026-11-05T12:00:00.000Z"),
    })
  })

  it("opts out on a valid one-click POST", async () => {
    const response = await POST(post(ONE_CLICK_BODY), {
      params: Promise.resolve({ token: TOKEN }),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      scope: "category",
    })
    expect(applyUnsubscribe).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        messageId: MESSAGE_ID,
        scope: "category",
        ip: "203.0.113.50",
      })
    )
  })

  it("returns 404 for a tampered token", async () => {
    verifyUnsubscribeToken.mockReturnValue({ status: "invalid" })
    const response = await POST(post(""), {
      params: Promise.resolve({ token: "v1.bad.token.mac" }),
    })
    expect(response.status).toBe(404)
    expect(applyUnsubscribe).not.toHaveBeenCalled()
  })

  it("returns 410 for an expired token", async () => {
    verifyUnsubscribeToken.mockReturnValue({
      status: "expired",
      messageId: MESSAGE_ID,
      issuedAt: new Date("2025-01-01T00:00:00.000Z"),
    })
    const response = await POST(post(""), {
      params: Promise.resolve({ token: TOKEN }),
    })
    expect(response.status).toBe(410)
    expect(applyUnsubscribe).not.toHaveBeenCalled()
  })

  it("returns 429 when the IP rate limit is exceeded", async () => {
    consumeUnsubscribeRateLimitFromEnv.mockResolvedValue("limited")
    const response = await POST(post(""), {
      params: Promise.resolve({ token: TOKEN }),
    })
    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("60")
    expect(applyUnsubscribe).not.toHaveBeenCalled()
  })
})
