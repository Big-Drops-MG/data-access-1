import { APIError } from "better-auth/api"
import { beforeEach, describe, expect, it, vi } from "vitest"

const trusted = vi.hoisted(() => ({
  acceptTrustedDevice: vi.fn(),
  issueTrustedDevice: vi.fn(),
}))

const enrollment = vi.hoisted(() => ({
  userHasTwoFactorEnrolled: vi.fn(),
}))

const lockout = vi.hoisted(() => ({
  assertTwoFactorVerifyAllowed: vi.fn(),
  recordTwoFactorVerificationFailure: vi.fn(),
  recordTwoFactorVerificationSuccess: vi.fn(),
}))

const rateLimit = vi.hoisted(() => ({
  consumeTwoFactorRateLimitFromEnv: vi.fn(),
}))

const events = vi.hoisted(() => ({
  logAuthEvent: vi.fn(),
}))

vi.mock("better-auth/cookies", () => ({
  deleteSessionCookie: vi.fn(),
}))

const baTrust = vi.hoisted(() => ({
  tryConsumeTrustDevice: vi.fn(async () => false),
}))

vi.mock("./trusted-device", () => trusted)
vi.mock("./two-factor-enrollment", () => enrollment)
vi.mock("./two-factor-lockout", () => lockout)
vi.mock("./two-factor-rate-limit", () => rateLimit)
vi.mock("./auth-events", () => events)
vi.mock("./two-factor-trust-device", () => baTrust)

import { deleteSessionCookie } from "better-auth/cookies"

import { TRUSTED_DEVICE_COOKIE } from "./two-factor-cookies"
import {
  runTwoFactorAfterHook,
  runTwoFactorBeforeHook,
} from "./two-factor-hooks"

const userId = "01900000-0000-7000-8000-000000000001"

function makeCtx(
  overrides: {
    path?: string
    body?: unknown
    cookie?: string | null
    twoFactorEnabled?: boolean
    returned?: unknown
    userAgent?: string
  } = {}
) {
  const setCookie = vi.fn()
  const redirect = vi.fn((url: string) => {
    throw Object.assign(new Error("redirect"), { url })
  })
  return {
    setCookie,
    redirect,
    path: overrides.path ?? "/callback/google",
    body: overrides.body,
    headers: new Headers(
      overrides.userAgent ? { "user-agent": overrides.userAgent } : undefined
    ),
    getCookie: (name: string) =>
      name === TRUSTED_DEVICE_COOKIE ? (overrides.cookie ?? null) : null,
    getSignedCookie: vi.fn(async () => null),
    setSignedCookie: vi.fn(async () => undefined),
    context: {
      returned: overrides.returned ?? { ok: true },
      newSession: {
        user: {
          id: userId,
          email: "ada@example.com",
          twoFactorEnabled: overrides.twoFactorEnabled ?? true,
        },
        session: { token: "session-token" },
      },
      options: { baseURL: "https://app.example" },
      secret: "secret",
      session: { user: { id: userId } },
      setNewSession: vi.fn(),
      createAuthCookie: (name: string) => ({
        name,
        attributes: { secure: false },
      }),
      internalAdapter: {
        findVerificationValue: vi.fn(async () => null),
        deleteSession: vi.fn(async () => undefined),
        createVerificationValue: vi.fn(async () => undefined),
      },
    },
  }
}

