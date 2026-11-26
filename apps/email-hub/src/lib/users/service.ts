import {
  session,
  twoFactor,
  user,
  verification,
  type User,
} from "@workspace/db"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"
import { AppError, normaliseEmail, writeAudit } from "@workspace/shared"
import { and, asc, eq, gt, like, sql } from "drizzle-orm"
import { v7 as uuidv7 } from "uuid"

import { isAllowedSsoEmailDomain } from "@/lib/auth/admin-emails"
import { deleteTrustedDevicesForUser } from "@/lib/auth/trusted-device"
import { resetTwoFactorForAdmin } from "@/lib/auth/two-factor-lockout"
import { getLockoutStatus } from "@/lib/auth/two-factor-policy"

import { consumeInvitation } from "./invitation-store"
import {
  createInvitationSecret,
  encodeInvitationValue,
  invitationExpiresAt,
  invitationIdentifier,
  parseInvitationValue,
} from "./invitation"
import { isActiveAdmin, isSameUser, removalLeavesNoActiveAdmin } from "./rules"
import {
  sendUserInvitationEmail,
  type SendUserInvitationEmailInput,
} from "./send-invitation-email"
import {
  serializeInvitation,
  serializeUser,
  type DisabledUserJson,
  type InvitationJson,
  type ManagedUserJson,
  type UserJson,
} from "./serialize"

export const ACTIVE_ADMIN_LOCK_KEY = "emailhub:active-admins"

export type UserActor = {
  userId: string
  name?: string | null
  requestId?: string | null
}

type Tx = DatabaseTransaction

function assertStaffRole(role: string): asserts role is User["role"] {
  if (role !== "admin" && role !== "operator" && role !== "viewer") {
    throw AppError.validationFailed([{ path: "role", message: "Invalid role" }])
  }
}

async function lockActiveAdmins(tx: Tx): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${ACTIVE_ADMIN_LOCK_KEY}::text))`
  )
}

async function lockInvitation(tx: Tx, identifier: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${identifier}::text))`
  )
}

async function loadUserForUpdate(
  tx: Tx,
  userId: string
): Promise<User | undefined> {
  const [row] = await tx
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
    .for("update")
  return row
}

async function countActiveAdmins(tx: Tx): Promise<number> {
  const rows = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.status, "active")))
    .orderBy(asc(user.id))
    .for("update")
  return rows.length
}

function auditActor(actor: UserActor) {
  return {
    actor: { type: "user" as const, id: actor.userId },
    requestId: actor.requestId,
  }
}

