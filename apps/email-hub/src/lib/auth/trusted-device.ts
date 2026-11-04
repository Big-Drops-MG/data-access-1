import { createHash, randomBytes } from "node:crypto"

import { trustedDevice } from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"
import { and, eq, gt, isNull, type SQL } from "drizzle-orm"

import { TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS } from "./two-factor-policy"

export function hashTrustedDeviceToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function generateTrustedDeviceToken(): string {
  return randomBytes(32).toString("base64url")
}

export type IssuedTrustedDevice = {
  token: string
  expiresAt: Date
}

/** Store a hash of a new random token. The caller sets the raw token as a cookie. */
export async function issueTrustedDevice(input: {
  userId: string
  userAgent?: string | null
  now?: Date
}): Promise<IssuedTrustedDevice> {
  const now = input.now ?? new Date()
  const token = generateTrustedDeviceToken()
  const expiresAt = new Date(
    now.getTime() + TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS * 1000
  )
  await getDb()
    .insert(trustedDevice)
    .values({
      userId: input.userId,
      tokenHash: hashTrustedDeviceToken(token),
      userAgent: input.userAgent ?? null,
      expiresAt,
      lastUsedAt: now,
    })
  return { token, expiresAt }
}

/** Match a live row: this user, this hash, not revoked, not expired. */
export function liveTrustedDeviceWhere(
  userId: string,
  token: string,
  now: Date
): SQL | undefined {
  return and(
    eq(trustedDevice.userId, userId),
    eq(trustedDevice.tokenHash, hashTrustedDeviceToken(token)),
    isNull(trustedDevice.revokedAt),
    gt(trustedDevice.expiresAt, now)
  )
}

/**
 * Accept a cookie token for this user when the hash matches a live row.
 * Updates last_used_at. Does not extend expires_at.
 */
export async function acceptTrustedDevice(input: {
  userId: string
  token: string
  now?: Date
}): Promise<boolean> {
  const now = input.now ?? new Date()
  const updated = await getDb()
    .update(trustedDevice)
    .set({ lastUsedAt: now })
    .where(liveTrustedDeviceWhere(input.userId, input.token, now))
    .returning({ id: trustedDevice.id })
  return updated.length > 0
}

type TrustedDeviceDeleter = Pick<Database, "delete">

/** Drop every remembered browser for this user (admin 2FA reset). */
export async function deleteTrustedDevicesForUser(
  userId: string,
  db: TrustedDeviceDeleter = getDb()
): Promise<void> {
  await db.delete(trustedDevice).where(eq(trustedDevice.userId, userId))
}
