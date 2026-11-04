import { createAuthMiddleware, APIError, isAPIError } from "better-auth/api"
import { deleteSessionCookie } from "better-auth/cookies"
import { generateRandomString } from "better-auth/crypto"

import { logAuthEvent } from "./auth-events"
import { isSessionPastAbsoluteLimit } from "./session-policy"
import { acceptTrustedDevice, issueTrustedDevice } from "./trusted-device"
import { userHasTwoFactorEnrolled } from "./two-factor-enrollment"
import {
  TRUSTED_DEVICE_COOKIE,
  TWO_FACTOR_EMAIL_COOKIE,
  TWO_FACTOR_USER_COOKIE,
  trustedDeviceCookieAttributes,
} from "./two-factor-cookies"
import {
  assertTwoFactorVerifyAllowed,
  recordTwoFactorVerificationFailure,
  recordTwoFactorVerificationSuccess,
} from "./two-factor-lockout"
import { TWO_FACTOR_COOKIE_MAX_AGE_SECONDS } from "./two-factor-policy"
import { tryConsumeTrustDevice } from "./two-factor-trust-device"

const TWO_FACTOR_COOKIE_NAME = "two_factor"

const VERIFY_PATHS = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
])

const LOCKOUT_FAILURE_CODES = new Set(["INVALID_CODE", "INVALID_BACKUP_CODE"])

const OAUTH_CALLBACK_PATH = /^\/callback\//

function isVerifyPath(path: string): boolean {
  return VERIFY_PATHS.has(path)
}

async function resolveTwoFactorUserId(ctx: {
  getSignedCookie: (
    name: string,
    secret: string
  ) => Promise<string | false | null>
  context: {
    secret: string
    session?: { user?: { id?: string } } | null
    createAuthCookie: (
      name: string,
      opts?: { maxAge?: number }
    ) => { name: string }
    internalAdapter: {
      findVerificationValue: (
        identifier: string
      ) => Promise<{ value: string } | null>
    }
  }
}): Promise<string | undefined> {
  const fromSession = ctx.context.session?.user?.id
  if (typeof fromSession === "string") {
    return fromSession
  }

  const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME)
  const signed = await ctx.getSignedCookie(cookie.name, ctx.context.secret)
  if (!signed) {
    return undefined
  }
  const verification =
    await ctx.context.internalAdapter.findVerificationValue(signed)
  return verification?.value
}

/** Runs before Better Auth handlers: absolute session + 2FA gates. */
export const twoFactorBeforeHook = createAuthMiddleware(async (ctx) => {
  const activeSession = ctx.context.session?.session
  if (activeSession?.createdAt) {
    const createdAt = new Date(activeSession.createdAt)
    if (isSessionPastAbsoluteLimit(createdAt)) {
      if (activeSession.token) {
        await ctx.context.internalAdapter.deleteSession(activeSession.token)
      }
      deleteSessionCookie(ctx)
      throw new APIError("UNAUTHORIZED", {
        message: "Session expired",
        code: "SESSION_ABSOLUTE_EXPIRED",
      })
    }
  }

  if (ctx.path === "/two-factor/disable") {
    throw new APIError("FORBIDDEN", {
      message: "Two-factor authentication can only be reset by an Admin.",
      code: "TWO_FACTOR_DISABLE_FORBIDDEN",
    })
  }

  if (!isVerifyPath(ctx.path)) {
    return
  }

  const userId = await resolveTwoFactorUserId(ctx)
  if (!userId) {
    return
  }
  await assertTwoFactorVerifyAllowed(userId)
})

type TwoFactorAfterHookContext = {
  path: string
  body?: unknown
  headers?: { get(name: string): string | null }
  request?: { headers?: { get(name: string): string | null } }
  getCookie: (name: string) => string | null | undefined
  getSignedCookie: (
    name: string,
    secret: string
  ) => Promise<string | false | null>
  setCookie: (
    name: string,
    value: string,
    options?: {
      maxAge?: number
      path?: string
      sameSite?: "lax" | "strict" | "none"
      httpOnly?: boolean
      secure?: boolean
    }
  ) => void
  setSignedCookie: (
    name: string,
    value: string,
    secret: string,
    attributes: { secure?: boolean }
  ) => Promise<void>
  redirect: (url: string) => never
  context: {
    returned?: unknown
    newSession?: {
      user: { id: string; email: string; twoFactorEnabled?: boolean | null }
      session: { token: string }
    } | null
    options?: { baseURL?: string }
    secret: string
    session?: { user?: { id?: string } } | null
    setNewSession: (session: null) => void
    createAuthCookie: (
      name: string,
      opts?: { maxAge?: number }
    ) => { name: string; attributes: { secure?: boolean } }
    internalAdapter: {
      findVerificationValue: (
        identifier: string
      ) => Promise<{ value: string } | null>
      deleteSession: (token: string) => Promise<void>
      createVerificationValue: (value: {
        value: string
        identifier: string
        expiresAt: Date
      }) => Promise<void>
    }
  }
}

function trustCookieIsSecure(): boolean {
  return process.env.NODE_ENV === "production"
}

function requestTrustsDevice(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "trustDevice" in body &&
    (body as { trustDevice?: unknown }).trustDevice === true
  )
}