export async function inviteUser(
  input: { email: string; role: string },
  actor: UserActor,
  db: Database = getDb(),
  now: Date = new Date(),
  options?: {
    sendInvitationEmail?: (input: SendUserInvitationEmailInput) => Promise<void>
  }
): Promise<InvitationJson> {
  assertStaffRole(input.role)
  const email = normaliseEmail(input.email)
  if (!isAllowedSsoEmailDomain(email)) {
    throw AppError.validationFailed([
      {
        path: "email",
        message: "Must be a bigdropsmarketing.com address",
      },
    ])
  }

  const role = input.role
  const outcome = await db.transaction(async (tx) => {
    const identifier = invitationIdentifier(email)
    await lockInvitation(tx, identifier)

    const [existing] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1)
    if (existing) {
      await consumeInvitation(tx, email)
      return { conflict: true as const }
    }

    const secret = createInvitationSecret()
    const value = encodeInvitationValue(role, secret)
    const expiresAt = invitationExpiresAt(now)
    const rows = await tx
      .select()
      .from(verification)
      .where(eq(verification.identifier, identifier))
      .for("update")

    const previous = rows[0]
    const previousRole = previous
      ? parseInvitationValue(previous.value)?.role
      : undefined
    let id = previous?.id
    if (previous) {
      await tx
        .update(verification)
        .set({ value, expiresAt, updatedAt: now })
        .where(eq(verification.id, previous.id))
      if (rows.length > 1) {
        for (const extra of rows.slice(1)) {
          await tx.delete(verification).where(eq(verification.id, extra.id))
        }
      }
    } else {
      id = uuidv7()
      await tx.insert(verification).values({
        id,
        identifier,
        value,
        expiresAt,
      })
    }

    if (!id) {
      throw AppError.internal()
    }

    await writeAudit(tx, {
      ...auditActor(actor),
      action: previous ? "user.invitation_replaced" : "user.invited",
      objectType: "user_invitation",
      objectId: id,
      before: previous
        ? {
            role: previousRole ?? null,
            expires_at: previous.expiresAt.toISOString(),
          }
        : null,
      after: {
        email,
        role,
        expires_at: expiresAt.toISOString(),
      },
    })

    return {
      conflict: false as const,
      invitation: serializeInvitation({
        id,
        email,
        role,
        expiresAt,
        created: !previous,
      }),
    }
  })

  if (outcome.conflict) {
    throw AppError.conflict([{ path: "email", message: "User already exists" }])
  }

  const sendEmail =
    options?.sendInvitationEmail ??
    (process.env.NODE_ENV === "test" ? undefined : sendUserInvitationEmail)
  if (sendEmail) {
    try {
      await sendEmail({
        recipientEmail: outcome.invitation.email,
        role: outcome.invitation.role,
        expiresAt: new Date(outcome.invitation.expires_at),
        invitedByName: actor.name,
      })
    } catch (error) {
      getContextLogger().error(
        { err: error, event: "user.invitation_email_failed" },
        "Failed to send user invitation email"
      )
    }
  }

  return outcome.invitation
}

export async function updateUserRole(
  userId: string,
  role: string,
  actor: UserActor,
  db: Database = getDb()
): Promise<UserJson> {
  assertStaffRole(role)
  if (isSameUser(actor.userId, userId)) {
    throw AppError.forbidden([
      { path: "userId", message: "You cannot change your own role" },
    ])
  }

  return db.transaction(async (tx) => {
    await lockActiveAdmins(tx)
    const target = await loadUserForUpdate(tx, userId)
    if (!target) {
      throw AppError.notFound([{ path: "userId", message: "User not found" }])
    }
    if (target.role === role) {
      return serializeUser(target)
    }
    if (
      removalLeavesNoActiveAdmin({
        targetIsActiveAdmin: isActiveAdmin(target),
        activeAdminCount: await countActiveAdmins(tx),
      })
    ) {
      throw AppError.conflict([
        {
          path: "role",
          message: "The last active Admin cannot be demoted",
        },
      ])
    }

    const [updated] = await tx
      .update(user)
      .set({ role, updatedAt: new Date() })
      .where(eq(user.id, target.id))
      .returning()
    if (!updated) {
      throw AppError.internal()
    }

    await writeAudit(tx, {
      ...auditActor(actor),
      action: "user.role_changed",
      objectType: "user",
      objectId: updated.id,
      before: { role: target.role },
      after: { role: updated.role },
    })
    return serializeUser(updated)
  })
}

export async function disableUser(
  userId: string,
  actor: UserActor,
  db: Database = getDb()
): Promise<DisabledUserJson> {
  if (isSameUser(actor.userId, userId)) {
    throw AppError.forbidden([
      { path: "userId", message: "You cannot disable your own account" },
    ])
  }

  return db.transaction(async (tx) => {
    await lockActiveAdmins(tx)
    const target = await loadUserForUpdate(tx, userId)
    if (!target) {
      throw AppError.notFound([{ path: "userId", message: "User not found" }])
    }

    if (target.status === "deactivated") {
      await tx.delete(session).where(eq(session.userId, target.id))
      await deleteTrustedDevicesForUser(target.id, tx)
      return { ...serializeUser(target), already_disabled: true }
    }

    if (
      removalLeavesNoActiveAdmin({
        targetIsActiveAdmin: isActiveAdmin(target),
        activeAdminCount: await countActiveAdmins(tx),
      })
    ) {
      throw AppError.conflict([
        {
          path: "status",
          message: "The last active Admin cannot be disabled",
        },
      ])
    }

    const [updated] = await tx
      .update(user)
      .set({ status: "deactivated", updatedAt: new Date() })
      .where(eq(user.id, target.id))
      .returning()
    if (!updated) {
      throw AppError.internal()
    }

    await tx.delete(session).where(eq(session.userId, target.id))
    await deleteTrustedDevicesForUser(target.id, tx)

    await writeAudit(tx, {
      ...auditActor(actor),
      action: "user.disabled",
      objectType: "user",
      objectId: updated.id,
      before: { status: target.status, role: target.role },
      after: { status: "deactivated", role: updated.role },
    })
    return { ...serializeUser(updated), already_disabled: false }
  })
}

