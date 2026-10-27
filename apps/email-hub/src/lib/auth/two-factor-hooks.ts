import { createAuthMiddleware, APIError, isAPIError } from "better-auth/api"
import { deleteSessionCookie } from "better-auth/cookies"
import { generateRandomString } from "better-auth/crypto"

import { logAuthEvent } from "./auth-events"
import { isSessionPastAbsoluteLimit } from "./session-policy"
import { userHasTwoFactorEnrolled } from "./two-factor-enrollment"
import {
  TWO_FACTOR_EMAIL_COOKIE,
  TWO_FACTOR_USER_COOKIE,
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

export const twoFactorAfterHook = createAuthMiddleware(async (ctx) => {
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

  if (await tryConsumeTrustDevice(ctx, userId)) {
    logAuthEvent("auth.login", { user_id: userId })
    return
  }

  await assertTwoFactorVerifyAllowed(userId)

  deleteSessionCookie(ctx, true)
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
})