describe("trusted device in the 2FA hook", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trusted.acceptTrustedDevice.mockResolvedValue(false)
    trusted.issueTrustedDevice.mockResolvedValue({
      token: "raw-token",
      expiresAt: new Date("2026-11-26T12:00:00.000Z"),
    })
    enrollment.userHasTwoFactorEnrolled.mockResolvedValue(true)
    lockout.assertTwoFactorVerifyAllowed.mockResolvedValue(undefined)
    lockout.recordTwoFactorVerificationSuccess.mockResolvedValue(undefined)
    rateLimit.consumeTwoFactorRateLimitFromEnv.mockResolvedValue("ok")
  })

  it("rate-limits two-factor verify before lockout", async () => {
    rateLimit.consumeTwoFactorRateLimitFromEnv.mockResolvedValue("limited")
    const ctx = makeCtx({ path: "/two-factor/verify-totp" })
    await expect(runTwoFactorBeforeHook(ctx)).rejects.toMatchObject({
      statusCode: 429,
      body: { code: "RATE_LIMITED" },
    })
    expect(lockout.assertTwoFactorVerifyAllowed).not.toHaveBeenCalled()
  })

  it("fails closed when the two-factor rate limiter is unavailable", async () => {
    rateLimit.consumeTwoFactorRateLimitFromEnv.mockResolvedValue("unavailable")
    const ctx = makeCtx({ path: "/two-factor/verify-totp" })
    await expect(runTwoFactorBeforeHook(ctx)).rejects.toMatchObject({
      statusCode: 503,
      body: { code: "RATE_LIMIT_UNAVAILABLE" },
    })
  })

  it("keeps the session when the trust cookie matches", async () => {
    trusted.acceptTrustedDevice.mockResolvedValue(true)
    const ctx = makeCtx({ cookie: "raw-token" })
    await runTwoFactorAfterHook(ctx)
    expect(trusted.acceptTrustedDevice).toHaveBeenCalledWith({
      userId,
      token: "raw-token",
    })
    expect(events.logAuthEvent).toHaveBeenCalledWith("auth.login", {
      user_id: userId,
    })
    expect(lockout.assertTwoFactorVerifyAllowed).not.toHaveBeenCalled()
    expect(deleteSessionCookie).not.toHaveBeenCalled()
    expect(ctx.redirect).not.toHaveBeenCalled()
  })

  it("clears a dead trust cookie and still starts the challenge", async () => {
    const ctx = makeCtx({ cookie: "stale-token" })
    await expect(runTwoFactorAfterHook(ctx)).rejects.toMatchObject({
      url: "https://app.example/login/2fa-verify",
    })
    expect(ctx.setCookie).toHaveBeenCalledWith(
      TRUSTED_DEVICE_COOKIE,
      "",
      expect.objectContaining({ maxAge: 0, httpOnly: true, path: "/" })
    )
    expect(deleteSessionCookie).toHaveBeenCalled()
  })

  it("issues a hash-backed cookie after a trusted verify", async () => {
    const ctx = makeCtx({
      path: "/two-factor/verify-totp",
      body: { trustDevice: true },
      userAgent: "TestBrowser",
    })
    await runTwoFactorAfterHook(ctx)
    expect(trusted.issueTrustedDevice).toHaveBeenCalledWith({
      userId,
      userAgent: "TestBrowser",
    })
    expect(ctx.setCookie).toHaveBeenCalledWith(
      TRUSTED_DEVICE_COOKIE,
      "raw-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60,
      })
    )
  })

  it("does not issue a cookie when the box is unchecked", async () => {
    const ctx = makeCtx({
      path: "/two-factor/verify-backup-code",
      body: { trustDevice: false },
    })
    await runTwoFactorAfterHook(ctx)
    expect(trusted.issueTrustedDevice).not.toHaveBeenCalled()
  })

  it("does not issue a cookie when the code is rejected", async () => {
    const ctx = makeCtx({
      path: "/two-factor/verify-totp",
      body: { trustDevice: true },
      returned: new APIError("UNAUTHORIZED", {
        message: "Invalid code",
        code: "INVALID_CODE",
      }),
    })
    await runTwoFactorAfterHook(ctx)
    expect(trusted.issueTrustedDevice).not.toHaveBeenCalled()
    expect(lockout.recordTwoFactorVerificationFailure).toHaveBeenCalledWith(
      userId
    )
  })

  it("still requires a code when this browser has no trust cookie", async () => {
    const ctx = makeCtx({ cookie: null })
    await expect(runTwoFactorAfterHook(ctx)).rejects.toMatchObject({
      url: "https://app.example/login/2fa-verify",
    })
    expect(trusted.acceptTrustedDevice).not.toHaveBeenCalled()
    expect(deleteSessionCookie).toHaveBeenCalled()
  })

  it("sets Secure on the trust cookie in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const ctx = makeCtx({
      path: "/two-factor/verify-totp",
      body: { trustDevice: true },
    })
    await runTwoFactorAfterHook(ctx)
    expect(ctx.setCookie).toHaveBeenCalledWith(
      TRUSTED_DEVICE_COOKIE,
      "raw-token",
      expect.objectContaining({ secure: true, httpOnly: true })
    )
    vi.unstubAllEnvs()
  })
})