function readUserAgent(ctx: TwoFactorAfterHookContext): string | null {
  const fromRequest = ctx.request?.headers?.get("user-agent")
  if (fromRequest) {
    return fromRequest
  }
  return ctx.headers?.get("user-agent") || null
}

function clearTrustedDeviceCookie(ctx: TwoFactorAfterHookContext): void {
  ctx.setCookie(TRUSTED_DEVICE_COOKIE, "", {
    ...trustedDeviceCookieAttributes(trustCookieIsSecure()),
    maxAge: 0,
  })
}

async function skipChallengeForTrustedDevice(
  ctx: TwoFactorAfterHookContext,
  userId: string
): Promise<boolean> {
  const token = ctx.getCookie(TRUSTED_DEVICE_COOKIE)
  if (!token) {
    return false
  }
  if (await acceptTrustedDevice({ userId, token })) {
    return true
  }
  clearTrustedDeviceCookie(ctx)
  return false
}

/**
 * After verify/enable/OAuth: lockout counters, trusted-device cookie, and
 * Google SSO 2FA challenge redirect.
 */
export async function runTwoFactorAfterHook(
  ctx: TwoFactorAfterHookContext
): Promise<void> {
  const path = ctx.path
  const returned = ctx.context.returned

  if (path === "/two-factor/enable") {
    return
  }

  if (isVerifyPath(path)) {
    const userId = await resolveTwoFactorUserId(ctx)
    if (!userId) {
      return
    }

    if (isAPIError(returned)) {
      const code =
        typeof returned.body === "object" &&
        returned.body &&
        "code" in returned.body
          ? String((returned.body as { code?: string }).code ?? "")
          : ""
      if (!LOCKOUT_FAILURE_CODES.has(code)) {
        return
      }
      await recordTwoFactorVerificationFailure(userId)
      return
    }

    if (returned) {
      const enrolledDuringSetup =
        typeof ctx.context.session?.user?.id === "string"
      await recordTwoFactorVerificationSuccess(userId)
      if (enrolledDuringSetup) {
        logAuthEvent("auth.2fa_enrolled", { user_id: userId })
      }
      ctx.setCookie(TWO_FACTOR_EMAIL_COOKIE, "", { maxAge: 0, path: "/" })
      ctx.setCookie(TWO_FACTOR_USER_COOKIE, "", { maxAge: 0, path: "/" })
      if (requestTrustsDevice(ctx.body)) {
        const issued = await issueTrustedDevice({
          userId,
          userAgent: readUserAgent(ctx),
        })
        ctx.setCookie(
          TRUSTED_DEVICE_COOKIE,
          issued.token,
          trustedDeviceCookieAttributes(trustCookieIsSecure())
        )
      }
    }
    return
  }

  if (!OAUTH_CALLBACK_PATH.test(path)) {
    return
  }

  const data = ctx.context.newSession
  if (!data?.user) {
    logAuthEvent("auth.login_failed", {})
    return
  }

  const appOrigin = String(
    ctx.context.options?.baseURL ?? process.env.BETTER_AUTH_URL ?? ""
  ).replace(/\/$/, "")

  const userId = data.user.id
  const enrolled =
    data.user.twoFactorEnabled === true ||
    (await userHasTwoFactorEnrolled(userId))

  if (!enrolled) {
    throw ctx.redirect(`${appOrigin}/login/2fa-setup`)
  }

  if (
    (await skipChallengeForTrustedDevice(ctx, userId)) ||
    (await tryConsumeTrustDevice(
      ctx as unknown as Parameters<typeof tryConsumeTrustDevice>[0],
      userId
    ))
  ) {
    logAuthEvent("auth.login", { user_id: userId })
    return
  }

  await assertTwoFactorVerifyAllowed(userId)

  deleteSessionCookie(
    ctx as unknown as Parameters<typeof deleteSessionCookie>[0],
    true
  )
  await ctx.context.internalAdapter.deleteSession(data.session.token)
  ctx.context.setNewSession(null)

  const maxAge = TWO_FACTOR_COOKIE_MAX_AGE_SECONDS
  const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME, {
    maxAge,
  })
  const identifier = `2fa-${generateRandomString(20)}`
  const expiresAt = new Date(Date.now() + maxAge * 1000)
  await ctx.context.internalAdapter.createVerificationValue({
    value: userId,
    identifier,
    expiresAt,
  })
  await ctx.context.internalAdapter.createVerificationValue({
    value: "0",
    identifier: `2fa-attempts-${identifier}`,
    expiresAt,
  })
  await ctx.setSignedCookie(
    cookie.name,
    identifier,
    ctx.context.secret,
    cookie.attributes
  )

  const displayCookie = {
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: cookie.attributes.secure,
  }
  ctx.setCookie(TWO_FACTOR_EMAIL_COOKIE, data.user.email, displayCookie)
  ctx.setCookie(TWO_FACTOR_USER_COOKIE, userId, displayCookie)

  throw ctx.redirect(`${appOrigin}/login/2fa-verify`)
}

export const twoFactorAfterHook = createAuthMiddleware((ctx) =>
  runTwoFactorAfterHook(ctx as unknown as TwoFactorAfterHookContext)
)
