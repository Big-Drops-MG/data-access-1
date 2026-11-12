import { createHash, randomBytes } from "node:crypto"

import { normaliseEmail } from "@workspace/shared"

import type { User } from "@workspace/db"

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

const IDENTIFIER_PREFIX = "user-invite:"
const VALUE_RE = /^v1:(admin|operator|viewer):([a-f0-9]{64})$/

export function invitationIdentifier(email: string): string {
  return `${IDENTIFIER_PREFIX}${normaliseEmail(email)}`
}

export function createInvitationSecret(): string {
  return randomBytes(32).toString("base64url")
}

export function hashInvitationSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex")
}

/** Stored form is role plus a hash. The raw secret is never persisted. */
export function encodeInvitationValue(
  role: User["role"],
  secret: string
): string {
  return `v1:${role}:${hashInvitationSecret(secret)}`
}

export function parseInvitationValue(
  value: string
): { role: User["role"] } | null {
  const match = VALUE_RE.exec(value)
  if (!match?.[1]) {
    return null
  }
  const role = match[1]
  if (role !== "admin" && role !== "operator" && role !== "viewer") {
    return null
  }
  return { role }
}

export function invitationExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_MS)
}

export function isInvitationLive(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() > now.getTime()
}
