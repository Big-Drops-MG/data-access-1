import { createHmac } from "node:crypto"

import { generateRandomString } from "better-auth/crypto"

import { TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS } from "./two-factor-policy"

export const TRUST_DEVICE_COOKIE_NAME = "trust_device"

type TrustDeviceCtx = {
  getSignedCookie: (
    name: string,
    secret: string
  ) => Promise<string | false | null>
  setSignedCookie: (
    name: string,
    value: string,
    secret: string,
    attributes: Record<string, unknown>
  ) => Promise<unknown>
  context: {
    secret: string
    createAuthCookie: (
      name: string,
      opts?: { maxAge?: number }
    ) => { name: string; attributes: Record<string, unknown> }
    internalAdapter: {
      findVerificationValue: (
        identifier: string
      ) => Promise<{ value: string; expiresAt: Date } | null>
      deleteVerificationByIdentifier: (identifier: string) => Promise<unknown>
      createVerificationValue: (input: {
        value: string
        identifier: string
        expiresAt: Date
      }) => Promise<unknown>
    }
  }
}

export function signTrustDeviceToken(
  secret: string,
  userId: string,
  trustIdentifier: string
): string {
  return createHmac("sha256", secret)
    .update(`${userId}!${trustIdentifier}`)
    .digest("base64url")
    .replace(/=+$/, "")
}

export async function tryConsumeTrustDevice(
  ctx: TrustDeviceCtx,
  userId: string,
  maxAgeSeconds: number = TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS
): Promise<boolean> {
  const cookie = ctx.context.createAuthCookie(TRUST_DEVICE_COOKIE_NAME, {
    maxAge: maxAgeSeconds,
  })
  const raw = await ctx.getSignedCookie(cookie.name, ctx.context.secret)
  if (!raw || typeof raw !== "string") {
    return false
  }

  const [token, trustIdentifier] = raw.split("!")
  if (!token || !trustIdentifier) {
    return false
  }

  const expected = signTrustDeviceToken(
    ctx.context.secret,
    userId,
    trustIdentifier
  )
  if (token !== expected) {
    return false
  }

  const record =
    await ctx.context.internalAdapter.findVerificationValue(trustIdentifier)
  if (
    !record ||
    record.value !== userId ||
    !(record.expiresAt instanceof Date) ||
    record.expiresAt.getTime() <= Date.now()
  ) {
    return false
  }

  await ctx.context.internalAdapter.deleteVerificationByIdentifier(
    trustIdentifier
  )
  const nextIdentifier = `trust-device-${generateRandomString(32)}`
  const nextToken = signTrustDeviceToken(
    ctx.context.secret,
    userId,
    nextIdentifier
  )
  await ctx.context.internalAdapter.createVerificationValue({
    value: userId,
    identifier: nextIdentifier,
    expiresAt: new Date(Date.now() + maxAgeSeconds * 1000),
  })
  await ctx.setSignedCookie(
    cookie.name,
    `${nextToken}!${nextIdentifier}`,
    ctx.context.secret,
    cookie.attributes
  )
  return true
}
