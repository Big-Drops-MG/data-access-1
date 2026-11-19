import { makeSignature, symmetricEncrypt } from "better-auth/crypto"
import { and, eq, inArray } from "drizzle-orm"
import { v7 as uuidv7 } from "uuid"
import { session, twoFactor, user, verification } from "@workspace/db"
import { getDb } from "@workspace/db/client"

import { getAuth } from "@/lib/auth/server"
import { twoFactorRateLimitKey } from "@/lib/auth/two-factor-rate-limit"
import {
  TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
  TWO_FACTOR_COOKIE_NAME_PART,
} from "@/lib/e2e/cookies"
import {
  e2ePersonaEmail,
  e2ePersonaEmails,
  e2eTotpSecret,
  type E2ePersona,
} from "@/lib/e2e/personas"
import { getRateLimitRedisFromEnv } from "@/lib/rate-limit/sliding-window-redis"
import {
  TWO_FACTOR_EMAIL_COOKIE,
  TWO_FACTOR_USER_COOKIE,
} from "@/lib/auth/two-factor-cookies"
import { SESSION_IDLE_SECONDS } from "@/lib/auth/session-policy"

type AuthContext = {
  secret: string
  secretConfig: Parameters<typeof symmetricEncrypt>[0]["key"]
  authCookies: {
    sessionToken: { name: string }
  }
  createAuthCookie: (
    name: string,
    options?: { maxAge?: number }
  ) => { name: string }
  internalAdapter: {
    createSession: (userId: string) => Promise<{ token: string }>
    createVerificationValue: (value: {
      value: string
      identifier: string
      expiresAt: Date
    }) => Promise<unknown>
  }
}

type SignedCookie = {
  name: string
  value: string
  maxAge: number
}

export type E2eCookie =
  | SignedCookie
  | {
      name: string
      value: string
      maxAge: number
    }

async function authContext(): Promise<AuthContext> {
  const auth = getAuth() as { $context: Promise<AuthContext> }
  return auth.$context
}

async function signedValue(value: string, secret: string): Promise<string> {
  const signature = await makeSignature(value, secret)
  return `${value}.${signature}`
}

async function deleteRateLimits(userIds: string[]): Promise<void> {
  if (userIds.length === 0) {
    return
  }
  const redis = await getRateLimitRedisFromEnv()
  await redis.del(...userIds.map((id) => twoFactorRateLimitKey(id)))
}

export async function resetE2ePersonas(): Promise<void> {
  const db = getDb()
  const emails = e2ePersonaEmails()
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.email, emails))
  const ids = existing.map((row) => row.id)
  await deleteRateLimits(ids)
  if (ids.length > 0) {
    await db.delete(verification).where(inArray(verification.value, ids))
    await db.delete(user).where(inArray(user.id, ids))
  }

  const ctx = await authContext()
  const encryptedSecret = await symmetricEncrypt({
    key: ctx.secretConfig,
    data: e2eTotpSecret(),
  })
  const backupCodes = await symmetricEncrypt({
    key: ctx.secretConfig,
    data: "[]",
  })

  for (const persona of ["login", "twoFactor", "lockout"] as const) {
    const userId = uuidv7()
    await db.insert(user).values({
      id: userId,
      email: e2ePersonaEmail(persona),
      name: `E2E ${persona}`,
      emailVerified: true,
      role: "viewer",
      status: "active",
      jobTitle: "QA",
      twoFactorEnabled: true,
    })
    await db.insert(twoFactor).values({
      id: uuidv7(),
      userId,
      secret: encryptedSecret,
      backupCodes,
      verified: true,
      failedVerificationCount: 0,
      failureWindowStartedAt: null,
      lockedUntil: null,
      consecutiveLockoutCount: 0,
      lastCountedLockoutUntil: null,
    })
  }
}

async function userIdFor(persona: E2ePersona): Promise<string> {
  const [row] = await getDb()
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, e2ePersonaEmail(persona)))
    .limit(1)
  if (!row) {
    throw new Error("E2E persona is missing. Reset the harness first.")
  }
  return row.id
}

export async function sessionCookiesFor(
  persona: E2ePersona
): Promise<E2eCookie[]> {
  const ctx = await authContext()
  const userId = await userIdFor(persona)
  await getDb().delete(session).where(eq(session.userId, userId))
  const created = await ctx.internalAdapter.createSession(userId)
  return [
    {
      name: ctx.authCookies.sessionToken.name,
      value: await signedValue(created.token, ctx.secret),
      maxAge: SESSION_IDLE_SECONDS,
    },
    { name: TWO_FACTOR_EMAIL_COOKIE, value: "", maxAge: 0 },
    { name: TWO_FACTOR_USER_COOKIE, value: "", maxAge: 0 },
  ]
}

export async function challengeCookiesFor(
  persona: E2ePersona
): Promise<E2eCookie[]> {
  const ctx = await authContext()
  const userId = await userIdFor(persona)
  const email = e2ePersonaEmail(persona)
  const db = getDb()
  await db.delete(session).where(eq(session.userId, userId))
  await db.delete(verification).where(eq(verification.value, userId))

  const identifier = `2fa-${uuidv7()}`
  const expiresAt = new Date(
    Date.now() + TWO_FACTOR_COOKIE_MAX_AGE_SECONDS * 1000
  )
  await ctx.internalAdapter.createVerificationValue({
    value: userId,
    identifier,
    expiresAt,
  })
  await ctx.internalAdapter.createVerificationValue({
    value: "0",
    identifier: `2fa-attempts-${identifier}`,
    expiresAt,
  })

  const cookie = ctx.createAuthCookie(TWO_FACTOR_COOKIE_NAME_PART, {
    maxAge: TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
  })
  return [
    {
      name: cookie.name,
      value: await signedValue(identifier, ctx.secret),
      maxAge: TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
    },
    {
      name: TWO_FACTOR_EMAIL_COOKIE,
      value: email,
      maxAge: TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
    },
    {
      name: TWO_FACTOR_USER_COOKIE,
      value: userId,
      maxAge: TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
    },
  ]
}

export async function clearPersonaRateLimit(
  persona: E2ePersona
): Promise<void> {
  await deleteRateLimits([await userIdFor(persona)])
}

export async function expirePersonaLockout(persona: E2ePersona): Promise<void> {
  const userId = await userIdFor(persona)
  await getDb()
    .update(twoFactor)
    .set({
      failedVerificationCount: 0,
      failureWindowStartedAt: null,
      lockedUntil: new Date(Date.now() - 1000),
    })
    .where(and(eq(twoFactor.userId, userId)))
}