export async function resetManagedUserTwoFactor(
  userId: string,
  actor: UserActor,
  db: Database = getDb()
): Promise<void> {
  if (isSameUser(actor.userId, userId)) {
    throw AppError.forbidden([
      {
        path: "userId",
        message: "You cannot reset your own two-factor authentication",
      },
    ])
  }

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!existing) {
    throw AppError.notFound([{ path: "userId", message: "User not found" }])
  }

  await resetTwoFactorForAdmin(userId, {
    actorId: actor.userId,
    requestId: actor.requestId,
  })
}

const INVITE_IDENTIFIER_PREFIX = "user-invite:"

function statusRank(status: ManagedUserJson["status"]): number {
  if (status === "active") return 0
  if (status === "invited") return 1
  return 2
}

export async function listUsers(
  db: Database = getDb(),
  now: Date = new Date()
): Promise<ManagedUserJson[]> {
  const [userRows, twoFactorRows, sessionRows, inviteRows] = await Promise.all([
    db.select().from(user).orderBy(asc(user.createdAt), asc(user.id)),
    db
      .select({
        userId: twoFactor.userId,
        failedVerificationCount: twoFactor.failedVerificationCount,
        failureWindowStartedAt: twoFactor.failureWindowStartedAt,
        lockedUntil: twoFactor.lockedUntil,
        consecutiveLockoutCount: twoFactor.consecutiveLockoutCount,
        lastCountedLockoutUntil: twoFactor.lastCountedLockoutUntil,
      })
      .from(twoFactor),
    db
      .select({
        userId: session.userId,
        lastSignInAt: sql<Date | null>`max(${session.createdAt})`,
      })
      .from(session)
      .groupBy(session.userId),
    db
      .select()
      .from(verification)
      .where(
        and(
          like(verification.identifier, `${INVITE_IDENTIFIER_PREFIX}%`),
          gt(verification.expiresAt, now)
        )
      )
      .orderBy(asc(verification.createdAt), asc(verification.id)),
  ])

  const lockedByUserId = new Map<string, boolean>()
  for (const row of twoFactorRows) {
    const status = getLockoutStatus(
      {
        failedVerificationCount: row.failedVerificationCount,
        failureWindowStartedAt: row.failureWindowStartedAt,
        lockedUntil: row.lockedUntil,
        consecutiveLockoutCount: row.consecutiveLockoutCount,
        lastCountedLockoutUntil: row.lastCountedLockoutUntil,
      },
      now
    )
    lockedByUserId.set(row.userId, status === "admin_required")
  }

  const lastSignInByUserId = new Map<string, string>()
  for (const row of sessionRows) {
    if (row.lastSignInAt instanceof Date) {
      lastSignInByUserId.set(row.userId, row.lastSignInAt.toISOString())
    } else if (typeof row.lastSignInAt === "string") {
      lastSignInByUserId.set(row.userId, row.lastSignInAt)
    }
  }

  const existingEmails = new Set<string>()
  const managed: ManagedUserJson[] = userRows.map((row) => {
    existingEmails.add(normaliseEmail(row.email))
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      status: row.status,
      two_factor_enabled: row.twoFactorEnabled,
      two_factor_locked: lockedByUserId.get(row.id) ?? false,
      last_sign_in_at: lastSignInByUserId.get(row.id) ?? null,
      expires_at: null,
    }
  })

  const seenInviteEmails = new Set<string>()
  for (const invite of inviteRows) {
    if (!invite.identifier.startsWith(INVITE_IDENTIFIER_PREFIX)) {
      continue
    }
    const email = normaliseEmail(
      invite.identifier.slice(INVITE_IDENTIFIER_PREFIX.length)
    )
    if (!email || existingEmails.has(email) || seenInviteEmails.has(email)) {
      continue
    }
    const parsed = parseInvitationValue(invite.value)
    if (!parsed) {
      continue
    }
    seenInviteEmails.add(email)
    managed.push({
      id: invite.id,
      email,
      name: null,
      role: parsed.role,
      status: "invited",
      two_factor_enabled: false,
      two_factor_locked: false,
      last_sign_in_at: null,
      expires_at: invite.expiresAt.toISOString(),
    })
  }

  managed.sort((a, b) => statusRank(a.status) - statusRank(b.status))
  return managed
}

function isForeignKeyViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false
  }
  const rec = error as { code?: unknown; cause?: unknown }
  if (rec.code === "23503") {
    return true
  }
  if (rec.cause && typeof rec.cause === "object") {
    return (rec.cause as { code?: unknown }).code === "23503"
  }
  return false
}

export async function revokeInvitation(
  invitationId: string,
  actor: UserActor,
  db: Database = getDb()
): Promise<{ id: string; deleted: true }> {
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(verification)
      .where(
        and(
          eq(verification.id, invitationId),
          like(verification.identifier, `${INVITE_IDENTIFIER_PREFIX}%`)
        )
      )
      .limit(1)
      .for("update")

    if (!row) {
      throw AppError.notFound()
    }

    const email = normaliseEmail(
      row.identifier.slice(INVITE_IDENTIFIER_PREFIX.length)
    )
    const parsed = parseInvitationValue(row.value)

    await tx.delete(verification).where(eq(verification.id, row.id))
    await writeAudit(tx, {
      ...auditActor(actor),
      action: "user.invitation_revoked",
      objectType: "user_invitation",
      objectId: row.id,
      before: {
        email,
        role: parsed?.role ?? null,
        expires_at: row.expiresAt.toISOString(),
      },
      after: null,
    })

    return { id: row.id, deleted: true as const }
  })

  return deleted
}

export async function deleteUser(
  userId: string,
  actor: UserActor,
  db: Database = getDb()
): Promise<{ id: string; deleted: true }> {
  if (isSameUser(actor.userId, userId)) {
    throw AppError.forbidden([
      { path: "userId", message: "You cannot delete your own account" },
    ])
  }

  try {
    return await db.transaction(async (tx) => {
      await lockActiveAdmins(tx)
      const target = await loadUserForUpdate(tx, userId)
      if (!target) {
        throw AppError.notFound()
      }

      if (isActiveAdmin(target)) {
        const activeAdmins = await countActiveAdmins(tx)
        if (
          removalLeavesNoActiveAdmin({
            targetIsActiveAdmin: true,
            activeAdminCount: activeAdmins,
          })
        ) {
          throw AppError.conflict([
            { path: "userId", message: "Cannot delete the last active admin" },
          ])
        }
      }

      await tx.delete(session).where(eq(session.userId, userId))
      await deleteTrustedDevicesForUser(userId, tx)
      await tx.delete(twoFactor).where(eq(twoFactor.userId, userId))
      await consumeInvitation(tx, target.email)
      await tx.delete(user).where(eq(user.id, userId))

      await writeAudit(tx, {
        ...auditActor(actor),
        action: "user.deleted",
        objectType: "user",
        objectId: userId,
        before: {
          email: target.email,
          role: target.role,
          status: target.status,
        },
        after: null,
      })

      return { id: userId, deleted: true as const }
    })
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw AppError.conflict([
        {
          path: "userId",
          message:
            "This user has authored records and cannot be permanently deleted. Disable their account instead.",
        },
      ])
    }
    throw error
  }
}
