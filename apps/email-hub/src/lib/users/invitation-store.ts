import { verification, type User } from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"
import { eq } from "drizzle-orm"

import { isAllowedSsoEmailDomain } from "@/lib/auth/admin-emails"

import {
  invitationIdentifier,
  isInvitationLive,
  parseInvitationValue,
} from "./invitation"

type InvitationDb = Database | DatabaseTransaction

export async function readLiveInvitationRole(
  db: InvitationDb,
  email: string,
  now: Date = new Date()
): Promise<User["role"] | null> {
  if (!isAllowedSsoEmailDomain(email)) {
    return null
  }
  const identifier = invitationIdentifier(email)
  const rows = await db
    .select({
      value: verification.value,
      expiresAt: verification.expiresAt,
    })
    .from(verification)
    .where(eq(verification.identifier, identifier))

  let role: User["role"] | null = null
  let latest = 0
  for (const row of rows) {
    if (!isInvitationLive(row.expiresAt, now)) {
      continue
    }
    const parsed = parseInvitationValue(row.value)
    if (!parsed) {
      continue
    }
    const expires = row.expiresAt.getTime()
    if (expires >= latest) {
      latest = expires
      role = parsed.role
    }
  }
  return role
}

/** Drop every invitation row for this email. Safe when none exist. */
export async function consumeInvitation(
  db: InvitationDb,
  email: string
): Promise<void> {
  const identifier = invitationIdentifier(email)
  await db.delete(verification).where(eq(verification.identifier, identifier))
}
