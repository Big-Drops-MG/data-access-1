import { beforeEach, describe, expect, it, vi } from "vitest"

const consumeLoginRateLimitFromEnv = vi.hoisted(() => vi.fn())
const getAuth = vi.hoisted(() => vi.fn())
const toNextJsHandler = vi.hoisted(() => vi.fn())
const observeApiRequest = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth/login-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    consumeLoginRateLimitFromEnv,
  }
})
vi.mock("@/lib/auth/server", () => ({ getAuth }))
vi.mock("better-auth/next-js", () => ({ toNextJsHandler }))
vi.mock("@/lib/with-api-request", () => ({
  observeApiRequest,
}))

import { GET, POST } from "./route"

describe("auth route login rate limit", () => {
  const authHandler = vi.fn(
    async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
  )

  beforeEach(() => {
    consumeLoginRateLimitFromEnv.mockReset()
    consumeLoginRateLimitFromEnv.mockResolvedValue("ok")
    authHandler.mockClear()
    getAuth.mockReturnValue({})
    toNextJsHandler.mockReturnValue({ GET: authHandler, POST: authHandler })
    observeApiRequest.mockImplementation(
      async (_request: Request, run: () => Promise<Response>) => run()
    )
  })

  it("allows non-login auth paths without consuming the login limiter", async () => {
    const request = new Request("http://localhost/api/auth/get-session")
    const response = await GET(request)
    expect(response.status).toBe(200)
    expect(consumeLoginRateLimitFromEnv).not.toHaveBeenCalled()
    expect(authHandler).toHaveBeenCalled()
  })

  it("returns 429 when login rate limit is exceeded", async () => {
    consumeLoginRateLimitFromEnv.mockResolvedValue("limited")
    const request = new Request("http://localhost/api/auth/sign-in/social", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.9" },
    })
    const response = await POST(request)
    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("60")
    expect(authHandler).not.toHaveBeenCalled()
  })

  it("returns 503 when the login rate limiter is unavailable", async () => {
    consumeLoginRateLimitFromEnv.mockResolvedValue("unavailable")
    const request = new Request(
      "http://localhost/api/auth/callback/google?code=x",
      {
        headers: { "x-forwarded-for": "203.0.113.9" },
      }
    )
    const response = await GET(request)
    expect(response.status).toBe(503)
    expect(authHandler).not.toHaveBeenCalled()
  })
})
